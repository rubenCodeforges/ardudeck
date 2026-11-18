import { BrowserWindow, ipcMain } from 'electron';
import { BASEMAP_IPC } from '../../shared/basemap-types.js';
import { listBasemaps, subscribeBasemaps } from './basemap-registry.js';

export function setupBasemapIpc(): void {
  ipcMain.handle(BASEMAP_IPC.list, () => listBasemaps());
  subscribeBasemaps(() => {
    const list = listBasemaps();
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(BASEMAP_IPC.changed, list);
    }
  });
}
