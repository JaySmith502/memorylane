import * as fs from 'fs'
import * as path from 'path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ScreenshotDaemon } from './native-screenshot'

const RUN_INTEGRATION =
  process.platform === 'darwin' && process.env.RUN_NATIVE_SCREENSHOT_INTEGRATION === '1'
const describeIntegration = RUN_INTEGRATION ? describe.sequential : describe.skip

const SCREENSHOT_BINARY_PATH = path.resolve(process.cwd(), 'build', 'swift', 'screenshot')
const OUTPUT_ROOT_DIR = path.resolve(process.cwd(), '.debug-native-screenshot')
const RUN_OUTPUT_DIR = path.join(OUTPUT_ROOT_DIR, new Date().toISOString().replace(/[:.]/g, '-'))

const JPEG_SIGNATURE = Buffer.from([0xff, 0xd8, 0xff])

function assertJpeg(pathname: string): void {
  expect(fs.existsSync(pathname)).toBe(true)
  const bytes = fs.readFileSync(pathname)
  expect(bytes.length).toBeGreaterThan(JPEG_SIGNATURE.length)
  expect(bytes.subarray(0, JPEG_SIGNATURE.length).equals(JPEG_SIGNATURE)).toBe(true)
}

describeIntegration('native screenshot daemon integration', () => {
  let daemon: ScreenshotDaemon

  beforeAll(async () => {
    if (!fs.existsSync(SCREENSHOT_BINARY_PATH)) {
      throw new Error(
        `Missing screenshot binary at ${SCREENSHOT_BINARY_PATH}. Run "npm run build:swift" first.`,
      )
    }

    fs.mkdirSync(RUN_OUTPUT_DIR, { recursive: true })

    daemon = new ScreenshotDaemon()
    await daemon.start()
  })

  afterAll(async () => {
    await daemon.stop()
    delete process.env.MEMORYLANE_SCREENSHOT_EXECUTABLE
  })

  it('captures a real desktop screenshot via daemon', async () => {
    const outputPath = path.join(RUN_OUTPUT_DIR, 'desktop.jpg')
    const result = await daemon.capture({ outputPath })

    expect(result.filepath).toBe(outputPath)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    assertJpeg(outputPath)
  })

  it('captures a screenshot for an explicitly requested display id', async () => {
    const baselinePath = path.join(RUN_OUTPUT_DIR, 'baseline-display.jpg')
    const baselineCapture = await daemon.capture({ outputPath: baselinePath })
    assertJpeg(baselinePath)

    const explicitOutputPath = path.join(RUN_OUTPUT_DIR, 'explicit-display.jpg')
    const explicitCapture = await daemon.capture({
      outputPath: explicitOutputPath,
      displayId: baselineCapture.displayId,
    })

    expect(explicitCapture.filepath).toBe(explicitOutputPath)
    expect(explicitCapture.displayId).toBe(baselineCapture.displayId)
    expect(explicitCapture.width).toBeGreaterThan(0)
    expect(explicitCapture.height).toBeGreaterThan(0)
    assertJpeg(explicitOutputPath)
  })

  it('respects max dimension when requested', async () => {
    const outputPath = path.join(RUN_OUTPUT_DIR, 'max-dimension.jpg')
    const result = await daemon.capture({ outputPath, maxDimensionPx: 1920 })

    expect(result.filepath).toBe(outputPath)
    expect(result.width).toBeGreaterThan(0)
    expect(result.height).toBeGreaterThan(0)
    expect(Math.max(result.width, result.height)).toBeLessThanOrEqual(1920)
    assertJpeg(outputPath)
  })

  it('prints where screenshots were saved for manual inspection', () => {
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'desktop.jpg'))).toBe(true)
    expect(fs.existsSync(path.join(RUN_OUTPUT_DIR, 'explicit-display.jpg'))).toBe(true)
    console.log(`[NativeScreenshotIntegration] Saved captures in: ${RUN_OUTPUT_DIR}`)
  })
})
