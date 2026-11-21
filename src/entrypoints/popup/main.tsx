import { useEffect, useState } from "preact/hooks";
import { render } from "preact";
import browser from "webextension-polyfill";
import "./style.css";

type ConnectionState = "connected" | "disconnected" | "checking";
type DesktopStatus = { active_downloads: Array<{ id: string; filename: string; progress?: number; speed?: number; status: string }>; total_speed?: number; theme?: string };
type QueueSnapshot = { queues: Array<{ id: string; name: string; category?: string }> };

function formatSpeed(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) return "";
  if (value < 1024) return `${Math.round(value)} B/s`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB/s`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB/s`;
}

function Popup() {
  const [connection, setConnection] = useState<ConnectionState>("checking");
  const [captureEnabled, setCaptureEnabled] = useState(false);
  const [capturePermissions, setCapturePermissions] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [desktopStatus, setDesktopStatus] = useState<DesktopStatus | null>(null);
  const [desktopQueues, setDesktopQueues] = useState<QueueSnapshot | null>(null);

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (typeof message !== "object" || message === null || !("type" in message)) return;
      if (message.type === "connection_state" && "state" in message &&
          (message.state === "connected" || message.state === "disconnected")) {
        setConnection(message.state);
      }
      if (message.type === "capture_error") setNotice("VortexDM did not acknowledge the handoff. Your browser download was kept.");
      if (message.type === "capture_cancel_failed") setNotice("VortexDM accepted the download, but the browser copy could not be cancelled and remains paused. Check the browser downloads list to avoid a duplicate.");
      if (message.type === "desktop_state" && "status" in message && "queues" in message) {
        if (message.status && typeof message.status === "object" && "active_downloads" in message.status) setDesktopStatus(message.status as DesktopStatus);
        if (message.queues && typeof message.queues === "object" && "queues" in message.queues) setDesktopQueues(message.queues as QueueSnapshot);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    void browser.runtime.sendMessage({ type: "get_connection_state" })
      .then((response: unknown) => {
        if (typeof response === "object" && response !== null && "state" in response &&
            (response.state === "connected" || response.state === "disconnected")) setConnection(response.state);
      }).catch(() => setConnection("disconnected"));
    void browser.runtime.sendMessage({ type: "get_desktop_state" }).then((response: unknown) => {
      if (typeof response === "object" && response !== null && "status" in response && "queues" in response) {
        if (response.status && typeof response.status === "object" && "active_downloads" in response.status) setDesktopStatus(response.status as DesktopStatus);
        if (response.queues && typeof response.queues === "object" && "queues" in response.queues) setDesktopQueues(response.queues as QueueSnapshot);
      }
    }).catch(() => undefined);
    void browser.runtime.sendMessage({ type: "get_capture_state" })
      .then((response: unknown) => {
        if (typeof response === "object" && response !== null && "enabled" in response && "permissionsGranted" in response) {
          setCaptureEnabled(response.enabled === true);
          setCapturePermissions(response.permissionsGranted === true);
        }
      }).catch(() => undefined);
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

  async function controlDownload(taskId: string, action: "pause" | "resume"): Promise<void> {
    try {
      const response = await browser.runtime.sendMessage({ type: "control_download", taskId, action });
      if (typeof response === "object" && response !== null && "ok" in response && response.ok === true) setNotice(action === "pause" ? "Pause request sent." : "Resume request sent.");
      else setNotice("VortexDM could not accept the control request.");
    } catch {
      setNotice("VortexDM is not connected; the task was not changed.");
    }
  }

  async function toggleCapture(): Promise<void> {
    setBusy(true);
    setNotice("");
    try {
      if (!capturePermissions) {
        const granted = await browser.permissions.request({
          permissions: ["contextMenus", "downloads"] as never
        });
        if (!granted) {
          setNotice("Capture permissions were not granted.");
          return;
        }
        setCapturePermissions(true);
      }
      const next = !captureEnabled;
      await browser.runtime.sendMessage({ type: "set_auto_capture", enabled: next });
      setCaptureEnabled(next);
      setNotice(next
        ? "Capture enabled. Right-click links or pages to send them to VortexDM."
        : "Automatic download capture disabled. Context-menu handoff remains available.");
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not update capture settings.");
    } finally {
      setBusy(false);
    }
  }

  const connected = connection === "connected";
  const statusText = connection === "checking" ? "Checking connection" : connected ? "Connected" : "Not connected";

  return (
    <main class="min-h-screen w-[360px] bg-vortex-950 p-4 text-vortex-100">
      <header class="flex items-center justify-between border-b border-white/10 pb-3">
        <div class="flex items-center gap-2">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-vortex-300 to-vortex-500 font-bold text-vortex-950">V</div>
          <div>
            <p class="text-sm font-semibold tracking-wide">VortexDM</p>
            <p class="text-[11px] text-slate-400">Browser Bridge</p>
          </div>
        </div>
        <span class={`rounded-full border px-2 py-1 text-[10px] ${connected ? "border-emerald-400/30 text-emerald-300" : "border-amber-400/30 text-amber-300"}`}>
          {statusText}
        </span>
      </header>

      <section class="py-5">
        <div class="rounded-2xl border border-vortex-400/20 bg-gradient-to-br from-vortex-900 to-vortex-950 p-4">
          <p class="text-sm font-semibold">{connected ? "Desktop connection ready" : "Waiting for VortexDM"}</p>
          <p class="mt-1 text-xs leading-5 text-slate-400">
            {connected
              ? "The browser bridge is connected to the VortexDM native host."
              : "The bridge will retry automatically. Make sure VortexDM and its Native Messaging host are installed."}
          </p>
        </div>
      </section>

      <section class="border-t border-white/10 py-4">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-sm font-semibold">Desktop activity</p>
          <span class="text-[10px] text-slate-400">{desktopStatus?.active_downloads.length ?? 0} active</span>
        </div>
        {desktopStatus?.active_downloads.length ? (
          <div class="space-y-2">
            {desktopStatus.active_downloads.slice(0, 4).map((download) => (
              <div key={download.id} class="rounded-lg bg-white/5 p-2">
                <div class="flex items-center justify-between gap-2">
                  <p class="truncate text-[11px] font-medium">{download.filename}</p>
                  <span class="shrink-0 text-[10px] text-slate-400">{download.progress === undefined ? download.status : `${Math.round(download.progress)}%`}</span>
                </div>
                {download.progress !== undefined && <div class="mt-1 h-1 overflow-hidden rounded bg-white/10"><div class="h-full rounded bg-cyan-400" style={{ width: `${Math.max(0, Math.min(100, download.progress))}%` }} /></div>}
                {download.speed !== undefined && <p class="mt-1 text-[10px] text-slate-500">{formatSpeed(download.speed)}</p>}
                <div class="mt-2 flex justify-end">
                  {download.status.toLowerCase() === "paused" ? (
                    <button type="button" onClick={() => void controlDownload(download.id, "resume")} class="rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-200">Resume</button>
                  ) : (
                    <button type="button" onClick={() => void controlDownload(download.id, "pause")} class="rounded-md bg-white/10 px-2 py-1 text-[10px] text-slate-200">Pause</button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : <p class="text-[11px] text-slate-500">No active downloads reported by VortexDM.</p>}
        {desktopQueues?.queues.length ? <p class="mt-3 text-[10px] text-slate-400">Queues: {desktopQueues.queues.map((queue) => queue.name).join(" · ")}</p> : null}
      </section>

      <section class="border-t border-white/10 py-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-semibold">Browser download capture</p>
            <p class="mt-1 text-[11px] text-slate-400">
              {captureEnabled ? "New downloads are handed to VortexDM after acknowledgement." : "Off by default. Your browser downloads remain untouched."}
            </p>
          </div>
          <span class={`rounded-full px-2 py-1 text-[10px] ${captureEnabled ? "bg-emerald-400/10 text-emerald-300" : "bg-white/5 text-slate-400"}`}>
            {captureEnabled ? "ON" : "OFF"}
          </span>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => void toggleCapture()}
          class="mt-3 w-full rounded-xl bg-blue-600 px-3 py-2.5 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {busy ? "Please wait…" : !capturePermissions ? "Grant capture permissions" : captureEnabled ? "Disable automatic capture" : "Enable automatic capture"}
        </button>
        <p class="mt-2 text-[10px] leading-4 text-slate-500">
          Right-click link/page actions are available after permissions are granted. Cookies are never collected by this feature.
        </p>
        {notice && <p class="mt-2 rounded-lg bg-white/5 p-2 text-[10px] leading-4 text-slate-300">{notice}</p>}
      </section>

      <footer class="border-t border-white/10 pt-3 text-center text-[10px] text-slate-500">
        Vortex Browser Bridge · Phase 1
      </footer>
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
