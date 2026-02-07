import type { MainWindowAPI } from '@types'

export function useMainWindowAPI(): MainWindowAPI {
  const api = (window as unknown as { mainWindowAPI?: MainWindowAPI }).mainWindowAPI
  if (api === undefined) throw new Error('mainWindowAPI not available')
  return api
}
