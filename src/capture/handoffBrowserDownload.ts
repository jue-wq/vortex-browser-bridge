import { AddDownloadSchema, type OutboundMessage } from "../protocol/schema";

export interface BrowserDownloadItem {
  id: number;
  url: string;
  filename?: string;
  referrer?: string;
  incognito?: boolean;
}

export type HandoffResult = "skipped" | "handed_off" | "kept_in_browser";

/**
 * Preserve the browser download unless the desktop explicitly ACKs acceptance.
 * This helper never reads cookies and never handles incognito downloads.
 */
export async function handoffBrowserDownload(
  item: BrowserDownloadItem,
  enabled: boolean,
  send: (message: OutboundMessage) => Promise<void>,
  cancel: (downloadId: number) => Promise<void>
): Promise<HandoffResult> {
  if (!enabled || item.incognito) return "skipped";
  let parsedUrl: URL;
  try { parsedUrl = new URL(item.url); } catch { return "skipped"; }
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") return "skipped";

  try {
    await send(AddDownloadSchema.parse({
      type: "add_download",
      url: item.url,
      filename: item.filename,
      referrer: item.referrer,
      download_page: item.referrer,
      auto_start: true
    }));
    await cancel(item.id);
    return "handed_off";
  } catch {
    return "kept_in_browser";
  }
}
