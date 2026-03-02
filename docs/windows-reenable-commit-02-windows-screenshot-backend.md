# Commit 02 Spec: Windows Screenshot Backend (v2)

## Goal

Implement a `win32` screenshot path for v2 that preserves the existing frame/output contract used by `ScreenCapturer`:

- `filepath`
- `width`
- `height`
- `displayId`

This commit should make v2 screenshot capture work on Windows without depending on macOS Swift binaries.

## Dependencies and Boundaries

- Depends on `commit-01` capture backend alignment.
- Do not include app watcher work (that is `commit-03`).
- Do not include startup preflight/degraded messaging (that is `commit-04`).

## Technical Choice

Use a long-lived native Windows screenshot sidecar process managed by the v2 recorder layer.

Rationale:

- Aligns with existing sidecar lifecycle precedent (`app-watcher`) and avoids per-frame process spawn overhead.
- Keeps screenshot cadence/ticking in the low-level backend while preserving the existing frame stream shape.
- Allows resilient restart/error handling at the process boundary without changing downstream pipeline contracts.

## Native Module Shape (Commit 02)

Use the same sidecar pattern as Windows `app-watcher`, but plug it into the existing persistent daemon layer already used on macOS:

- Create a separate Rust crate under `native/windows/` (for example `native/windows/screenshot-capturer/`).
- Build an `.exe` into `build/rust/` and load from:
  - dev: `build/rust/<binary>.exe`
  - packaged: `process.resourcesPath/rust/<binary>.exe`
- Use a dedicated executable override env var for local debugging.
- Communicate over JSONL on stdio:
  - command channel for start/stop/display-update configuration
  - event channel for `ready` / `frame` / `error`
- Extend `scripts/build-rust.js` so `npm run build:rust` builds and copies both Windows Rust sidecars.

This keeps Windows native process lifecycle, packaging, and diagnostics aligned with existing app-watcher conventions.

## Display ID Contract (Commit 02)

Canonical ID for v2 capture routing is **Electron `Display.id`** (`number`).

Windows screenshot backend rules:

1. Canonical routing ID remains Electron `Display.id` (`number`) at the JS boundary.
2. `ScreenCapturer.setDisplayId(...)` updates the active display target for the running Windows sidecar.
3. Frame events emitted from the sidecar must include `displayId` as `number` and map to the active target.
4. If a requested display cannot be captured, emit a clear error that includes requested and available IDs.

## File-Level Plan

1. Add Windows long-lived recorder backend module:
   - `src/main/v2/recorder/native-screenshot-win.ts` (new)
   - Responsibilities:
     - resolve Windows screenshot sidecar executable location and override env var
     - expose the command/args needed by the shared daemon lifecycle

2. Extend the existing daemon backend registry:
   - `src/main/v2/recorder/native-screenshot.ts`
   - Register `win32` in `PLATFORM_SCREEN_CAPTURE_BACKENDS`.
   - Reuse the current process lifecycle, JSONL parsing, command channel, and restart/backoff behavior already used by the mac backend.

3. Keep `ScreenCapturer` API unchanged:
   - `src/main/v2/recorder/screen-capturer.ts`
   - Keep public API unchanged (`start`, `stop`, `setDisplayId`, stream append behavior).
   - `ScreenCapturer` should continue delegating to `createScreenCaptureBackend()` with no Windows-specific branching in the caller.

4. Add the minimum build/packaging plumbing required for the new sidecar to resolve in dev and packaged builds:
   - `scripts/build-rust.js`
   - `package.json`
   - `electron-builder.yml`

5. Keep frame contract unchanged:
   - `src/main/v2/recorder/screen-capturer.ts`
   - `Frame` payload shape and downstream stream semantics remain unchanged in this commit.

## Sizing Semantics

- Input: `maxDimensionPx` is optional and must be positive finite when provided.
- Output: resulting image must satisfy `max(width, height) <= maxDimensionPx` when requested.
- Windows sidecar must enforce this bound before writing the captured image file and emitting frame metadata.

## Tests in Scope

1. Add Windows backend unit tests:
   - `src/main/v2/recorder/native-screenshot-win.test.ts` (new)
   - Extend `src/main/v2/recorder/native-screenshot.test.ts`
   - Mock child process lifecycle and JSONL event stream.
   - Cover:
     - start/stop idempotency
     - frame event parsing and forwarding
     - display target update forwarding
     - restart/backoff on crash
     - malformed event handling and error propagation

2. Update `ScreenCapturer` tests:
   - `src/main/v2/recorder/screen-capturer.test.ts`
   - Assert Windows path preserves stream sequence behavior and stop semantics.

3. Add Windows integration test with persisted outputs:
   - `src/main/v2/recorder/native-screenshot.windows.integration.test.ts` (new)
   - Optionally add `src/main/v2/recorder/screen-capturer.windows.integration.test.ts` as a thin end-to-end smoke test over the public wrapper
   - Gate with:
     - `process.platform === 'win32'`
     - `RUN_WINDOWS_INTEGRATION=1`

- Persist artifacts in:
  - `.debug-native-screenshot-win/<timestamp>/`
- Required artifacts:
  - captured frame image files (same output directory structure used by `ScreenCapturer`)
  - `frame-events.jsonl` (filepath/width/height/displayId/sequenceNumber)
  - `summary.json` (frame counts, first/last timestamps, restart count if any)

## Verification Criteria

- All unit tests in this commit pass.
- Windows integration test passes when enabled.
- Integration artifacts are written and inspectable by humans/agents.

## Acceptance Criteria

- On `win32`, v2 frame capture runs through a long-lived native sidecar and writes image files compatible with the existing frame contract.
- Returned `displayId` is numeric and usable by downstream v2 code.
- Existing call sites (`ScreenCapturer`, pipeline harness) require no contract changes.
- Unit + Windows integration tests for this commit pass.
