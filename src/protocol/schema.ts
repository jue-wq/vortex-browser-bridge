import { z } from "zod";

const RequestId = z.string().min(1).max(128);
const HttpUrl = z.string().url().max(8192);
const HeaderMap = z.record(z.string().min(1).max(256), z.string().max(16_384)).superRefine((headers, context) => {
  if (Object.keys(headers).length > 64) context.addIssue({ code: "custom", message: "At most 64 headers are allowed" });
});
const CookieSchema = z.object({
  name: z.string().min(1).max(256),
  value: z.string().max(16_384),
  domain: z.string().max(255).optional(),
  path: z.string().max(4096).optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  expirationDate: z.number().finite().optional(),
  sameSite: z.string().max(32).optional()
});

export const HandshakeSchema = z.object({
  type: z.literal("handshake"),
  protocol_version: z.literal(1),
  extension_version: z.string().min(1).max(64),
  capabilities: z.array(z.string().min(1).max(64)).max(32)
});

export const AddDownloadSchema = z.object({
  type: z.literal("add_download"),
  request_id: RequestId.optional(),
  url: HttpUrl,
  filename: z.string().max(1024).optional(),
  headers: HeaderMap.optional(),
  cookies: z.array(CookieSchema).max(256).optional(),
  referrer: z.string().max(8192).optional(),
  download_page: z.string().max(8192).optional(),
  auto_start: z.boolean().optional(),
  queue_id: z.string().max(128).optional()
});

export const ExtractMediaSchema = z.object({
  type: z.literal("extract_media"),
  request_id: RequestId.optional(),
  webpage_url: HttpUrl,
  page_title: z.string().max(2048).optional(),
  user_agent: z.string().max(1024).optional(),
  cookies: z.array(CookieSchema).max(256).optional(),
  playlist_mode: z.boolean().optional()
});

export const AddBatchSchema = z.object({
  type: z.literal("add_batch"),
  request_id: RequestId.optional(),
  batch_id: z.string().min(1).max(128).optional(),
  links: z.array(z.object({
    url: HttpUrl,
    filename: z.string().max(1024).optional(),
    headers: HeaderMap.optional(),
    referrer: HttpUrl.optional()
  })).min(1).max(500),
  queue_id: z.string().max(128).optional(),
  auto_start: z.boolean().optional(),
  chunk_index: z.number().int().nonnegative().max(127).optional(),
  chunk_total: z.number().int().positive().max(128).optional()
}).superRefine((message, context) => {
  const hasChunkMetadata = message.chunk_index !== undefined || message.chunk_total !== undefined;
  if (hasChunkMetadata && (message.chunk_index === undefined || message.chunk_total === undefined)) {
    context.addIssue({ code: "custom", message: "chunk_index and chunk_total must be supplied together" });
  }
  if (message.chunk_total !== undefined && message.chunk_index !== undefined &&
      message.chunk_index >= message.chunk_total) {
    context.addIssue({ code: "custom", message: "chunk_index must be less than chunk_total" });
  }
  if ((message.chunk_total ?? 1) > 1 && !message.batch_id) {
    context.addIssue({ code: "custom", message: "batch_id is required for multi-chunk batches" });
  }
});

export const TaskControlSchema = z.object({
  type: z.literal("task_control"),
  request_id: RequestId.optional(),
  action: z.enum(["pause", "resume", "focus_app"]),
  task_id: z.string().max(128).optional()
});

export const OutboundMessageSchema = z.discriminatedUnion("type", [
  HandshakeSchema,
  AddDownloadSchema,
  ExtractMediaSchema,
  AddBatchSchema,
  TaskControlSchema
]);

export const AckSchema = z.object({
  type: z.literal("ack"),
  request_id: RequestId,
  accepted: z.boolean(),
  error: z.string().max(2048).optional()
});

export const StatusUpdateSchema = z.object({
  type: z.literal("status_update"),
  active_downloads: z.array(z.object({
    id: z.string().min(1).max(128),
    filename: z.string().max(1024),
    progress: z.number().finite().min(0).max(100).optional(),
    speed: z.number().finite().nonnegative().optional(),
    status: z.string().min(1).max(64)
  })).max(1000),
  total_speed: z.number().finite().nonnegative().optional(),
  theme: z.enum(["modern-dark", "pure-oled", "modern-light"]).optional()
});

export const QueuesSyncSchema = z.object({
  type: z.literal("queues_sync"),
  queues: z.array(z.object({
    id: z.string().min(1).max(128),
    name: z.string().min(1).max(256),
    category: z.string().max(128).optional()
  })).max(256)
});

export const InboundMessageSchema = z.discriminatedUnion("type", [
  AckSchema,
  StatusUpdateSchema,
  QueuesSyncSchema
]);

export type OutboundMessage = z.infer<typeof OutboundMessageSchema>;
export type InboundMessage = z.infer<typeof InboundMessageSchema>;
export type AddBatchMessage = z.infer<typeof AddBatchSchema>;
export type AckMessage = z.infer<typeof AckSchema>;
