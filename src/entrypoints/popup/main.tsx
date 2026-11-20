import { useEffect, useState } from "preact/hooks";
import { render } from "preact";
import browser from "webextension-polyfill";
import "./style.css";

type ConnectionState = "connected" | "disconnected" | "checking";

function Popup() {
  const [connection, setConnection] = useState<ConnectionState>("checking");

  useEffect(() => {
    const onMessage = (message: unknown) => {
      if (typeof message === "object" && message !== null &&
          "type" in message && message.type === "connection_state" &&
          "state" in message && (message.state === "connected" || message.state === "disconnected")) {
        setConnection(message.state);
      }
    };
    browser.runtime.onMessage.addListener(onMessage);
    void browser.runtime.sendMessage({ type: "get_connection_state" })
      .then((response: unknown) => {
        if (typeof response === "object" && response !== null &&
            "state" in response && (response.state === "connected" || response.state === "disconnected")) {
          setConnection(response.state);
        }
      })
      .catch(() => setConnection("disconnected"));
    return () => browser.runtime.onMessage.removeListener(onMessage);
  }, []);

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
      <section class="py-6">
        <div class="rounded-2xl border border-vortex-400/20 bg-gradient-to-br from-vortex-900 to-vortex-950 p-4">
          <p class="text-sm font-semibold">{connected ? "Desktop connection ready" : "Waiting for VortexDM"}</p>
          <p class="mt-1 text-xs leading-5 text-slate-400">
            {connected
              ? "The browser bridge is connected to the VortexDM native host."
              : "The bridge will retry automatically. Make sure VortexDM and its Native Messaging host are installed."}
          </p>
        </div>
      </section>
      <footer class="border-t border-white/10 pt-3 text-center text-[10px] text-slate-500">
        Vortex Browser Bridge · Phase 1
      </footer>
    </main>
  );
}

const root = document.getElementById("app");
if (root) render(<Popup />, root);
