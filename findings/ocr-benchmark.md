# OCR Benchmark Findings

**Date:** 2026-02-20 | **Platform:** macOS, Apple Vision framework | **Input:** 8 PNGs at 3326x2160 (Retina)

## CPU Usage (Compiled Binary)

| Width | Mode     | Wall (s) | CPU user+sys (s) | Peak RAM (MB) |
| ----- | -------- | -------- | ---------------- | ------------- |
| 3326  | fast     | 0.53     | **0.44**         | 150           |
| 3326  | accurate | 1.49     | **3.24**         | 156           |
| 1920  | fast     | 0.54     | **0.45**         | 152           |
| 1920  | accurate | 1.55     | **2.95**         | 140           |
| 1280  | fast     | 0.60     | **0.49**         | 162           |
| 1280  | accurate | 1.58     | **2.95**         | 140           |
| 960   | fast     | 0.27     | **0.18**         | 65            |
| 640   | fast     | 0.13     | **0.05**         | 29            |

- `accurate` saturates ~2 cores (3s CPU in 1.5s wall). `fast` is single-threaded.
- **`accurate` costs ~6-7x more CPU than `fast`** at the same resolution.
- Downscaling from 3326 → 1920 or 1280 doesn't save CPU for `accurate` (~2.95s either way).
- Swift interpreter adds ~300ms + 200MB overhead per call; production uses compiled binary.

## Quality (Manual Text Inspection)

Character count is a misleading metric — `fast` produces same-length but garbled text.
Quality was assessed by reading actual OCR output against the source screenshots.

**`fast` mode has systematic errors even at full 3326px resolution:**

- `{` → `I`, `}` → `l`, `/` → `l`, `!` → `l`, `'` → `l` (confuses thin glyphs)
- Spaces injected mid-word: `function` → `f unction`, `Notification` → `Notif ication`
- Template literals destroyed: `'${timestamp}_${id}.png'` → `' $ltirnestamp}_$lldl. png.`
- URLs unparseable: `mail.google.com/mail/u/0/` → `mail.google.comlmaillulOl`
- At 1920px, prose also corrupted: `but it can be` → `bul11 can b8`, `refinement` → `refln8m8nl`

**`accurate` mode** produces clean, readable text with correct special characters down to 1280px.

**Spatial ordering:** Neither mode reads the screen in clean column order. `accurate`
groups regions into rough contiguous chunks (sidebar, then editor, then terminal, then
side panel). `fast` interleaves all regions chaotically throughout.

## Recommendation

**Keep `accurate` mode.** `fast` is not viable — it garbles code syntax, URLs, and
special characters at any resolution.

**Bump `OCR_MAX_WIDTH` from 1280 → 1920.** Same CPU cost (~2.95s), marginally better
quality since less downscaling is applied.

## Reproducing

```bash
# Full benchmark (~10 min)
ELECTRON_RUN_AS_NODE=1 ./node_modules/.bin/electron node_modules/.bin/tsx scripts/benchmarks/ocr.ts

# Single-image CPU/memory check
swiftc -O -o /tmp/ocr src/main/processor/swift/ocr.swift -framework Cocoa -framework Vision
/usr/bin/time -l /tmp/ocr path/to/image.png --mode accurate
```

Raw OCR text outputs + JSON in `.debug-pipeline/benchmark-results/`.
