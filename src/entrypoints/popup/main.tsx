import { render } from "preact";
import "./style.css";

function Popup() {
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
        <span class="rounded-full border border-amber-400/30 px-2 py-1 text-[10px] text-amber-300">Not connected</span>
      </header>
      <section class="py-6">
        <div class="rounded-2xl border border-vortex-400/20 bg-gradient-to-br from-vortex-900 to-vortex-950 p-4">
          <p class="text-sm font-semibold">Connection foundation ready</p>
          <p class="mt-1 text-xs leading-5 text-slate-400">
            Native Messaging transport is being initialized. Connect the VortexDM native host to enable downloads and media extraction.
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
