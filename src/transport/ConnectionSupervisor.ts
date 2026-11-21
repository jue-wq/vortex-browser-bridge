import type { OutboundMessage } from "../protocol/schema";
import type { DisconnectListener } from "./ITransport";
import { ConnectionManager } from "./ConnectionManager";

export interface ReconnectScheduler {
  schedule(delayMs: number): void;
  cancel(): void;
}

/**
 * Owns the native-host handshake and reconnect lifecycle.
 * MV3 callers use browser.alarms for retries so service-worker suspension
 * cannot silently discard a timer.
 */
export class ConnectionSupervisor {
  private started = false;
  private retryAttempt = 0;
  private lifecycleGeneration = 0;
  private connecting: Promise<void> | null = null;
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

  /** Send only after a successful handshake; used by all capture entrypoints. */
  async send(message: OutboundMessage): Promise<void> {
    if (!this.started) this.start();
    if (this.connecting) await this.connecting;
    else await this.connectNow();
    if (!this.connection.isConnected) throw new Error("VortexDM native host is not connected");
    await this.connection.send(message);
  }

  /** Called by the alarm handler when a scheduled retry fires. */
  async retry(): Promise<void> {
    if (!this.started || this.connection.isConnected) return;
    await this.connectNow();
  }

  stop(): void {
    this.started = false;
    this.lifecycleGeneration += 1;
    this.scheduler.cancel();
    this.unsubscribeDisconnect?.();
    this.unsubscribeDisconnect = null;
    this.connection.disconnect();
  }

  private async connectNow(): Promise<void> {
    if (!this.started) return;
    if (this.connecting) return this.connecting;
    if (this.connection.isConnected) return;

    const generation = this.lifecycleGeneration;
    this.connecting = (async () => {
      try {
        await this.connection.connect();
        if (!this.started || generation !== this.lifecycleGeneration) {
          this.connection.disconnect();
          return;
        }
        await this.connection.send(this.handshake());
        if (!this.started || generation !== this.lifecycleGeneration) {
          this.connection.disconnect();
          return;
        }
        this.retryAttempt = 0;
        this.scheduler.cancel();
        this.onState?.("connected");
      } catch (error) {
        this.connection.disconnect();
        this.onState?.("disconnected", error instanceof Error ? error.message : String(error));
        this.scheduleRetry();
      }
    })().finally(() => {
      this.connecting = null;
    });

    return this.connecting;
  }

  private scheduleRetry(): void {
    if (!this.started) return;
    const delayMs = Math.min(15 * 60_000, 30_000 * (2 ** this.retryAttempt));
    this.retryAttempt = Math.min(this.retryAttempt + 1, 5);
    this.scheduler.schedule(delayMs);
  }
}
