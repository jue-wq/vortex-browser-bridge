import { z } from "zod";

const RequestId = z.string().min(1).max(128);
const CookieSchema = z.object({
  name: z.string(),
  value: z.string(),
  domain: z.string().optional(),
  path: z.string().optional(),
  secure: z.boolean().optional(),
  httpOnly: z.boolean().optional(),
  expirationDate: z.number().optional(),
  sameSite: z.string().optional()
}).passthrough();

export const HandshakeSchema = z.object({
  type: z.literal("handshake"),
  protocol_version: z.literal(1),
  extension_version: z.string().min(1),
  capabilities: z.array(z.string())
});

export const AddDownloadSchema = z.object({
  type: z.literal("add_download"),
  request_id: RequestId.optional(),
  url: z.string().url(),
  filename: z.string().optional(),
  headers: z.record(z.string()).optional(),
  cookies: z.array(CookieSchema).optional(),
  referrer: z.string().optional(),
  download_page: z.string().optional(),
  auto_start: z.boolean().optional(),
  queue_id: z.string().optional()
});

export const ExtractMediaSchema = z.object({
  type: z.literal("extract_media"),
  request_id: RequestId.optional(),
  webpage_url: z.string().url(),
  page_title: z.string().optional(),
  user_agent: z.string().optional(),
  cookies: z.array(CookieSchema).optional(),
  playlist_mode: z.boolean().optional()
});

export const AddBatchSchema = z.object({
  type: z.literal("add_batch"),
  request_id: RequestId.optional(),
  batch_id: z.string().min(1).max(128).optional(),
  links: z.array(z.object({
    url: z.string().url(),
    filename: z.string().optional(),
    headers: z.record(z.string()).optional(),
    referrer: z.string().optional()
  })).min(1),
  queue_id: z.string().optional(),
  auto_start: z.boolean().optional(),
  chunk_index: z.number().int().nonnegative().optional(),
  chunk_total: z.number().int().positive().optional()
});

export const TaskControlSchema = z.object({
  type: z.literal("task_control"),
  request_id: RequestId.optional(),
  action: z.enum(["pause", "resume", "focus_app"]),
  task_id: z.string().optional()
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
  error: z.string().optional()
});

export const StatusUpdateSchema = z.object({
  type: z.literal("status_update"),
  active_downloads: z.array(z.object({
    id: z.string(),
    filename: z.string(),
    progress: z.number().min(0).max(100).optional(),
    speed: z.number().nonnegative().optional(),
    status: z.string()
  })),
  total_speed: z.number().nonnegative().optional(),
  theme: z.enum(["modern-dark", "pure-oled", "modern-light"]).optional()
});

export const QueuesSyncSchema = z.object({
  type: z.literal("queues_sync"),
  queues: z.array(z.object({
    id: z.string(),
    name: z.string(),
    category: z.string().optional()
  }))
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
