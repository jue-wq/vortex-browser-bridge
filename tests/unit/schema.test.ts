import { describe, expect, it } from "vitest";
import { InboundMessageSchema, OutboundMessageSchema } from "../../src/protocol/schema";

describe("IPC schemas", () => {
  it("accepts a valid handshake", () => {
    expect(OutboundMessageSchema.safeParse({
      type: "handshake", protocol_version: 1,
      extension_version: "0.1.0", capabilities: ["native_messaging"]
    }).success).toBe(true);
  });
  it("rejects unsupported protocol versions", () => {
    expect(OutboundMessageSchema.safeParse({
      type: "handshake", protocol_version: 2,
      extension_version: "0.1.0", capabilities: []
    }).success).toBe(false);
  });
  it("accepts a positive acknowledgement", () => {
    expect(InboundMessageSchema.safeParse({
      type: "ack", request_id: "request-1", accepted: true
    }).success).toBe(true);
  });
  it("rejects malformed status updates", () => {
    expect(InboundMessageSchema.safeParse({
      type: "status_update",
      active_downloads: [{ id: "1", filename: "x", progress: 120, status: "downloading" }]
    }).success).toBe(false);
  });
});
