# IPC Protocol v1 — Browser Bridge implementation contract

> Status: browser-side implementation draft aligned to the shared proposal in [VortexDM](https://github.com/jue-wq/VortexDM/blob/feature/native-host-stream-adapter/docs/IPC_PROTOCOL.md). A partial standalone Firefox Native Messaging host now exists in [VortexDM PR #3](https://github.com/jue-wq/VortexDM/pull/3); it stages single downloads but deliberately sends negative ACKs until the app queue adapter is connected. This is not a production-ready end-to-end bridge.

## Transport

- Primary: Native Messaging host `com.vortexdm.native_host`.
- Optional fallback: `POST http://127.0.0.1:<port>/v1/ipc` with `Content-Type: application/json` and `X-Vortex-Api-Key`. Disabled unless explicitly enabled.
- Native Messaging frames use a 4-byte unsigned little-endian length followed by UTF-8 JSON.
- Maximum frame: 1 MiB. Browser batch target: 900 KiB serialized JSON.

## Extension → desktop

- `handshake`: `protocol_version: 1`, `extension_version`, `capabilities[]`. No ACK required. The current VortexDM host requires it as the first frame but does not yet publish initial status or queue snapshots.
- `add_download`: required `url`; optional `filename`, `headers`, transient `cookies`, `referrer`, `download_page`, `auto_start`, `queue_id`, `request_id`.
- `extract_media`: required `webpage_url`; optional `page_title`, `user_agent`, transient `cookies`, `playlist_mode`, `request_id`.
- `add_batch`: non-empty `links[]`; optional `queue_id`, `auto_start`, `request_id`, `chunk_index`, `chunk_total`.
- `task_control`: `action` is `pause`, `resume`, or `focus_app`; optional `task_id`, `request_id`.

## Desktop → extension

- `ack`: `request_id`, `accepted`, optional `error`. Positive ACK confirms queue/operation acceptance, not transfer completion. A browser download is never cancelled before positive ACK.
- `status_update`: `active_downloads[]`, optional `total_speed` and `theme`.
- `queues_sync`: `queues[]` with `id`, `name`, optional `category`.

## Cookie policy

The schema reserves transient cookie fields for future user-consented flows, but the current extension does not read or send cookies. Cookies must never be persisted or logged. Add cookie forwarding only after a dedicated consent and permission flow exists.

## Contract alignment

The TypeScript schemas in `src/protocol/schema.ts` are checked against the shared proposal, but the production desktop host, ACK de-duplication, batch assembly, and native-host registration are still missing. Production transfers must remain disabled until real-host integration tests pass.
