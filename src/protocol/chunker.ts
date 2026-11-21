import { AddBatchSchema, type AddBatchMessage } from "./schema";

const encoder = new TextEncoder();

function byteLength(value: unknown): number {
  return encoder.encode(JSON.stringify(value)).byteLength;
}

/**
 * Split a batch into protocol-safe messages. The safety margin keeps the
 * serialized Native Messaging frame below the documented 1 MiB ceiling.
 */
export function chunkBatch(
  message: AddBatchMessage,
  maxBytes = 900 * 1024
): AddBatchMessage[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 1024) {
    throw new RangeError("maxBytes must be an integer of at least 1024 bytes");
  }

  const { links, ...metadata } = message;
  // Each frame needs its own ACK correlation ID; the transport assigns it.
  delete metadata.request_id;
  const chunks: AddBatchMessage[] = [];
  let current: typeof links = [];

  for (const link of links) {
    const candidate = [...current, link];
    const probe = { ...metadata, links: candidate, chunk_index: 0, chunk_total: 1 };
    if (byteLength(probe) > maxBytes) {
      if (current.length === 0) {
        throw new RangeError("A single batch item exceeds the configured message limit");
      }
      chunks.push(AddBatchSchema.parse({ ...metadata, links: current }));
      current = [link];
      const singleProbe = { ...metadata, links: current, chunk_index: 0, chunk_total: 1 };
      if (byteLength(singleProbe) > maxBytes) {
        throw new RangeError("A single batch item exceeds the configured message limit");
      }
    } else {
      current = candidate;
    }
  }

  if (current.length > 0) {
    chunks.push(AddBatchSchema.parse({ ...metadata, links: current }));
  }

  const batchId = chunks.length > 1 ? crypto.randomUUID() : undefined;
  return chunks.map((chunk, index) => AddBatchSchema.parse({
    ...chunk,
    ...(batchId ? { batch_id: batchId } : {}),
    chunk_index: index,
    chunk_total: chunks.length
  }));
}
