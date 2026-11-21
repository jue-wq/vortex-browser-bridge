# Vortex Browser Bridge

A cross-browser extension that hands downloads, selected links, and media-extraction requests from Chrome/Chromium and Firefox to VortexDM.

> Project status: browser-side capture MVP. The production VortexDM Native Messaging host and queue adapter are not implemented yet; see the [shared IPC v1 proposal](https://github.com/jue-wq/VortexDM/blob/main/docs/IPC_PROTOCOL.md).

## Requirements

- Node.js 22 or newer
- Python 3.10+ for mock-host integration tests
- npm

## Development

```bash
npm install
npm run dev
npm run dev:firefox
npm run typecheck
npm test
npm run build
npm run build:firefox
```

## Build installable packages

```bash
npm run zip
npm run zip:firefox
```

WXT writes browser-specific ZIP packages under `.output/`. CI also builds both packages and publishes them as a downloadable workflow artifact for 14 days. These are unsigned development packages until a release-signing and store-submission process is configured.

## Capture features

The popup lets the user grant optional `contextMenus` and `downloads` permissions. Once granted:
- Right-click a link to send it to VortexDM.
- Right-click a page/video/audio element to request media extraction.
- Select text containing URLs to send a bounded, chunked batch.
- Automatic download handoff is an additional opt-in. An in-progress browser download is paused first and cancelled only after a positive desktop ACK; otherwise it is resumed. Completed, unpausable, and incognito downloads are untouched. If the desktop accepts the item but the browser cannot cancel its paused copy, the extension leaves that copy paused and warns the user rather than resuming it and risking a duplicate transfer.
- Incognito downloads are excluded. The current implementation never reads or forwards cookies.

## Mock Native Host

The development-only host in `scripts/mock-native-host.py` implements 4-byte little-endian Native Messaging frames and responds to handshake, status, queue, and ACK messages. It is for protocol development only and is not the production VortexDM host.

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [Browser IPC v1 proposal](docs/IPC_PROTOCOL.md)
- [VortexDM shared IPC v1 proposal](https://github.com/jue-wq/VortexDM/blob/main/docs/IPC_PROTOCOL.md)

Never use the mock host or draft protocol as evidence that production desktop integration is complete.
