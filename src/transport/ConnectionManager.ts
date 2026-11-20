import type { OutboundMessage } from "../protocol/schema";
import type { DisconnectListener, ITransport, MessageListener } from "./ITransport";

export class ConnectionManager {
  private connected = false;
  private connecting: Promise<void> | null = null;
  private readonly listeners = new Set<MessageListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();
  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeDisconnect: (() => void) | null = null;

  constructor(private readonly transport: ITransport) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    if (this.connecting) return this.connecting;

    this.connecting = this.transport.connect().then(() => {
      this.unsubscribeMessage = this.transport.onMessage((message) => {
        for (const listener of this.listeners) listener(message);
      });
      this.unsubscribeDisconnect = this.transport.onDisconnect((reason) => {
        this.connected = false;
        this.unsubscribeMessage?.();
        this.unsubscribeMessage = null;
        this.unsubscribeDisconnect = null;
        for (const listener of this.disconnectListeners) listener(reason);
      });
      this.connected = true;
    }).finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected) await this.connect();
    await this.transport.send(message);
  }

  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }

  disconnect(): void {
    this.unsubscribeMessage?.();
    this.unsubscribeDisconnect?.();
    this.unsubscribeMessage = null;
    this.unsubscribeDisconnect = null;
    this.transport.disconnect();
    this.connected = false;
  }

  get isConnected(): boolean {
    return this.connected;
  }
}
