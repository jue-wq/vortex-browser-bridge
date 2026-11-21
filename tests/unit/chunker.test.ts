import { describe, expect, it } from "vitest";
import { chunkBatch } from "../../src/protocol/chunker";
import type { AddBatchMessage } from "../../src/protocol/schema";

const makeMessage = (count: number): AddBatchMessage => ({
  type: "add_batch",
  links: Array.from({ length: count }, (_, index) => ({
    url: `https://example.com/file-${index}.bin`,
    filename: `file-${index}.bin`
  }))
});

describe("chunkBatch", () => {
  it("keeps a small batch in one chunk", () => {
    const chunks = chunkBatch(makeMessage(3));
    expect(chunks).toHaveLength(1);
    expect(chunks[0]?.chunk_index).toBe(0);
    expect(chunks[0]?.chunk_total).toBe(1);
    expect(chunks[0]?.batch_id).toBeUndefined();
  });
  it("splits batches under the configured byte budget", () => {
    const chunks = chunkBatch(makeMessage(20), 1024);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk, index) => chunk.chunk_index === index)).toBe(true);
    expect(chunks.every((chunk) => chunk.chunk_total === chunks.length)).toBe(true);
    expect(chunks.every((chunk) => chunk.batch_id === chunks[0]?.batch_id)).toBe(true);
    expect(chunks[0]?.batch_id).toBeTruthy();
    expect(chunks.flatMap((chunk) => chunk.links)).toHaveLength(20);
  });
  it("does not copy one request ID onto every chunk", () => {
    const chunks = chunkBatch({ ...makeMessage(20), request_id: "caller-request" }, 1024);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.request_id === undefined)).toBe(true);
  });
  it("rejects an invalid byte budget", () => {
    expect(() => chunkBatch(makeMessage(1), 10)).toThrow(RangeError);
  });
});
