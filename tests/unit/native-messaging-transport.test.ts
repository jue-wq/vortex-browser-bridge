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

  it("rejects pending requests when the host disconnects", async () => {
    await transport.connect();
    const pending = transport.send(request);
    runtimeState.lastError = { message: "host exited" };
    port.onDisconnect.emit();
    await expect(pending).rejects.toThrow("host exited");
  });
});
