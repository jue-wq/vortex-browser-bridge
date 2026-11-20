import { describe, expect, it, vi } from "vitest";
import type { OutboundMessage, InboundMessage } from "../../src/protocol/schema";
import type { DisconnectListener, ITransport, MessageListener } from "../../src/transport/ITransport";
import { ConnectionManager } from "../../src/transport/ConnectionManager";
import { ConnectionSupervisor, type ReconnectScheduler } from "../../src/transport/ConnectionSupervisor";

class FakeTransport implements ITransport {
  connect = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  disconnect = vi.fn();
  send = vi.fn(async (_message: OutboundMessage) => undefined);
  private messages = new Set<MessageListener>();
  private disconnects = new Set<DisconnectListener>();
  onMessage(listener: MessageListener): () => void {
    this.messages.add(listener);
    return () => this.messages.delete(listener);
  }
  onDisconnect(listener: DisconnectListener): () => void {
    this.disconnects.add(listener);
    return () => this.disconnects.delete(listener);
  }
  drop(): void {
    for (const listener of this.disconnects) listener("host exited");
  }
  emit(_message: InboundMessage): void {}
}

class FakeScheduler implements ReconnectScheduler {
  delays: number[] = [];
  cancelled = 0;
  schedule(delayMs: number): void { this.delays.push(delayMs); }
  cancel(): void { this.cancelled += 1; }
}

const handshake: OutboundMessage = {
  type: "handshake",
  protocol_version: 1,
  extension_version: "0.1.0",
  capabilities: ["native_messaging"]
};

describe("ConnectionSupervisor", () => {
  it("retries failed connections with capped exponential backoff", async () => {
    const transport = new FakeTransport();
    transport.connect
      .mockRejectedValueOnce(new Error("host missing"))
      .mockRejectedValueOnce(new Error("host still missing"));
    const scheduler = new FakeScheduler();
    const supervisor = new ConnectionSupervisor(
      new ConnectionManager(transport), () => handshake, scheduler
    );

    supervisor.start();
    await vi.waitFor(() => expect(scheduler.delays).toEqual([1_000]));
    await supervisor.retry();
    expect(scheduler.delays).toEqual([1_000, 2_000]);

    supervisor.stop();
    expect(scheduler.cancelled).toBeGreaterThan(0);
  });

  it("schedules a reconnect after an established port disconnects", async () => {
    const transport = new FakeTransport();
    const scheduler = new FakeScheduler();
    const supervisor = new ConnectionSupervisor(
      new ConnectionManager(transport), () => handshake, scheduler
    );

    supervisor.start();
    await vi.waitFor(() => expect(transport.send).toHaveBeenCalledWith(handshake));
    transport.drop();

    expect(scheduler.delays).toEqual([1_000]);
    supervisor.stop();
  });

  it("resets retry delay after a successful handshake", async () => {
    const transport = new FakeTransport();
    transport.connect.mockRejectedValueOnce(new Error("host missing"));
    const scheduler = new FakeScheduler();
    const supervisor = new ConnectionSupervisor(
      new ConnectionManager(transport), () => handshake, scheduler
    );

    supervisor.start();
    await vi.waitFor(() => expect(scheduler.delays).toEqual([1_000]));
    await supervisor.retry();
    expect(scheduler.cancelled).toBeGreaterThan(0);
    transport.drop();
    expect(scheduler.delays).toEqual([1_000, 1_000]);

    supervisor.stop();
  });
});
