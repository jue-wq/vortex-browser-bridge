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
  private readonly messageListeners = new Set<MessageListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private readonly pending = new Map<string, PendingRequest>();

  constructor(
    private readonly hostName = "com.vortexdm.native_host",
    private readonly ackTimeoutMs = 1500
  ) {}

  async connect(): Promise<void> {
    if (this.port) return;

    const port = browser.runtime.connectNative(this.hostName) as unknown as NativePort;
    this.port = port;
    port.onMessage.addListener(this.handleMessage);
    port.onDisconnect.addListener(this.handleDisconnect);
  }

  disconnect(): void {
    this.port?.disconnect();
    this.port = null;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.port) throw new Error("Native Messaging is not connected");

    const requestId = message.type === "handshake"
      ? undefined
      : (message.request_id ?? crypto.randomUUID());
    const payload = requestId ? { ...message, request_id: requestId } : message;

    if (!requestId) {
      this.port.postMessage(payload);
      return;
    }

    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(requestId);
        reject(new Error(`Native host acknowledgement timed out (${requestId})`));
      }, this.ackTimeoutMs);

      this.pending.set(requestId, { resolve, reject, timeout });
      try {
        this.port?.postMessage(payload);
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

  private readonly handleMessage = (raw: unknown): void => {
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
  };

  private readonly handleDisconnect = (): void => {
    const errorText = browser.runtime.lastError?.message ?? "Native host disconnected";
    this.port = null;
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(errorText));
      this.pending.delete(id);
    }
    for (const listener of this.disconnectListeners) listener(errorText);
  };
}
