# Windows Re-Enable Plan (Compact)

## Goal

Restore stable Windows support for the full v2 pipeline (capture -> activity context -> OCR -> storage -> MCP), not just preview-level behavior.

## P0 (Must Work)

- [ ] **Windows screenshot backend in the existing daemon framework**  
       Extend the current persistent capture backend in `src/main/v2/recorder/native-screenshot.ts` with a `win32` factory plus Windows-specific executable resolution so capture no longer depends on the mac Swift `build/swift/screenshot` binary.
- [ ] **Finish the existing platform capture abstraction**  
       Keep one output contract (`filepath`, `width`, `height`, `displayId`) through `ScreenCaptureBackend`, register `win32`, and preserve explicit startup errors when no backend is available.
- [x] **Windows app/window watcher parity**  
       Validate and harden the existing `win32` watcher path in `src/main/recorder/app-watcher.ts` and `src/main/recorder/app-watcher-win.ts` so `interaction-monitor` receives real app/title changes instead of mostly unknown context.
- [ ] **Windows preflight checks at startup**  
       Extend `src/main/ui/permissions.ts` into platform-specific preflight checks (screenshot sidecar availability, input hook availability, OCR prerequisites) rather than mac-only permission flow.
- [ ] **Windows packaging inputs**  
       Update `scripts/build-rust.js`, `package.json`, and `electron-builder.yml` so Windows builds include both Windows sidecars and do not rely on mac Swift artifacts in Windows release flow.

## P1 (Reliability + UX)

- [ ] **Harden Windows OCR runtime**  
       Keep `src/main/processor/ocr-windows-native.ts` + `windows-ocr.ps1`, but add robust checks for PowerShell availability, OCR language packs, clear diagnostics, and timeout/fallback behavior.
- [ ] **Capture degradation behavior**  
       If app-watcher is unavailable, keep capture running but surface "reduced context mode" in logs/UI so users know app/window attribution is degraded.
- [ ] **Startup/user messaging**  
       Add Windows-specific onboarding/help text (what settings to verify, how to fix missing OCR components, what preview limitations remain).
- [ ] **Auto-update + signing readiness**  
       Validate NSIS + `electron-updater` behavior on signed Windows builds and document required cert/signing setup before public rollout.

## P2 (Validation + Release)

- [ ] **Windows test coverage**  
       Add unit tests for Windows backend selection and parsing; add opt-in integration smoke tests for Windows screenshot + OCR paths (mirroring current mac-native integration tests).
- [ ] **Cross-platform CI gate**  
       Add at least one Windows build/test job so regressions are caught before release.
- [ ] **Docs and release cleanup**  
       Update `README.md`, `RELEASE_NOTES.md`, and install guidance to reflect actual Windows status and first-run behavior.

## Definition of Done

- [ ] Clean Windows install can: start capture, persist activities with non-empty app context, run OCR (or cleanly degrade), query data through MCP tools, and pass Windows build/test checks.
