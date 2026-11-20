# Vortex Browser Bridge

A cross-browser extension that connects Chrome/Chromium and Firefox to VortexDM through a validated IPC protocol and Native Messaging.

> Project status: Phase 1 foundation. The desktop IPC schema is still a draft pending comparison with VortexDM's canonical `IPC_PROTOCOL.md`.

## Requirements

- Node.js 22 or newer
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

## Mock Native Host

The development-only host in `scripts/mock-native-host.py` implements the 4-byte little-endian Native Messaging frame format and responds to handshake, status, queue, and acknowledgement messages. Register it as `com.vortexdm.native_host` in the browser's Native Messaging host registry before testing the extension end-to-end.

## Project documents

- [Architecture](docs/ARCHITECTURE.md)
- [IPC Protocol v1 draft](docs/IPC_PROTOCOL.md)

Do not use the draft protocol for production transfers until it has been reconciled with the desktop application's canonical schema.
