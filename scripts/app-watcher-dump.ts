#!/usr/bin/env npx tsx

import * as fs from 'fs'
import * as path from 'path'
import {
  startAppWatcher,
  stopAppWatcher,
  type AppWatcherEvent,
} from '../src/main/recorder/app-watcher'

interface CliArgs {
  durationMs: number
  outputRootDir: string
}

function parseDuration(value: string | undefined, fallback: number): number {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid duration: "${value}". Use a positive integer in ms.`)
  }
  return parsed
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2)
  const defaultDurationMs = parseDuration(process.env.APP_WATCHER_DUMP_MS, 5000)
  let durationMs = defaultDurationMs
  let outputRootDir = path.resolve(process.cwd(), '.debug-app-watcher')

  for (let i = 0; i < args.length; i++) {
    const arg = args[i]
    if (arg === '--duration-ms' && args[i + 1]) {
      durationMs = parseDuration(args[i + 1], defaultDurationMs)
      i++
      continue
    }
    if (arg === '--out-dir' && args[i + 1]) {
      outputRootDir = path.resolve(process.cwd(), args[i + 1])
      i++
      continue
    }
  }

  return { durationMs, outputRootDir }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function writeJsonLines(filepath: string, records: readonly unknown[]): void {
  const payload = records.length > 0 ? `${records.map((r) => JSON.stringify(r)).join('\n')}\n` : ''
  fs.writeFileSync(filepath, payload, 'utf8')
}

function countEventType(events: readonly AppWatcherEvent[], type: AppWatcherEvent['type']): number {
  return events.reduce((count, event) => (event.type === type ? count + 1 : count), 0)
}

async function main(): Promise<void> {
  const { durationMs, outputRootDir } = parseArgs()
  const runOutputDir = path.join(outputRootDir, new Date().toISOString().replace(/[:.]/g, '-'))
  fs.mkdirSync(runOutputDir, { recursive: true })

  const events: AppWatcherEvent[] = []
  const startedAt = Date.now()

  console.log(`[AppWatcherDump] Platform: ${process.platform}`)
  console.log(`[AppWatcherDump] Duration: ${durationMs}ms`)
  console.log(`[AppWatcherDump] Output: ${runOutputDir}`)

  try {
    startAppWatcher((event) => {
      events.push(event)
    })
    await sleep(durationMs)
  } finally {
    stopAppWatcher()
  }

  // Give the child process close handlers a brief moment to settle.
  await sleep(250)

  const finishedAt = Date.now()
  const summary = {
    platform: process.platform,
    durationMs,
    startedAt,
    finishedAt,
    eventCount: events.length,
    readyCount: countEventType(events, 'ready'),
    appChangeCount: countEventType(events, 'app_change'),
    windowChangeCount: countEventType(events, 'window_change'),
    errorCount: countEventType(events, 'error'),
    firstTimestamp: events[0]?.timestamp ?? null,
    lastTimestamp: events[events.length - 1]?.timestamp ?? null,
  }

  writeJsonLines(path.join(runOutputDir, 'watcher-events.jsonl'), events)
  fs.writeFileSync(
    path.join(runOutputDir, 'summary.json'),
    JSON.stringify(summary, null, 2),
    'utf8',
  )

  console.log(`[AppWatcherDump] Saved ${events.length} event(s).`)
  console.log(`[AppWatcherDump] Artifacts: ${runOutputDir}`)
}

main().catch((error) => {
  const message = error instanceof Error ? (error.stack ?? error.message) : String(error)
  console.error(`[AppWatcherDump] Failed: ${message}`)
  process.exit(1)
})
