import { app, BrowserWindow, dialog, ipcMain } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { UserModel, UserModelImportRequest, UserModelImportResult } from '../../shared/scene-models/user-models.js';
import { builtinProj4 } from '../../shared/scene-models/parsers/index.js';
import { t } from '../../shared/i18n/index.js';
import { UserModelLibrary } from './user-model-library.js';
import { createCrsResolver } from './crs.js';
import { createPointCloudRunner } from './point-cloud-runner.js';
import { loadGeoid } from './geoid-loader.js';

function broadcast(models: UserModel[]): void {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed() && !w.webContents.isDestroyed()) w.webContents.send(IPC_CHANNELS.USER_MODELS_CHANGED, models);
  }
}

export function initUserModelsHandlers(): void {
  const baseDir = join(app.getPath('userData'), 'user-models');
  const lib = new UserModelLibrary({
    baseDir,
    geoid: loadGeoid,
    resolveCrs: createCrsResolver(join(baseDir, 'crs-cache.json'), { builtin: builtinProj4 }),
    convertPointCloud: createPointCloudRunner(join(baseDir, 'crs-cache.json')),
    onChange: broadcast,
  });
  try {
    lib.init();
  } catch (err) {
    console.error('[user-models] init failed:', err);
  }
  app.on('will-quit', () => lib.dispose());

  ipcMain.handle(IPC_CHANNELS.USER_MODELS_LIST, () => lib.list());

  ipcMain.handle(IPC_CHANNELS.USER_MODELS_IMPORT, async (event, req?: UserModelImportRequest): Promise<UserModelImportResult> => {
    let paths = Array.isArray(req?.paths) ? req.paths.filter((p) => typeof p === 'string' && p) : [];
    if (paths.length === 0) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = {
        title: t('main:userModels.importTitle'),
        filters: [
          { name: t('main:fileFilters.models3d'), extensions: ['glb', 'gltf', 'kmz', 'kml', 'json', 'cityjson', 'las', 'laz', 'ply', 'zip'] },
          { name: 'glTF', extensions: ['glb', 'gltf'] },
          { name: t('main:fileFilters.kmlKmz'), extensions: ['kml', 'kmz'] },
          { name: '3D Tiles / CityJSON', extensions: ['json', 'cityjson'] },
          { name: t('main:fileFilters.pointClouds'), extensions: ['las', 'laz', 'ply'] },
          { name: t('main:fileFilters.zipArchive'), extensions: ['zip'] },
        ],
        properties: ['openFile', 'multiSelections'],
      };
      const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
      if (res.canceled || res.filePaths.length === 0) return { imported: [], failed: [], needsPlacement: [] };
      paths = res.filePaths;
    }
    const drop = req?.dropAt;
    const dropAt = drop && Number.isFinite(drop.lat) && Number.isFinite(drop.lng) ? { lat: drop.lat, lng: drop.lng } : undefined;
    return lib.importFiles(paths, dropAt);
  });

  ipcMain.handle(IPC_CHANNELS.USER_MODELS_UPDATE, (_e, id: string, patch: Parameters<UserModelLibrary['update']>[1]) => lib.update(id, patch));
  ipcMain.handle(IPC_CHANNELS.USER_MODELS_REMOVE, (_e, id: string) => lib.remove(id));
  ipcMain.handle(IPC_CHANNELS.USER_MODELS_WATCH_LIST, () => lib.listWatched());

  ipcMain.handle(IPC_CHANNELS.USER_MODELS_WATCH_ADD, async (event, dir?: string): Promise<{ dir: string | null; error?: string }> => {
    let target = typeof dir === 'string' && dir ? dir : null;
    if (!target) {
      const parent = BrowserWindow.fromWebContents(event.sender);
      const options: Electron.OpenDialogOptions = { title: t('main:userModels.watchFolderTitle'), properties: ['openDirectory'] };
      const res = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options);
      if (res.canceled || !res.filePaths[0]) return { dir: null };
      target = res.filePaths[0];
    }
    return lib.addWatched(target);
  });

  ipcMain.handle(IPC_CHANNELS.USER_MODELS_WATCH_REMOVE, (_e, dir: string) => (typeof dir === 'string' ? lib.removeWatched(dir) : false));
}
