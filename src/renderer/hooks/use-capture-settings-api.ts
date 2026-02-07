import type { CaptureSettingsAPI } from '../../shared/types'

export function useCaptureSettingsAPI(): CaptureSettingsAPI {
  const api = (window as unknown as { captureSettingsAPI?: CaptureSettingsAPI }).captureSettingsAPI
  if (api === undefined) throw new Error('captureSettingsAPI not available')
  return api
}
