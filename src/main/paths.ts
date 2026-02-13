import * as path from 'path'
import * as os from 'os'

/**
 * Gets the default path for the SQLite database file.
 * Used when running outside of the main Electron process (e.g. CLI tools, MCP server standalone).
 * In the main Electron process, it is preferred to use app.getPath('userData').
 */
export function getDefaultDbPath(): string {
  const dbFile = isDev() ? 'memorylane-dev.db' : 'memorylane.db'

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
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'memorylane', dbFile)
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'memorylane', dbFile)
  }
  return path.join(os.homedir(), '.config', 'memorylane', dbFile)
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
    // Electron binary but no app API (ELECTRON_RUN_AS_NODE mode) —
    // default to production unless NODE_ENV explicitly says otherwise.
    return process.env.NODE_ENV === 'development'
  }
  return process.env.NODE_ENV !== 'production'
}
