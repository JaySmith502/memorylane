import * as path from 'path'
import * as os from 'os'

const DEV_ELECTRON_EXECUTABLE_NAMES = new Set(['electron', 'electron.exe'])

/**
 * Gets the default path for the SQLite database file.
 * Used when running outside of the main Electron process (e.g. CLI tools, MCP server standalone).
 * In the main Electron process, it is preferred to use app.getPath('userData').
 */
export function getDefaultDbPath(): string {
  const dev = isDev()
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

function isDev(): boolean {
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

export function isPackagedElectronExecutable(execPath: string): boolean {
  const executableName = path.basename(execPath).toLowerCase()
  return !DEV_ELECTRON_EXECUTABLE_NAMES.has(executableName)
}

export function buildFallbackDbPath(
  platform: NodeJS.Platform,
  homeDir: string,
  appDataDir: string | undefined,
  dev: boolean,
): string {
  const appDirectory = dev ? 'memorylane' : 'MemoryLane'
  const dbFile = dev ? 'memorylane-dev.db' : 'memorylane.db'

  if (platform === 'darwin') {
    return path.join(homeDir, 'Library', 'Application Support', appDirectory, dbFile)
  }
  if (platform === 'win32') {
    return path.join(appDataDir || '', appDirectory, dbFile)
  }
  return path.join(homeDir, '.config', appDirectory, dbFile)
}
