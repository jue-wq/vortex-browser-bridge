import type { InboundMessage, OutboundMessage } from "../protocol/schema";

export type MessageListener = (message: InboundMessage) => void;
export type DisconnectListener = (reason?: string) => void;

export interface ITransport {
  connect(): Promise<void>;
  disconnect(): void;
  send(message: OutboundMessage): Promise<void>;
  onMessage(listener: MessageListener): () => void;
  onDisconnect(listener: DisconnectListener): () => void;
}
