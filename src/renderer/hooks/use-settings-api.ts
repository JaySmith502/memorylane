import type { SettingsAPI } from '../../shared/types'

export function useSettingsAPI(): SettingsAPI {
  const api = (window as unknown as { settingsAPI?: SettingsAPI }).settingsAPI
  if (api === undefined) throw new Error('settingsAPI not available')
  return api
}
