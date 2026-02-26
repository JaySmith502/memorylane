import log from '../../logger'
import { SCREEN_CAPTURER_CONFIG } from '@constants'
import { createScreenCaptureBackend, type ScreenCaptureBackend } from './native-screenshot'
import type { DurableStream } from '../streams/stream'

export interface ScreenCapturerConfig {
  intervalMs?: number
  outputDir: string
  maxDimensionPx?: number
  stream: DurableStream<Frame>
}

export interface Frame {
  filepath: string
  timestamp: number
  width: number
  height: number
  displayId: number
  sequenceNumber: number
}

export class ScreenCapturer {
  private readonly intervalMs: number
  private readonly outputDir: string
  private readonly maxDimensionPx: number | undefined
  private readonly stream: DurableStream<Frame>
  private readonly backend: ScreenCaptureBackend
  private _capturing = false
  private _sequenceNumber = 0

  constructor(config: ScreenCapturerConfig) {
    this.intervalMs = config.intervalMs ?? SCREEN_CAPTURER_CONFIG.DEFAULT_INTERVAL_MS
    this.outputDir = config.outputDir
    this.maxDimensionPx = config.maxDimensionPx ?? SCREEN_CAPTURER_CONFIG.MAX_DIMENSION_PX
    this.stream = config.stream
    this.backend = createScreenCaptureBackend()
  }

  get capturing(): boolean {
    return this._capturing
  }

  setDisplayId(displayId: number | undefined): void {
    this.backend.send({ displayId: displayId ?? null })
  }

  setIntervalMs(ms: number): void {
    this.backend.send({ intervalMs: ms })
  }

  async start(): Promise<void> {
    if (this._capturing) return
    this._capturing = true
    await this.backend.start({
      outputDir: this.outputDir,
      intervalMs: this.intervalMs,
      maxDimensionPx: this.maxDimensionPx,
      onFrame: (capturedFrame) => {
        const frame: Frame = {
          ...capturedFrame,
          sequenceNumber: this._sequenceNumber++,
        }
        this.stream.append(frame).catch((err) => {
          log.error('[ScreenCapturer] Stream append failed:', err)
        })
      },
    })
  }

  async stop(): Promise<void> {
    this._capturing = false
    await this.backend.stop()
  }
}
