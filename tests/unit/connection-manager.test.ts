import { describe, expect, it, vi } from "vitest";
import type { InboundMessage, OutboundMessage } from "../../src/protocol/schema";
import type { DisconnectListener, ITransport, MessageListener } from "../../src/transport/ITransport";
import { ConnectionManager } from "../../src/transport/ConnectionManager";

class FakeTransport implements ITransport {
  connect = vi.fn(async () => undefined);
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
  emit(message: InboundMessage): void {
    for (const listener of this.messages) listener(message);
  }
  drop(): void {
    for (const listener of this.disconnects) listener("test disconnect");
  }
}

describe("ConnectionManager", () => {
  it("coalesces concurrent connection attempts", async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport);
    await Promise.all([manager.connect(), manager.connect(), manager.connect()]);
    expect(transport.connect).toHaveBeenCalledTimes(1);
    expect(manager.isConnected).toBe(true);
  });

  it("does not become connected when disconnected during a pending connect", async () => {
    const transport = new FakeTransport();
    let resolveConnect!: () => void;
    transport.connect = vi.fn(() => new Promise<void>((resolve) => {
      resolveConnect = resolve;
    }));
    const onMessage = vi.spyOn(transport, "onMessage");
    const manager = new ConnectionManager(transport);

    const pending = manager.connect();
    manager.disconnect();
    resolveConnect();
    await pending;

    expect(manager.isConnected).toBe(false);
    expect(onMessage).not.toHaveBeenCalled();
  });

  it("forwards validated inbound messages to subscribers", async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport);
    const listener = vi.fn();
    manager.onMessage(listener);
    await manager.connect();
    const update: InboundMessage = { type: "queues_sync", queues: [] };
    transport.emit(update);
    expect(listener).toHaveBeenCalledWith(update);
  });

  it("marks itself disconnected when the transport drops", async () => {
    const transport = new FakeTransport();
    const manager = new ConnectionManager(transport);
    await manager.connect();
    transport.drop();
    expect(manager.isConnected).toBe(false);
  });
});
