import { describe, expect, it } from 'vitest'
import { ScreenshotDaemon } from './native-screenshot'

describe('ScreenshotDaemon', () => {
  it('exports ScreenshotDaemon class', () => {
    expect(ScreenshotDaemon).toBeDefined()
    expect(typeof ScreenshotDaemon).toBe('function')
  })

  it('throws when capturing before start', async () => {
    const daemon = new ScreenshotDaemon()
    await expect(daemon.capture({ outputPath: '/tmp/test.jpg' })).rejects.toThrow(
      '[ScreenshotDaemon] Not started',
    )
  })
})
