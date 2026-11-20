# IPC Protocol v1 — Browser Bridge Draft

> Status: implementation draft. The desktop application's canonical `IPC_PROTOCOL.md` was referenced by the project plan but was not supplied with this repository. Confirm field names, requiredness, message limits, and acknowledgement semantics against the desktop implementation before release.

## Transport

- Primary: Native Messaging host `com.vortexdm.native_host`.
- Optional fallback: `POST http://127.0.0.1:<port>/v1/ipc` with `Content-Type: application/json` and `X-Vortex-Api-Key`. Disabled unless explicitly enabled.
- Native Messaging frames remain below 1 MiB. Batch messages use a 900 KiB serialized JSON budget.

## Extension → desktop

- `handshake`: `protocol_version: 1`, `extension_version`, and `capabilities[]`.
- `add_download`: required `url`; optional `filename`, `headers`, `cookies`, `referrer`, `download_page`, `auto_start`, `queue_id`, `request_id`.
- `extract_media`: required `webpage_url`; optional `page_title`, `user_agent`, `cookies`, `playlist_mode`, `request_id`.
- `add_batch`: non-empty `links[]`; optional `queue_id`, `auto_start`, `request_id`, `chunk_index`, `chunk_total`.
- `task_control`: `action` is `pause`, `resume`, or `focus_app`; optional `task_id`, `request_id`.

## Desktop → extension

- `ack`: draft envelope with `request_id`, `accepted`, optional `error`. Requests requiring confirmation wait up to 1.5 seconds. A missing or negative acknowledgement must never cause the original browser download to be cancelled.
- `status_update`: `active_downloads[]`, optional `total_speed` and active `theme`.
- `queues_sync`: `queues[]` with `id`, `name`, optional `category`.

## Cookie handling

Cookie objects are transient IPC payload data only. Never write them to extension storage, logs, analytics, or error reports. Read cookies only for a target URL after an explicit user action or a download handoff.

## Contract alignment required

The browser plan describes message names and conceptual fields, but not the desktop's exact JSON schema or acknowledgement envelope. The current Zod schemas and `/v1/ipc` fallback route are a draft contract, not a claim of compatibility with the desktop application.
