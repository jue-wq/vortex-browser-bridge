# Architecture

## Phase 1 boundaries

The extension is organized into four boundaries:

- `protocol/`: Zod runtime schemas and message-size utilities. This is the only place that defines the browser-to-desktop message contract.
- `transport/`: transport implementations behind `ITransport`. Native Messaging is the primary channel; localhost HTTP is opt-in.
- `platform/`: browser API adapters and persisted extension settings.
- `entrypoints/`: WXT background and popup entrypoints. UI and event handlers should call application services rather than own protocol logic.

## Security invariants

1. Native Messaging is the default transport. No listening TCP port is opened by the extension.
2. The HTTP fallback is disabled by default and restricted to `127.0.0.1` or `localhost`; requests carry `X-Vortex-Api-Key`.
3. Cookies must never be written to `storage.local` or `storage.session`. Read them only for a user-triggered download or extraction, then pass them in-memory.
4. The extension validates inbound and outbound IPC payloads at runtime.
5. Batch messages target a 900 KiB serialized payload budget, below the Native Messaging 1 MiB frame limit.
6. Do not cancel a browser download until the desktop host has acknowledged accepting it.

## Browser targets

WXT owns browser-specific manifest generation. Chromium targets use Manifest V3. Firefox is built as a separate target and may use browser-specific manifest capabilities where required. Keep browser API access behind `platform/` and use `webextension-polyfill` for promise-based APIs.

## Known Phase 1 contract assumptions

The supplied project plan references a shared `IPC_PROTOCOL.md` v1 but does not include the desktop application's canonical schema. The schemas in this repository are therefore an initial implementation contract derived from the message names and fields in the browser-bridge plan. Before enabling production transfers, reconcile every field and acknowledgement shape with VortexDM's canonical protocol document.
