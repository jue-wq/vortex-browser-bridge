import { InboundMessageSchema, type InboundMessage, type OutboundMessage } from "../protocol/schema";
import type { DisconnectListener, ITransport, MessageListener } from "./ITransport";

export interface HttpFallbackConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  timeoutMs?: number;
}

export class HttpFallbackTransport implements ITransport {
  private readonly messageListeners = new Set<MessageListener>();
  private readonly disconnectListeners = new Set<DisconnectListener>();

  constructor(private readonly config: HttpFallbackConfig) {}

  async connect(): Promise<void> {
    if (!this.config.enabled) throw new Error("HTTP fallback is disabled");
    const url = new URL(this.config.baseUrl);
    if (url.protocol !== "http:" || !["127.0.0.1", "localhost"].includes(url.hostname)) {
      throw new Error("HTTP fallback is restricted to localhost over HTTP");
    }
    if (!this.config.apiKey.trim()) throw new Error("HTTP fallback requires an API key");
  }

  disconnect(): void {
    // HTTP requests are short-lived; there is no persistent connection to close.
  }

  async send(message: OutboundMessage): Promise<void> {
    await this.connect();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.config.timeoutMs ?? 5000);
    try {
      const response = await fetch(new URL("/v1/ipc", this.config.baseUrl), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Vortex-Api-Key": this.config.apiKey
        },
        body: JSON.stringify(message),
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`HTTP fallback failed: ${response.status}`);
      const body: unknown = await response.json().catch(() => null);
      const parsed = InboundMessageSchema.safeParse(body);
      if (parsed.success) {
        for (const listener of this.messageListeners) listener(parsed.data);
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  onMessage(listener: MessageListener): () => void {
    this.messageListeners.add(listener);
    return () => this.messageListeners.delete(listener);
  }

  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnectListeners.add(listener);
    return () => this.disconnectListeners.delete(listener);
  }
}
