import * as path from 'path';
import * as os from 'os';

/**
 * Gets the default path for the LanceDB database.
 * This is primarily used when running outside of the main Electron process (e.g. CLI tools, MCP server standalone).
 * In the main Electron process, it is preferred to use app.getPath('userData').
 */
export function getDefaultDbPath(): string {
  const dbDir = isDev() ? 'lancedb-dev' : 'lancedb';

  // Check if running in Electron (using process.versions.electron)
  if (process.versions.electron) {
    try {
      // Dynamic require to avoid issues when running outside Electron (e.g., CLI tools)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { app } = require('electron');
      // If app is available (main process), use it
      if (app) {
        const userDataPath = app.getPath('userData');
        return path.join(userDataPath, dbDir);
      }
    } catch (e) {
      // Ignore error if electron module is not available or app is not ready
    }
  }

  // Fallback for CLI / Standalone mode (mimic Electron's default paths)
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'memorylane', dbDir);
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || '', 'memorylane', dbDir);
  }
  // Linux and others
  return path.join(os.homedir(), '.config', 'memorylane', dbDir);
}

function isDev(): boolean {
  if (process.versions.electron) {
    try {
      const { app } = require('electron');
      if (app) return !app.isPackaged;
    } catch (e) {
      // Fall through to env check
    }
  }
  return process.env.NODE_ENV !== 'production';
}
