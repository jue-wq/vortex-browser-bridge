import { defineBackground } from "wxt/utils/define-background";
import browser from "webextension-polyfill";
import { AddBatchSchema, AddDownloadSchema, ExtractMediaSchema, HandshakeSchema, TaskControlSchema, type InboundMessage } from "../protocol/schema";
import { chunkBatch } from "../protocol/chunker";
import { parseSelectedUrls } from "../capture/parseSelectedUrls";
import { handoffBrowserDownload } from "../capture/handoffBrowserDownload";
import { getSettings, saveSettings } from "../platform/storage";
import { NativeMessagingTransport } from "../transport/NativeMessagingTransport";
import { ConnectionManager } from "../transport/ConnectionManager";
import { ConnectionSupervisor } from "../transport/ConnectionSupervisor";

const RECONNECT_ALARM = "vortex-native-reconnect";
const MENU_DOWNLOAD_LINK = "vortex-download-link";
const MENU_EXTRACT_PAGE = "vortex-extract-page";
const MENU_DOWNLOAD_SELECTION = "vortex-download-selection";

export default defineBackground(() => {
  const transport = new NativeMessagingTransport();
  const connection = new ConnectionManager(transport);
  const scheduler = {
    schedule(delayMs: number): void {
      void browser.alarms.clear(RECONNECT_ALARM).then(() => browser.alarms.create(RECONNECT_ALARM, {
        delayInMinutes: Math.max(0.5, delayMs / 60_000)
      }));
    },
    cancel(): void { void browser.alarms.clear(RECONNECT_ALARM); }
  };

  let connectionState: "connected" | "disconnected" = "disconnected";
  let lastStatusUpdate: Extract<InboundMessage, { type: "status_update" }> | null = null;
  let lastQueuesSync: Extract<InboundMessage, { type: "queues_sync" }> | null = null;
  connection.onMessage((message) => {
    if (message.type === "status_update") lastStatusUpdate = message;
    else if (message.type === "queues_sync") lastQueuesSync = message;
    else return;
    void browser.runtime.sendMessage({ type: "desktop_state", status: lastStatusUpdate, queues: lastQueuesSync }).catch(() => undefined);
  });
  const supervisor = new ConnectionSupervisor(
    connection,
    () => HandshakeSchema.parse({
      type: "handshake",
      protocol_version: 1,
      extension_version: browser.runtime.getManifest().version,
      capabilities: ["native_messaging", "batch_chunking", "status_push", "reconnect", "context_menu_capture", "download_capture"]
    }),
    scheduler,
    (state, reason) => {
      connectionState = state;
      void browser.runtime.sendMessage({ type: "connection_state", state }).catch(() => undefined);
      if (reason) console.info(`[VortexDM] Native host ${state}.`, reason);
    }
  );

  async function installContextMenus(): Promise<void> {
    const granted = await browser.permissions.contains({ permissions: ["contextMenus"] });
    if (!granted) return;
    await browser.contextMenus.removeAll();
    browser.contextMenus.create({
      id: MENU_DOWNLOAD_LINK,
      title: "Download link with VortexDM",
      contexts: ["link"]
    });
    browser.contextMenus.create({
      id: MENU_EXTRACT_PAGE,
      title: "Extract media with VortexDM",
      contexts: ["page", "video", "audio"]
    });
    browser.contextMenus.create({
      id: MENU_DOWNLOAD_SELECTION,
      title: "Send selected URLs to VortexDM",
      contexts: ["selection"]
    });
  }

  async function handleContextMenu(info: browser.Menus.OnClickData, tab?: browser.Tabs.Tab): Promise<void> {
    try {
      if (info.menuItemId === MENU_DOWNLOAD_LINK && info.linkUrl) {
        await supervisor.send(AddDownloadSchema.parse({
          type: "add_download",
          url: info.linkUrl,
          referrer: info.pageUrl,
          download_page: info.pageUrl,
          auto_start: true
        }));
        return;
      }

      if (info.menuItemId === MENU_EXTRACT_PAGE) {
        const pageUrl = info.pageUrl ?? tab?.url;
        if (!pageUrl) return;
        await supervisor.send(ExtractMediaSchema.parse({
          type: "extract_media",
          webpage_url: pageUrl,
          page_title: tab?.title,
          user_agent: navigator.userAgent,
          playlist_mode: false
        }));
        return;
      }

      if (info.menuItemId === MENU_DOWNLOAD_SELECTION && info.selectionText) {
        const urls = parseSelectedUrls(info.selectionText, 500);
        if (urls.length === 0) return;
        const batch = AddBatchSchema.parse({
          type: "add_batch",
          links: urls.map((url) => ({ url, referrer: info.pageUrl }))
        });
        for (const chunk of chunkBatch(batch)) await supervisor.send(AddBatchSchema.parse(chunk));
      }
    } catch (error) {
      console.warn("[VortexDM] Could not hand off browser item.", error);
      void browser.runtime.sendMessage({ type: "capture_error" }).catch(() => undefined);
    }
  }

  browser.contextMenus.onClicked.addListener((info, tab) => {
    void handleContextMenu(info, tab);
  });

  browser.permissions.onAdded.addListener(() => {
    void installContextMenus();
    void installDownloadListener();
  });

  let downloadListenerInstalled = false;
  async function installDownloadListener(): Promise<void> {
    if (downloadListenerInstalled) return;
    const granted = await browser.permissions.contains({ permissions: ["downloads"] });
    if (!granted) return;
    downloadListenerInstalled = true;
    browser.downloads.onCreated.addListener((item) => {
      void (async () => {
        const settings = await getSettings();
        const result = await handoffBrowserDownload(
          item,
          settings.autoCapture,
          (message) => supervisor.send(message),
          (downloadId) => browser.downloads.pause(downloadId),
          (downloadId) => browser.downloads.resume(downloadId),
          (downloadId) => browser.downloads.cancel(downloadId)
        );
        if (result === "kept_in_browser") {
          console.info("[VortexDM] Handoff was not acknowledged; browser download continues.");
        }
      })();
    });
  }

  browser.runtime.onMessage.addListener((message: unknown) => {
    if (typeof message !== "object" || message === null || !("type" in message)) return undefined;
    if (message.type === "control_download" && "action" in message && (message.action === "pause" || message.action === "resume") && "taskId" in message && typeof message.taskId === "string") {
      return supervisor.send(TaskControlSchema.parse({ type: "task_control", action: message.action, task_id: message.taskId }))
        .then(() => ({ ok: true }))
        .catch((error: unknown) => ({ ok: false, error: error instanceof Error ? error.message : String(error) }));
    }
    if (message.type === "get_desktop_state") {
      return Promise.resolve({ type: "desktop_state", status: lastStatusUpdate, queues: lastQueuesSync });
    }
    if (message.type === "get_connection_state") {
      return Promise.resolve({ type: "connection_state", state: connectionState });
    }
    if (message.type === "get_capture_state") {
      return Promise.all([
        getSettings(),
        browser.permissions.contains({ permissions: ["contextMenus", "downloads"] })
      ]).then(([settings, granted]) => ({
        type: "capture_state",
        enabled: settings.autoCapture,
        permissionsGranted: granted
      }));
    }
    if (message.type === "set_auto_capture" && "enabled" in message && typeof message.enabled === "boolean") {
      return getSettings().then(async (settings) => {
        await saveSettings({ ...settings, autoCapture: message.enabled as boolean });
        await installContextMenus();
        return { type: "capture_state", enabled: message.enabled, permissionsGranted: true };
      });
    }
    return undefined;
  });

  browser.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === RECONNECT_ALARM) void supervisor.retry();
  });

  void installContextMenus();
  supervisor.start();
  browser.runtime.onStartup.addListener(() => supervisor.start());
  browser.runtime.onInstalled.addListener(() => {
    supervisor.start();
    void installContextMenus();
  });
});
