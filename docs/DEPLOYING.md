# Deploying MemoryLane (Windows)

## Prerequisites

- Node.js (LTS)
- Rust toolchain (for native sidecars)

## Build Steps

```bash
npm install
npm run postinstall      # rebuild native modules for Electron
npm run build:rust       # compile Windows sidecar binaries
npm run build            # build main + renderer + preload
npx electron-builder --dir --win
```

The packaged app lands in `dist/win-unpacked/`. Run `MemoryLane.exe` from there.

To create an installer (NSIS + MSI):

```bash
npx electron-builder --win
```

Installers output to `dist/`.

## Notes

- **macOS notarization**: `electron-builder.yml` has `afterSign: build/notarize.js` for macOS code signing. Comment it out for local Windows builds if it causes errors.
- **API keys are not bundled**. The `.env` file is dev-only and excluded from the package. End users provide their own OpenRouter key through the settings UI or subscribe for a managed key.
- **Autostart** works only with the packaged app, not `npm run dev`.
- **Database** is stored per-user at `%APPDATA%/MemoryLane/memorylane.db` (production) or `%APPDATA%/MemoryLane-dev/memorylane-dev.db` (dev).
- **Native sidecars** (`app-watcher-windows.exe`, `screenshot-capturer-windows.exe`) are bundled from `build/rust/` into the package automatically via the `win.extraResources` config in `electron-builder.yml`.
