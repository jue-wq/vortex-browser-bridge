import { AddDownloadSchema, type OutboundMessage } from "../protocol/schema";

export interface BrowserDownloadItem {
  id: number;
  url: string;
  filename?: string;
  referrer?: string;
  incognito?: boolean;
  state?: string;
}

export type HandoffResult = "skipped" | "handed_off" | "kept_in_browser";

/**
 * Pause first, then hand off. The original browser download is cancelled only
 * after an explicit positive desktop ACK; failed handoffs resume it.
 */
export async function handoffBrowserDownload(
  item: BrowserDownloadItem,
  enabled: boolean,
  send: (message: OutboundMessage) => Promise<void>,
  pause: (downloadId: number) => Promise<void>,
  resume: (downloadId: number) => Promise<void>,
  cancel: (downloadId: number) => Promise<void>
): Promise<HandoffResult> {
  if (!enabled || item.incognito || (item.state && item.state !== "in_progress")) return "skipped";
  let parsedUrl: URL;
  try { parsedUrl = new URL(item.url); } catch { return "skipped"; }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return "skipped";

  try {
    await pause(item.id);
  } catch {
    // A completed or unpausable browser download must remain untouched.
    return "skipped";
  }

  try {
    await send(AddDownloadSchema.parse({
      type: "add_download",
      url: item.url,
      filename: item.filename?.split(/[\\/]/).filter(Boolean).pop(),
      referrer: item.referrer,
      download_page: item.referrer,
      auto_start: true
    }));
    await cancel(item.id);
    return "handed_off";
  } catch {
    try { await resume(item.id); } catch { /* Keep best-effort fallback non-fatal. */ }
    return "kept_in_browser";
  }
}
