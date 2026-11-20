# Vortex Browser Bridge

A cross-browser extension that connects Chrome/Chromium and Firefox to VortexDM through a validated IPC protocol and Native Messaging.

> Project status: Phase 1 — foundation and transport layer.

## Development

Requirements: Node.js 20.19+ (or 22.12+) and npm.

```bash
npm install
npm run dev
npm run build
npm run build:firefox
npm run test
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/IPC_PROTOCOL.md](docs/IPC_PROTOCOL.md) for the implementation contracts.
