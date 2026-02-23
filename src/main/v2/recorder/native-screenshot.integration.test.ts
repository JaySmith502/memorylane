import * as fs from 'fs'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import {
  __getNativeScreenshotHelperPidForTests,
  captureDesktop,
  disposeNativeScreenshotHelper,
} from './native-screenshot'

const RUN_INTEGRATION =
  process.platform === 'darwin' && process.env.RUN_NATIVE_SCREENSHOT_INTEGRATION === '1'
const describeIntegration = RUN_INTEGRATION ? describe.sequential : describe.skip

const SCREENSHOT_BINARY_PATH = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), '.debug-native-screenshot')
const RUN_OUTPUT_DIR = path.join(OUTPUT_ROOT_DIR, new Date().toISOString().replace(/[:.]/g, '-'))

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function assertPng(pathname: string): void {
  expect(fs.existsSync(pathname)).toBe(true)
  const bytes = fs.readFileSync(pathname)
  expect(bytes.length).toBeGreaterThan(PNG_SIGNATURE.length)
  expect(bytes.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)).toBe(true)
}

async function captureWithRetry(
  options: Parameters<typeof captureDesktop>[0],
  attempts = 2,
): Promise<Awaited<ReturnType<typeof captureDesktop>>> {
  let lastError: unknown

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await captureDesktop(options)
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      const isTimeout = message.includes('timed out')
      if (!isTimeout || attempt === attempts) {
        throw error
      }
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

describeIntegration('native screenshot integration', () => {
  beforeAll(() => {
    if (!fs.existsSync(SCREENSHOT_BINARY_PATH)) {
      throw new Error(
        `Missing screenshot binary at ${SCREENSHOT_BINARY_PATH}. Run "npm run build:swift" first.`,
      )
    }

    fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true })
  })

  afterAll(() => {
    delete process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
    delete process.env.MEMORYLANE_SCREENSHOT_TEST_META
    return disposeNativeScreenshotHelper()
  })

  it('captures a real desktop screenshot using default executable resolution', async () => {
    const outputPath = path.join(RUN_OUTPUT_DIR, 'desktop.png')
    const result = await captureWithRetry({ outputPath })

    expect(result.filepath).toBe(outputPath)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    assertPng(outputPath)
  }, 20_000)

  it('captures a screenshot for an explicitly requested display id', async () => {
    const baselinePath = path.join(RUN_OUTPUT_DIR, 'baseline-display.png')
    const baselineCapture = await captureWithRetry({ outputPath: baselinePath })
    assertPng(baselinePath)

    const explicitOutputPath = path.join(RUN_OUTPUT_DIR, 'explicit-display.png')
    const explicitCapture = await captureWithRetry({
      outputPath: explicitOutputPath,
      displayId: baselineCapture.displayId,
    })

    expect(explicitCapture.filepath).toBe(explicitOutputPath)
    expect(explicitCapture.displayId).toBe(baselineCapture.displayId)
    expect(explicitCapture.width).toBeGreaterThan(0)
    expect(explicitCapture.height).toBeGreaterThan(0)
    assertPng(explicitOutputPath)
  }, 20_000)

  it('respects max dimension when requested', async () => {
    const outputPath = path.join(RUN_OUTPUT_DIR, 'max-dimension.png')
    const result = await captureWithRetry({ outputPath, maxDimensionPx: 1920 })

    expect(result.filepath).toBe(outputPath)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1920)
    assertPng(outputPath)
  }, 20_000)

  it('prints where screenshots were saved for manual inspection', () => {
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'desktop.png'))).toBe(true)
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'explicit-display.png'))).toBe(true)
    console.log(`[NativeScreenshotIntegration] Saved captures in: ${RUN_OUTPUT_DIR}`)
  })

  it('reuses a persistent helper process across captureDesktop calls', async () => {
    const out1 = path.join(RUN_OUTPUT_DIR, 'reuse-helper-1.png')
    const out2 = path.join(RUN_OUTPUT_DIR, 'reuse-helper-2.png')

    const first = await captureWithRetry({ outputPath: out1, maxDimensionPx: 1920 })
    const pid1 = __getNativeScreenshotHelperPidForTests()
    const second = await captureWithRetry({ outputPath: out2, maxDimensionPx: 1920 })
    const pid2 = __getNativeScreenshotHelperPidForTests()

    expect(first.width).toBeGreaterThan(0)
    expect(second.width).toBeGreaterThan(0)
    expect(pid1).not.toBeNull()
    expect(pid1).toBe(pid2)
    assertPng(out1)
    assertPng(out2)
  }, 20_000)

  it('keeps a stream-backed helper stable across several captures', async () => {
    let firstPid: number | null = null

    for (let i = 0; i < 5; i += 1) {
      const outputPath = path.join(RUN_OUTPUT_DIR, `stream-stability-${i}.png`)
      const result = await captureWithRetry({ outputPath, maxDimensionPx: 1280 })
      const pid = __getNativeScreenshotHelperPidForTests()

      expect(result.width).toBeGreaterThan(0)
      expect(result.height).toBeGreaterThan(0)
      expect(pid).not.toBeNull()
      if (firstPid === null) {
        firstPid = pid
      } else {
        expect(pid).toBe(firstPid)
      }
      assertPng(outputPath)
    }
  }, 40_000)
})
