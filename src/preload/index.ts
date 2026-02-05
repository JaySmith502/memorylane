// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

import { contextBridge, ipcRenderer, shell } from 'electron';

// Expose settings API to renderer
contextBridge.exposeInMainWorld('settingsAPI', {
  getKeyStatus: () => ipcRenderer.invoke('settings:getKeyStatus'),
  saveApiKey: (key: string) => ipcRenderer.invoke('settings:saveApiKey', key),
  deleteApiKey: () => ipcRenderer.invoke('settings:deleteApiKey'),
  close: () => ipcRenderer.send('settings:close'),
  openExternal: (url: string) => shell.openExternal(url),
});
