import { app } from 'electron'
import { autoUpdater } from 'electron-updater'
import log from './logger'

export type UpdateState = 'idle' | 'downloading' | 'ready'
let state: UpdateState = 'idle'

export const getUpdateState = (): UpdateState => state

export const quitAndInstall = (): void => autoUpdater.quitAndInstall()

export const initAutoUpdater = (onUpdateStateChange: () => void): void => {
  if (!app.isPackaged) {
    log.info('[Updater] Skipping in dev mode')
    return
  }

  autoUpdater.logger = log
  autoUpdater.autoDownload = true
  autoUpdater.autoInstallOnAppQuit = true

  autoUpdater.on('update-available', (info) => {
    log.info(`[Updater] Update available: ${info.version}`)
    state = 'downloading'
    onUpdateStateChange()
  })

  autoUpdater.on('update-downloaded', (info) => {
    log.info(`[Updater] Update downloaded: ${info.version}`)
    state = 'ready'
    onUpdateStateChange()
  })

  autoUpdater.on('update-not-available', () => {
    state = 'idle'
    log.info('[Updater] Up to date.')
  })

  autoUpdater.on('error', (err) => {
    log.error('[Updater] Error:', err)
  })

  setTimeout(() => void autoUpdater.checkForUpdates(), 10_000)
  setInterval(() => void autoUpdater.checkForUpdates(), 4 * 60 * 60 * 1000)
}
