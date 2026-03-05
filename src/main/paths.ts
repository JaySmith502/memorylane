import * as path from 'path'
import * as os from 'os'

const DEV_ELECTRON_EXECUTABLE_NAMES = new Set(['electron', 'electron.exe'])
const APP_DIRECTORY_NAME = 'MemoryLane'
const DEV_APP_DIRECTORY_SUFFIX = '-dev'

/**
 * Gets the default path for the SQLite database file.
 * Used when running outside of the main Electron process (e.g. CLI tools, MCP server standalone).
 * In the main Electron process, it is preferred to use app.getPath('userData').
 */
export function getDefaultDbPath(): string {
  const dev = isDevRuntime()
  const dbFile = dev ? 'memorylane-dev.db' : 'memorylane.db'

  if (process.versions.electron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron')
      if (app) {
        const userDataPath = app.getPath('userData')
        return path.join(userDataPath, dbFile)
      }
    } catch {
      // Ignore error if electron module is not available or app is not ready
    }
  }

  // Fallback for CLI / Standalone mode (mimic Electron's default paths)
  return buildFallbackDbPath(process.platform, os.homedir(), process.env.APPDATA, dev)
}

export function isDevRuntime(): boolean {
  if (process.versions.electron) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { app } = require('electron')
      if (app) return !app.isPackaged
    } catch {
      // require('electron') can fail under ELECTRON_RUN_AS_NODE
    }

    return !isPackagedElectronExecutable(process.execPath)
  }
  return process.env.NODE_ENV !== 'production'
}

export function getAppDirectoryName(dev: boolean): string {
  return dev ? `${APP_DIRECTORY_NAME}${DEV_APP_DIRECTORY_SUFFIX}` : APP_DIRECTORY_NAME
}

export function isPackagedElectronExecutable(execPath: string): boolean {
  const executableName = execPath.split(/[\\/]/).pop()?.toLowerCase() ?? ''
  return !DEV_ELECTRON_EXECUTABLE_NAMES.has(executableName)
}

export function buildFallbackDbPath(
  platform: NodeJS.Platform,
  homeDir: string,
  appDataDir: string | undefined,
  dev: boolean,
): string {
  const pathApi = platform === 'win32' ? path.win32 : path.posix
  const appDirectory = getAppDirectoryName(dev)
  const dbFile = dev ? 'memorylane-dev.db' : 'memorylane.db'

  if (platform === 'darwin') {
    return pathApi.join(homeDir, 'Library', 'Application Support', appDirectory, dbFile)
  }
  if (platform === 'win32') {
    return pathApi.join(appDataDir || '', appDirectory, dbFile)
  }
  return pathApi.join(homeDir, '.config', appDirectory, dbFile)
}
