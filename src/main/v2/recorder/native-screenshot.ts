import { type ChildProcess, spawn } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as readline from 'readline'
import log from '../../logger'
import { getExecutable } from './native-screenshot-mac'

export interface DesktopCaptureResult {
  filepath: string
  width: number
  height: number
  displayId: number
}

export interface ScreenCaptureBackend {
  start(): Promise<void>
  stop(): Promise<void>
  capture(options: DaemonCaptureOptions): Promise<DesktopCaptureResult>
}

const PLATFORM_SCREEN_CAPTURE_BACKENDS: Partial<
  Record<NodeJS.Platform, () => ScreenCaptureBackend>
> = {
  darwin: () => new ScreenshotDaemon(),
}

export function createScreenCaptureBackend(): ScreenCaptureBackend {
  const factory = PLATFORM_SCREEN_CAPTURE_BACKENDS[process.platform]
  if (!factory) {
    throw new Error(`Screen capture is not supported on platform "${process.platform}"`)
  }
  return factory()
}

function ensureParentDirExists(outputPath: string): void {
  const parentDir = path.dirname(outputPath)
  fs.mkdirSync(parentDir, { recursive: true })
}

// MARK: - ScreenshotDaemon (persistent SCK-backed capture)

export interface DaemonCaptureOptions {
  outputPath: string
  displayId?: number
  maxDimensionPx?: number
  format?: 'jpeg' | 'png'
  quality?: number
}

interface DaemonResponse {
  status: 'ok' | 'error'
  filepath?: string
  width?: number
  height?: number
  displayId?: number
  error?: string
}

const DAEMON_MAX_RESTARTS = 5
const DAEMON_RESTART_BACKOFF_MS = 1_000
const DAEMON_CAPTURE_TIMEOUT_MS = 10_000

export class ScreenshotDaemon {
  private process: ChildProcess | null = null
  private rl: readline.Interface | null = null
  private restartCount = 0
  private started = false
  private restartTimer: ReturnType<typeof setTimeout> | null = null
  private pendingCapture: {
    resolve: (result: DesktopCaptureResult) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
  } | null = null

  async start(): Promise<void> {
    if (this.started) return
    this.started = true
    this.restartCount = 0
    await this.spawnDaemon()
  }

  async stop(): Promise<void> {
    if (!this.started) return
    this.started = false
    this.cancelScheduledRestart()
    this.rejectPending('Daemon stopped')
    this.killProcess()
  }

  async capture(options: DaemonCaptureOptions): Promise<DesktopCaptureResult> {
    if (!this.started) {
      throw new Error('[ScreenshotDaemon] Not started')
    }

    if (this.pendingCapture) {
      throw new Error('[ScreenshotDaemon] Capture already in progress')
    }

    ensureParentDirExists(options.outputPath)

    // If daemon process died, try to restart (cancel any scheduled restart first)
    if (!this.process) {
      this.cancelScheduledRestart()
      await this.spawnDaemon()
    }

    if (!this.process?.stdin?.writable) {
      throw new Error('[ScreenshotDaemon] Daemon stdin not writable')
    }

    return new Promise<DesktopCaptureResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        log.warn('[ScreenshotDaemon] Capture timed out, restarting daemon')
        this.rejectPending('Capture timed out')
        this.killProcess()
        // Will be restarted on next capture call
      }, DAEMON_CAPTURE_TIMEOUT_MS)

      this.pendingCapture = { resolve, reject, timer }

      const command = JSON.stringify({
        output: options.outputPath,
        displayId: options.displayId,
        maxDimension: options.maxDimensionPx,
        format: options.format ?? 'jpeg',
        quality: options.quality ?? 80,
      })

      this.process!.stdin!.write(command + '\n')
    })
  }

  private async spawnDaemon(): Promise<void> {
    const { command, args } = getExecutable()

    log.info('[ScreenshotDaemon] Spawning daemon process')
    const proc = spawn(command, [...args], {
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    this.process = proc

    const rl = readline.createInterface({ input: proc.stdout! })
    this.rl = rl

    rl.on('line', (line) => {
      this.handleResponse(line)
    })

    proc.stderr?.on('data', (chunk) => {
      const msg = chunk.toString().trim()
      if (msg) {
        log.warn(`[ScreenshotDaemon:stderr] ${msg}`)
      }
    })

    proc.on('error', (err) => {
      log.error('[ScreenshotDaemon] Process error:', err)
      this.rejectPending(`Daemon process error: ${err.message}`)
      this.handleProcessExit()
    })

    proc.on('close', (code) => {
      log.warn(`[ScreenshotDaemon] Process exited with code ${code}`)
      this.rejectPending(`Daemon exited with code ${code}`)
      this.handleProcessExit()
    })
  }

  private handleResponse(line: string): void {
    if (!this.pendingCapture) return

    let parsed: DaemonResponse
    try {
      parsed = JSON.parse(line) as DaemonResponse
    } catch {
      log.warn(`[ScreenshotDaemon] Invalid JSON response: ${line}`)
      return
    }

    const { resolve, reject, timer } = this.pendingCapture
    this.pendingCapture = null
    clearTimeout(timer)

    if (parsed.status === 'error') {
      reject(new Error(`[ScreenshotDaemon] ${parsed.error ?? 'Unknown error'}`))
      return
    }

    // Reset restart count on success
    this.restartCount = 0

    resolve({
      filepath: parsed.filepath!,
      width: parsed.width!,
      height: parsed.height!,
      displayId: parsed.displayId!,
    })
  }

  private handleProcessExit(): void {
    this.rl?.close()
    this.rl = null
    this.process = null

    if (!this.started) return

    if (this.restartCount >= DAEMON_MAX_RESTARTS) {
      log.error(`[ScreenshotDaemon] Max restarts (${DAEMON_MAX_RESTARTS}) reached, giving up`)
      this.started = false
      return
    }

    this.restartCount++
    const delay = DAEMON_RESTART_BACKOFF_MS * this.restartCount
    log.info(
      `[ScreenshotDaemon] Scheduling restart ${this.restartCount}/${DAEMON_MAX_RESTARTS} in ${delay}ms`,
    )

    this.restartTimer = setTimeout(() => {
      this.restartTimer = null
      if (!this.started) return
      this.spawnDaemon().catch((err) => {
        log.error('[ScreenshotDaemon] Restart failed:', err)
      })
    }, delay)
  }

  private rejectPending(reason: string): void {
    if (!this.pendingCapture) return
    const { reject, timer } = this.pendingCapture
    this.pendingCapture = null
    clearTimeout(timer)
    reject(new Error(`[ScreenshotDaemon] ${reason}`))
  }

  private cancelScheduledRestart(): void {
    if (this.restartTimer !== null) {
      clearTimeout(this.restartTimer)
      this.restartTimer = null
    }
  }

  private killProcess(): void {
    if (this.process) {
      try {
        this.process.stdin?.end()
        this.process.kill('SIGTERM')
      } catch {
        // best-effort
      }
      this.process = null
    }
    this.rl?.close()
    this.rl = null
  }
}
