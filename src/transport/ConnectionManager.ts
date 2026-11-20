import type { InboundMessage, OutboundMessage } from "../protocol/schema";
import type { ITransport, MessageListener } from "./ITransport";

export class ConnectionManager {
  private connected = false;
  private readonly listeners = new Set<MessageListener>();
  private unsubscribeMessage: (() => void) | null = null;
  private unsubscribeDisconnect: (() => void) | null = null;

  constructor(private readonly transport: ITransport) {}

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.transport.connect();
    this.unsubscribeMessage = this.transport.onMessage((message) => {
      for (const listener of this.listeners) listener(message);
    });
    this.unsubscribeDisconnect = this.transport.onDisconnect(() => {
      this.connected = false;
    });
    this.connected = true;
  }

  async send(message: OutboundMessage): Promise<void> {
    if (!this.connected) await this.connect();
    await this.transport.send(message);
  }

  onMessage(listener: MessageListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
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
