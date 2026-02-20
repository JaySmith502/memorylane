/**
 * OCR Benchmark Script
 *
 * Tests OCR quality and performance across different resolutions and modes.
 * Resizes each screenshot to various widths, runs OCR in both fast/accurate modes,
 * and reports timing + character counts. Saves full OCR output for quality comparison.
 *
 * Usage: npm run enode scripts/benchmark-ocr.ts [--dir <path>]
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import sharp from 'sharp'
import { spawn } from 'child_process'

// ── Config ──────────────────────────────────────────────────────────────────

const WIDTHS = [3326, 2560, 1920, 1280, 960, 640] // original → tiny
const MODES: Array<'fast' | 'accurate'> = ['fast', 'accurate']
const RUNS_PER_COMBO = 3 // repeat each combo for stable timing
const DEBUG_PIPELINE_DIR = process.argv.includes('--dir')
  ? process.argv[process.argv.indexOf('--dir') + 1]
  : path.resolve(process.cwd(), '.debug-pipeline')

const SWIFT_SCRIPT = path.resolve(process.cwd(), 'src', 'main', 'processor', 'swift', 'ocr.swift')

// ── Helpers ─────────────────────────────────────────────────────────────────

function collectPngs(dir: string): string[] {
  const pngs: string[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      pngs.push(...collectPngs(full))
    } else if (entry.isFile() && /\.png$/i.test(entry.name)) {
      pngs.push(full)
    }
  }
  return pngs.sort()
}

async function resizeImage(src: string, width: number, dest: string): Promise<void> {
  const meta = await sharp(src).metadata()
  if (meta.width && meta.width <= width) {
    fs.copyFileSync(src, dest)
    return
  }
  await sharp(src).resize({ width, withoutEnlargement: true }).png().toFile(dest)
}

function runOcr(
  filepath: string,
  mode: 'fast' | 'accurate',
): Promise<{ text: string; ms: number }> {
  return new Promise((resolve, reject) => {
    const start = performance.now()
    const proc = spawn('swift', [SWIFT_SCRIPT, filepath, '--mode', mode])
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => (stdout += d.toString()))
    proc.stderr.on('data', (d) => (stderr += d.toString()))
    proc.on('close', (code) => {
      const ms = performance.now() - start
      if (code !== 0) return reject(new Error(`OCR failed (code ${code}): ${stderr.trim()}`))
      resolve({ text: stdout.trim(), ms })
    })
    proc.on('error', reject)
  })
}

// ── Types ───────────────────────────────────────────────────────────────────

interface RunResult {
  image: string
  width: number
  mode: 'fast' | 'accurate'
  charCount: number
  lineCount: number
  timingsMs: number[]
  avgMs: number
  minMs: number
  maxMs: number
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('OCR Benchmark')
  console.log('='.repeat(80))
  console.log(`Directory : ${DEBUG_PIPELINE_DIR}`)
  console.log(`Widths    : ${WIDTHS.join(', ')}`)
  console.log(`Modes     : ${MODES.join(', ')}`)
  console.log(`Runs/combo: ${RUNS_PER_COMBO}`)
  console.log()

  if (!fs.existsSync(SWIFT_SCRIPT)) {
    console.error(`Swift OCR script not found: ${SWIFT_SCRIPT}`)
    process.exit(1)
  }

  const pngs = collectPngs(DEBUG_PIPELINE_DIR)
  console.log(`Found ${pngs.length} PNG files\n`)

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ocr-bench-'))
  const outputDir = path.join(DEBUG_PIPELINE_DIR, 'benchmark-results')
  fs.mkdirSync(outputDir, { recursive: true })

  const results: RunResult[] = []
  const ocrOutputs: Record<string, string> = {} // key: "image|width|mode"

  // Warmup: run OCR once so Swift compilation is cached
  console.log('Warming up Swift OCR compilation...')
  await runOcr(pngs[0], 'fast')
  console.log('Warmup done.\n')

  for (const png of pngs) {
    const shortName = path.relative(DEBUG_PIPELINE_DIR, png)
    console.log(`\n── ${shortName} ──`)

    for (const width of WIDTHS) {
      const resizedPath = path.join(tmpDir, `${path.basename(png, '.png')}_w${width}.png`)
      await resizeImage(png, width, resizedPath)
      const meta = await sharp(resizedPath).metadata()
      const actualWidth = meta.width!

      for (const mode of MODES) {
        const timings: number[] = []
        let lastText = ''

        for (let run = 0; run < RUNS_PER_COMBO; run++) {
          const { text, ms } = await runOcr(resizedPath, mode)
          timings.push(ms)
          lastText = text
        }

        const avg = timings.reduce((a, b) => a + b, 0) / timings.length
        const result: RunResult = {
          image: shortName,
          width: actualWidth,
          mode,
          charCount: lastText.length,
          lineCount: lastText.split('\n').length,
          timingsMs: timings.map((t) => Math.round(t)),
          avgMs: Math.round(avg),
          minMs: Math.round(Math.min(...timings)),
          maxMs: Math.round(Math.max(...timings)),
        }
        results.push(result)

        const key = `${shortName}|${actualWidth}|${mode}`
        ocrOutputs[key] = lastText

        const timingStr = timings.map((t) => `${Math.round(t)}ms`).join(', ')
        console.log(
          `  ${String(actualWidth).padStart(4)}px ${mode.padEnd(8)} → ${String(result.charCount).padStart(5)} chars, ${String(result.lineCount).padStart(3)} lines | avg ${result.avgMs}ms [${timingStr}]`,
        )
      }

      // cleanup resized file
      try {
        fs.unlinkSync(resizedPath)
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  // ── Summary table ───────────────────────────────────────────────────────

  console.log('\n\n' + '='.repeat(80))
  console.log('SUMMARY')
  console.log('='.repeat(80))

  // Group by width+mode, average across all images
  const grouped = new Map<string, { avgMs: number[]; chars: number[] }>()
  for (const r of results) {
    const key = `${r.width}|${r.mode}`
    if (!grouped.has(key)) grouped.set(key, { avgMs: [], chars: [] })
    const g = grouped.get(key)!
    g.avgMs.push(r.avgMs)
    g.chars.push(r.charCount)
  }

  console.log(
    '\n' +
      'Width'.padEnd(8) +
      'Mode'.padEnd(10) +
      'Avg Time'.padEnd(12) +
      'Avg Chars'.padEnd(12) +
      'Char Range',
  )
  console.log('-'.repeat(60))

  for (const width of WIDTHS) {
    for (const mode of MODES) {
      const key = `${width}|${mode}`
      const g = grouped.get(key)
      if (!g) continue
      const avgTime = Math.round(g.avgMs.reduce((a, b) => a + b, 0) / g.avgMs.length)
      const avgChars = Math.round(g.chars.reduce((a, b) => a + b, 0) / g.chars.length)
      const minChars = Math.min(...g.chars)
      const maxChars = Math.max(...g.chars)
      console.log(
        `${String(width).padEnd(8)}${mode.padEnd(10)}${(avgTime + 'ms').padEnd(12)}${String(avgChars).padEnd(12)}${minChars}-${maxChars}`,
      )
    }
  }

  // ── Quality comparison: show char count delta vs original ───────────────

  console.log('\n\nQUALITY: Character count relative to full-resolution accurate mode')
  console.log('-'.repeat(70))

  for (const png of pngs) {
    const shortName = path.relative(DEBUG_PIPELINE_DIR, png)
    const baselineKey = `${shortName}|${WIDTHS[0]}|accurate`
    const baselineChars = ocrOutputs[baselineKey]?.length ?? 0
    if (!baselineChars) continue

    console.log(`\n  ${shortName} (baseline: ${baselineChars} chars)`)
    for (const width of WIDTHS) {
      for (const mode of MODES) {
        const key = `${shortName}|${width}|${mode}`
        const chars = ocrOutputs[key]?.length ?? 0
        const pct = ((chars / baselineChars) * 100).toFixed(1)
        const delta = chars - baselineChars
        const deltaStr = delta >= 0 ? `+${delta}` : `${delta}`
        console.log(
          `    ${String(width).padStart(4)}px ${mode.padEnd(8)} : ${String(chars).padStart(5)} chars (${pct}%, ${deltaStr})`,
        )
      }
    }
  }

  // ── Save OCR outputs for manual quality inspection ──────────────────────

  for (const [key, text] of Object.entries(ocrOutputs)) {
    const [img, width, mode] = key.split('|')
    const safeName = img.replace(/[/\\]/g, '_').replace(/\.png$/, '')
    const outFile = path.join(outputDir, `${safeName}_w${width}_${mode}.txt`)
    fs.writeFileSync(outFile, text)
  }

  // ── Save JSON results ─────────────────────────────────────────────────

  const jsonPath = path.join(outputDir, 'results.json')
  fs.writeFileSync(jsonPath, JSON.stringify(results, null, 2))

  console.log(`\n\nOCR text outputs saved to: ${outputDir}`)
  console.log(`JSON results saved to: ${jsonPath}`)

  // cleanup tmp dir
  try {
    fs.rmdirSync(tmpDir)
  } catch {
    /* ignore cleanup errors */
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err)
  process.exit(1)
})
