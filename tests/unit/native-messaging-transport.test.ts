import { beforeEach, describe, expect, it, vi } from "vitest";

const { connectNative, runtimeState } = vi.hoisted(() => ({
  connectNative: vi.fn(),
  runtimeState: { lastError: undefined as { message: string } | undefined }
}));

vi.mock("webextension-polyfill", () => ({
  default: { runtime: { connectNative, get lastError() { return runtimeState.lastError; } } }
}));

import { NativeMessagingTransport } from "../../src/transport/NativeMessagingTransport";
import type { OutboundMessage } from "../../src/protocol/schema";

class Event<T extends (...args: never[]) => void> {
  listeners = new Set<T>();
  addListener(listener: T): void { this.listeners.add(listener); }
  removeListener(listener: T): void { this.listeners.delete(listener); }
  emit(...args: Parameters<T>): void { for (const listener of this.listeners) listener(...args); }
}

class FakePort {
  onMessage = new Event<(message: unknown) => void>();
  onDisconnect = new Event<() => void>();
  posted: unknown[] = [];
  postMessage = vi.fn((message: unknown) => { this.posted.push(message); });
  disconnect = vi.fn(() => this.onDisconnect.emit());
}

const request: OutboundMessage = {
  type: "add_download",
  request_id: "r-1",
  url: "https://example.com/file.bin"
};

describe("NativeMessagingTransport", () => {
  let port: FakePort;
  let transport: NativeMessagingTransport;

  beforeEach(() => {
    port = new FakePort();
    connectNative.mockReset().mockReturnValue(port);
    runtimeState.lastError = undefined;
    transport = new NativeMessagingTransport("com.vortexdm.native_host", 100);
  });

  it("sends a handshake without waiting for an ACK", async () => {
    await transport.connect();
    await transport.send({
      type: "handshake", protocol_version: 1,
      extension_version: "0.1.0", capabilities: []
    });
    expect(port.postMessage).toHaveBeenCalledTimes(1);
  });

  it("resolves a request only after a positive matching ACK", async () => {
    await transport.connect();
    const pending = transport.send(request);
    port.onMessage.emit({ type: "ack", request_id: "r-1", accepted: true });
    await expect(pending).resolves.toBeUndefined();
  });

  it("rejects a negative ACK", async () => {
    await transport.connect();
    const pending = transport.send(request);
    port.onMessage.emit({ type: "ack", request_id: "r-1", accepted: false, error: "queue full" });
    await expect(pending).rejects.toThrow("queue full");
  });

  it("rejects duplicate pending request IDs instead of replacing the first waiter", async () => {
    await transport.connect();
    const first = transport.send(request);
    await expect(transport.send(request)).rejects.toThrow("Duplicate pending Native Messaging request ID");
    port.onMessage.emit({ type: "ack", request_id: "r-1", accepted: true });
    await expect(first).resolves.toBeUndefined();
  });

  it("allows up to 15 seconds for the default native-host ACK window", async () => {
    vi.useFakeTimers();
    try {
      transport = new NativeMessagingTransport();
      await transport.connect();
      const pending = transport.send(request);
      let rejected = false;
      const rejection = pending.catch((error: Error) => {
        rejected = true;
        expect(error.message).toContain("acknowledgement timed out");
      });
      await vi.advanceTimersByTimeAsync(14_999);
      expect(rejected).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      await rejection;
      expect(rejected).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("rejects a request when the ACK deadline expires", async () => {
    transport = new NativeMessagingTransport("com.vortexdm.native_host", 5);
    await transport.connect();
    await expect(transport.send(request)).rejects.toThrow("acknowledgement timed out");
  });

  it("rejects pending requests when the host disconnects", async () => {
    await transport.connect();
    const pending = transport.send(request);
    runtimeState.lastError = { message: "host exited" };
    port.onDisconnect.emit();
    await expect(pending).rejects.toThrow("host exited");
  });

  it("rejects pending requests immediately on an intentional disconnect", async () => {
    await transport.connect();
    const pending = transport.send(request);
    transport.disconnect();
    await expect(pending).rejects.toThrow("Native Messaging disconnected");
  });

  it("ignores a delayed disconnect event from a stale port after reconnect", async () => {
    const oldPort = new FakePort();
    const newPort = new FakePort();
    connectNative.mockReset().mockReturnValueOnce(oldPort).mockReturnValueOnce(newPort);
    await transport.connect();
    transport.disconnect();
    await transport.connect();

    oldPort.onDisconnect.emit();
    const pending = transport.send({ ...request, request_id: "new-port-request" });
    newPort.onMessage.emit({ type: "ack", request_id: "new-port-request", accepted: true });

    await expect(pending).resolves.toBeUndefined();
    expect(newPort.postMessage).toHaveBeenCalledTimes(1);
  });
});
