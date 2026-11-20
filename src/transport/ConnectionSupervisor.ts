import type { OutboundMessage } from "../protocol/schema";
import type { DisconnectListener } from "./ITransport";
import { ConnectionManager } from "./ConnectionManager";

export interface ReconnectScheduler {
  schedule(delayMs: number): void;
  cancel(): void;
}

/**
 * Keeps the native host connection alive with capped exponential backoff.
 * Scheduling is injected so MV3 can use browser.alarms rather than relying
 * on a service-worker timer that may be suspended.
 */
export class ConnectionSupervisor {
  private started = false;
  private retryAttempt = 0;
  private unsubscribeDisconnect: (() => void) | null = null;

  constructor(
    private readonly connection: ConnectionManager,
    private readonly handshake: () => OutboundMessage,
    private readonly scheduler: ReconnectScheduler,
    private readonly onState?: (state: "connected" | "disconnected", reason?: string) => void
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.unsubscribeDisconnect = this.connection.onDisconnect((reason) => {
      this.onState?.("disconnected", reason);
      this.scheduleRetry();
    });
    void this.connectNow();
  }

  /** Called by the alarm handler when the scheduled retry fires. */
  async retry(): Promise<void> {
    if (!this.started || this.connection.isConnected) return;
    await this.connectNow();
  }

  stop(): void {
    this.started = false;
    this.scheduler.cancel();
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.connection.disconnect();
  }

  private async connectNow(): Promise<void> {
    if (!this.started || this.connection.isConnected) return;
    try {
      await this.connection.connect();
      await this.connection.send(this.handshake());
      this.retryAttempt = 0;
      this.scheduler.cancel();
      this.onState?.("connected");
    } catch (error) {
      this.onState?.("disconnected", error instanceof Error ? error.message : String(error));
      this.scheduleRetry();
    }
  }

  private scheduleRetry(): void {
    if (!this.started) return;
    const delayMs = Math.min(30_000, 1_000 * (2 ** this.retryAttempt));
    this.retryAttempt = Math.min(this.retryAttempt + 1, 5);
    this.scheduler.schedule(delayMs);
  }
}
