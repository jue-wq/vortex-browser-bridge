import browser from "webextension-polyfill";
import { InboundMessageSchema, type InboundMessage, type OutboundMessage } from "../protocol/schema";
import type { DisconnectListener, ITransport, MessageListener } from "./ITransport";

interface NativePort {
  postMessage(message: unknown): void;
  disconnect(): void;
  onMessage: { addListener(callback: (message: unknown) => void): void; removeListener(callback: (message: unknown) => void): void };
  onDisconnect: { addListener(callback: () => void): void; removeListener(callback: () => void): void };
}

interface PendingRequest {
  resolve: () => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

export class NativeMessagingTransport implements ITransport {
  private port: NativePort | null = null;
  private messageHandler: ((message: unknown) => void) | null = null;
  private disconnectHandler: (() => void) | null = null;
  private readonly messageListeners = new Set<MessageListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly hostName = "com.vortexdm.native_host",
    private readonly ackTimeoutMs = 15_000
  ) {}

  async connect(): Promise<void> {
    if (this.port) return;

    const port = browser.runtime.connectNative(this.hostName) as unknown as NativePort;
    const onMessage = (raw: unknown): void => {
      if (this.port !== port) return;
      this.handleMessage(raw);
    };
    const onDisconnect = (): void => {
      if (this.port !== port) return;
      const errorText = browser.runtime.lastError?.message ?? "Native host disconnected";
      this.detachPort(port);
      this.rejectPending(errorText);
      for (const listener of this.disconnectListeners) listener(errorText);
    };

    this.port = port;
    this.messageHandler = onMessage;
    this.disconnectHandler = onDisconnect;
    port.onMessage.addListener(onMessage);
    port.onDisconnect.addListener(onDisconnect);
  }

  disconnect(): void {
    const port = this.port;
    if (!port) return;
    this.detachPort(port);
    this.rejectPending("Native Messaging disconnected");
    port.disconnect();
  }

  async send(message: OutboundMessage): Promise<void> {
    const port = this.port;
    if (!port) throw new Error("Native Messaging is not connected");

    const requestId = message.type === "handshake"
      ? undefined
      : (message.request_id ?? crypto.randomUUID());
    const payload = requestId ? { ...message, request_id: requestId } : message;

    if (!requestId) {
      port.postMessage(payload);
      return;
    }

    if (this.pending.has(requestId)) throw new Error("Duplicate pending Native Messaging request ID: " + requestId);

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error("Native host acknowledgement timed out (" + requestId + ")"));
      }, this.ackTimeoutMs);

      this.pending.set(requestId, { resolve, reject, timeout });
      try {
        if (this.port !== port) throw new Error("Native Messaging connection changed before send");
        port.postMessage(payload);
      } catch (error) {
        clearTimeout(timeout);
        this.pending.delete(requestId);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  private handleMessage(raw: unknown): void {
    const parsed = InboundMessageSchema.safeParse(raw);
    if (!parsed.success) return;

    const message: InboundMessage = parsed.data;
    if (message.type === "ack") {
      const pending = this.pending.get(message.request_id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pending.delete(message.request_id);
        if (message.accepted) pending.resolve();
        else pending.reject(new Error(message.error ?? "Native host rejected the request"));
      }
    }

    for (const listener of this.messageListeners) listener(message);
  }

  private detachPort(port: NativePort): void {
    if (this.port !== port) return;
    if (this.messageHandler) port.onMessage.removeListener(this.messageHandler);
    if (this.disconnectHandler) port.onDisconnect.removeListener(this.disconnectHandler);
    this.port = null;
    this.messageHandler = null;
    this.disconnectHandler = null;
  }

  private rejectPending(reason: string): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      this.pending.delete(id);
      pending.reject(new Error(reason));
    }
  }
}
