import { describe, expect, it } from "vitest";
import { AddBatchSchema, InboundMessageSchema, OutboundMessageSchema } from "../../src/protocol/schema";

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

  it("rejects non-finite status values", () => {
    expect(InboundMessageSchema.safeParse({ type: "status_update", active_downloads: [], total_speed: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("rejects non-HTTP URL schemes at the IPC boundary", () => {
    expect(OutboundMessageSchema.safeParse({ type: "add_download", url: "file:///etc/passwd" }).success).toBe(false);
    expect(OutboundMessageSchema.safeParse({ type: "add_download", url: "ftp://example.com/file" }).success).toBe(false);
  });

  it("bounds collection sizes and string lengths", () => {
    expect(OutboundMessageSchema.safeParse({
      type: "handshake", protocol_version: 1,
      extension_version: "0.1.0", capabilities: Array(33).fill("native_messaging")
    }).success).toBe(false);
    expect(AddBatchSchema.safeParse({
      type: "add_batch",
      links: Array.from({ length: 501 }, () => ({ url: "https://example.com/file" }))
    }).success).toBe(false);
  });

  it("requires a stable batch ID for multiple chunks", () => {
    const base = { type: "add_batch", links: [{ url: "https://example.com/file" }], chunk_index: 0, chunk_total: 2 };
    expect(AddBatchSchema.safeParse(base).success).toBe(false);
    expect(AddBatchSchema.safeParse({ ...base, batch_id: "batch-1" }).success).toBe(true);
    expect(AddBatchSchema.safeParse({ ...base, batch_id: "batch-1", chunk_index: 2 }).success).toBe(false);
  });
});
