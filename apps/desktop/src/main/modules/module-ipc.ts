/**
 * IPC handlers for Module Manager.
 * Bridges renderer requests to module-manager orchestrator.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  activateLicense,
  getInstalledModules,
  removeLicense,
  checkForUpdates,
  heartbeatAll,
  updateModule,
} from './module-manager.js';
import { getLoadedModules, loadAllModules } from './module-registry.js';
import { killPty, resizePty, spawnPty, writePty } from './module-pty-service.js';

export function setupModuleIpc(mainWindow: BrowserWindow): void {
  // Activate a license key
  ipcMain.handle(IPC_CHANNELS.MODULE_ACTIVATE, async (_, key: string) => {
    try {
      const result = await activateLicense(key, (progress) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODULE_PROGRESS, progress);
      });
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // List installed modules
  ipcMain.handle(IPC_CHANNELS.MODULE_LIST, () => {
    try {
      return getInstalledModules();
    } catch (err) {
      console.error('[ModuleIPC] List error:', err);
      return [];
    }
  });

  // Remove a license and its modules
  ipcMain.handle(IPC_CHANNELS.MODULE_REMOVE, async (_, key: string) => {
    try {
      return await removeLicense(key);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Check for updates
  ipcMain.handle(IPC_CHANNELS.MODULE_CHECK_UPDATES, async () => {
    try {
      return { updates: await checkForUpdates() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ModuleIPC] Update check error:', err);
      return { updates: [], error: message };
    }
  });

  // Update one installed module to the latest published version
  ipcMain.handle(IPC_CHANNELS.MODULE_UPDATE, async (_, slug: string) => {
    try {
      return await updateModule(slug, (progress) => {
        mainWindow.webContents.send(IPC_CHANNELS.MODULE_PROGRESS, progress);
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // --------------------------------------------------------------------------
  // Module Host (runtime API for loaded modules)
  // --------------------------------------------------------------------------

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_LIST_LOADED, () => {
    return getLoadedModules().map((r) => ({
      slug: r.slug,
      manifest: r.manifest,
      installPath: r.installPath,
    }));
  });

  ipcMain.handle(
    IPC_CHANNELS.MODULE_HOST_PTY_CREATE,
    (
      event,
      slug: string,
      opts: {
        shell: string;
        args?: string[];
        cwd?: string;
        env?: Record<string, string>;
        cols?: number;
        rows?: number;
      },
    ) => {
      const rec = getLoadedModules().find((r) => r.slug === slug);
      if (!rec) throw new Error(`unknown module: ${slug}`);
      if (!rec.manifest.permissions?.includes('pty')) {
        throw new Error(`module ${slug} lacks pty permission`);
      }
      return spawnPty({
        moduleSlug: slug,
        windowId: event.sender.id,
        shell: opts.shell,
        args: opts.args,
        cwd: opts.cwd,
        env: opts.env,
        cols: opts.cols,
        rows: opts.rows,
      });
    },
  );

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_PTY_WRITE, (_e, id: string, data: string) =>
    writePty(id, data),
  );

  ipcMain.handle(
    IPC_CHANNELS.MODULE_HOST_PTY_RESIZE,
    (_e, id: string, cols: number, rows: number) => resizePty(id, cols, rows),
  );

  ipcMain.handle(IPC_CHANNELS.MODULE_HOST_PTY_KILL, (_e, id: string) => killPty(id));

  // Run heartbeat on app launch (background, non-blocking)
  setTimeout(() => {
    heartbeatAll().catch((err) => {
      console.warn('[ModuleIPC] Background heartbeat failed:', err);
    });
  }, 5000); // Delay 5s after startup

  // Load all installed modules (background, non-blocking)
  loadAllModules().catch((err) => {
    console.error('[ModuleIPC] Load-all failed:', err);
  });
}
