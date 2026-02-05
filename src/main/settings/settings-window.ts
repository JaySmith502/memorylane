import { BrowserWindow, ipcMain, IpcMainInvokeEvent } from 'electron';
import path from 'node:path';
import { ApiKeyManager } from './api-key-manager';

let settingsWindow: BrowserWindow | null = null;

/**
 * Open (or focus) the settings window
 */
export function openSettingsWindow(): void {
  // If window already exists, focus it
  if (settingsWindow && !settingsWindow.isDestroyed()) {
    settingsWindow.focus();
    return;
  }

  settingsWindow = new BrowserWindow({
    width: 480,
    height: 360,
    resizable: false,
    minimizable: false,
    maximizable: false,
    title: 'Settings',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Load the settings page
  // In dev mode, load from dev server; in production, load from file
  if (process.env.NODE_ENV === 'development') {
    settingsWindow.loadURL('http://localhost:5173/settings.html');
  } else {
    settingsWindow.loadFile(path.join(__dirname, '../renderer/settings.html'));
  }

  settingsWindow.on('closed', () => {
    settingsWindow = null;
  });
}

/**
 * Initialize IPC handlers for settings
 */
export function initSettingsIPC(apiKeyManager: ApiKeyManager): void {
  // Get current key status
  ipcMain.handle('settings:getKeyStatus', () => {
    return apiKeyManager.getKeyStatus();
  });

  // Save API key
  ipcMain.handle('settings:saveApiKey', (_event: IpcMainInvokeEvent, key: string) => {
    try {
      apiKeyManager.saveApiKey(key);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Delete API key
  ipcMain.handle('settings:deleteApiKey', () => {
    try {
      apiKeyManager.deleteApiKey();
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: message };
    }
  });

  // Close settings window
  ipcMain.on('settings:close', () => {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
      settingsWindow.close();
    }
  });
}
