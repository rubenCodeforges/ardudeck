/**
 * IPC handlers for Module Manager.
 * Bridges renderer requests to module-manager orchestrator.
 */

import { ipcMain, BrowserWindow, dialog } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import {
  activateLicense,
  getInstalledModules,
  removeLicense,
  checkForUpdates,
  heartbeatAll,
  migrateEntitlements,
  updateModule,
  setModuleEnabled,
  listPublicCargos,
  getCargoDetail,
  installFreeCargo,
} from './module-manager.js';
import { getLoadedModules, loadAllModules } from './module-registry.js';
import {
  getDevModules,
  isDevLoadAvailable,
  loadDevModule,
  unloadDevModule,
  watchDevModules,
} from './module-dev.js';
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

  // Toggle a module on/off without removing it (bundle modules apply on restart)
  ipcMain.handle(IPC_CHANNELS.MODULE_SET_ENABLED, (_, slug: string, enabled: boolean) => {
    try {
      return { success: true, modules: setModuleEnabled(slug, enabled) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, error: message };
    }
  });

  // Browse the public, free Hangar catalog
  ipcMain.handle(IPC_CHANNELS.MODULE_CATALOG_LIST, async () => {
    try {
      return { cargos: await listPublicCargos() };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ModuleIPC] Catalog list error:', err);
      return { cargos: [], error: message };
    }
  });

  // Fetch the full marketing detail for one public cargo (preview blocks)
  ipcMain.handle(IPC_CHANNELS.MODULE_CATALOG_DETAIL, async (_, slug: string) => {
    try {
      return { detail: await getCargoDetail(slug) };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ModuleIPC] Catalog detail error:', err);
      return { detail: null, error: message };
    }
  });

  // One-click install a free public cargo by slug
  ipcMain.handle(IPC_CHANNELS.MODULE_INSTALL_FREE, async (_, slug: string) => {
    try {
      return await installFreeCargo(slug, (progress) => {
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
      if (!rec) throw new Error(`unknown module: ${slug}`); // i18n-exempt
      if (!rec.manifest.permissions?.includes('pty')) {
        throw new Error(`module ${slug} lacks pty permission`); // i18n-exempt
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

  ipcMain.handle(IPC_CHANNELS.MODULE_DEV_AVAILABLE, () => isDevLoadAvailable());
  ipcMain.handle(IPC_CHANNELS.MODULE_DEV_LIST, () => getDevModules());

  ipcMain.handle(IPC_CHANNELS.MODULE_DEV_LOAD, async () => {
    if (!isDevLoadAvailable()) return { ok: false, error: 'Not available in a packaged build' }; // i18n-exempt
    const picked = await dialog.showOpenDialog({
      title: 'Load unpacked cargo', // i18n-exempt
      message: 'Choose the folder holding module.json and the built renderer entry', // i18n-exempt
      properties: ['openDirectory'],
    });
    if (picked.canceled || !picked.filePaths[0]) return { ok: false, error: 'Cancelled' };
    const result = loadDevModule(
      picked.filePaths[0],
      getInstalledModules().map((m) => m.slug),
    );
    if (result.ok) startDevWatch();
    return result;
  });

  ipcMain.handle(IPC_CHANNELS.MODULE_DEV_UNLOAD, (_e, slug: string) => {
    unloadDevModule(slug);
    startDevWatch();
    return { ok: true };
  });

  // Before anything reads entitlements: an install made before receipts
  // existed is marked grandfathered so the upgrade cannot lock anyone out.
  migrateEntitlements();

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

  startDevWatch();
}

function startDevWatch(): void {
  watchDevModules((slug) => {
    for (const w of BrowserWindow.getAllWindows()) {
      w.webContents.send(IPC_CHANNELS.MODULE_DEV_CHANGED, slug);
    }
  });
}
