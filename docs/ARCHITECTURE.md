# Architecture

## Module boundaries

- `protocol/`: Zod runtime schemas and message-size utilities. This is the only place that defines the browser-to-desktop message contract.
- `transport/`: transport implementations behind `ITransport`. Native Messaging is primary; localhost HTTP is opt-in and disabled by default.
- `platform/`: browser API adapters and persisted extension settings.
- `capture/`: pure helpers for extracting and validating user-selected URLs.
- `entrypoints/`: WXT background and popup entrypoints. UI and event handlers call application services rather than own protocol logic.

## Security invariants

1. Native Messaging is the default transport. The extension never opens a TCP listener.
2. The HTTP fallback is disabled by default, restricted to loopback HTTP, requires an API key, and rejects redirects.
3. Cookies are never read or persisted by the current capture implementation. Future cookie forwarding requires a separate explicit user action and browser permission.
4. The extension validates inbound and outbound IPC payloads at runtime.
5. Batch messages target a 900 KiB serialized payload budget, below the Native Messaging 1 MiB frame limit.
6. Automatic browser-download capture is opt-in. The browser pauses an in-progress download before requesting desktop acceptance; the original is cancelled only after VortexDM returns a positive ACK. Missing, negative, or timed-out ACKs resume the browser download. Completed, unpausable, and incognito downloads are left untouched.
7. Native host reconnection uses `browser.alarms` with a 30-second minimum and capped exponential backoff so it survives Manifest V3 service-worker suspension.
8. The native handshake must complete before any capture message is sent.
9. URLs are limited to HTTP(S) for capture. Selected text is parsed as data, deduplicated, and bounded to 500 URLs per action.

## Capture behavior

After the user grants the optional `contextMenus` and `downloads` permissions:
- Right-click a link to enqueue that link in VortexDM.
- Right-click a page, video, or audio element to request media extraction for the page URL.
- Select text containing URLs and send up to 500 unique HTTP(S) links as a chunked batch.
- Optionally enable automatic browser download handoff. It is off by default and excludes incognito downloads.

The current implementation does not read cookies, inject scripts, scrape media manifests, or inspect page contents. The desktop extractor is responsible for media extraction after receiving the page URL.

## Browser targets

WXT owns browser-specific manifest generation. Chromium targets use Manifest V3. Firefox is built as a separate target. Browser API access uses `webextension-polyfill`.

## Shared IPC contract and integration boundary

The shared v1-shaped contract is proposed in [VortexDM's IPC_PROTOCOL.md](https://github.com/jue-wq/VortexDM/blob/main/docs/IPC_PROTOCOL.md). The document is explicit that the desktop Native Messaging host is not implemented yet. The browser bridge's schemas currently match that proposal; do not describe the desktop connection as production-ready until the host, queue adapter, ACK de-duplication, and real-process integration tests exist.

## Validation

CI runs TypeScript typechecking, Vitest unit tests, the Python mock-host protocol tests, and Chromium/Firefox production builds. These checks validate the browser extension and mock protocol only; they do not prove integration with the real VortexDM desktop application.
