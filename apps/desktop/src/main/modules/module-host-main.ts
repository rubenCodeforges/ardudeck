import { app, ipcMain, safeStorage, BrowserWindow } from 'electron';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { MainHostApi, ModuleManifest } from '@ardudeck/module-sdk';
import { vehicleControl } from '../vehicle-control/vehicle-control.js';
import { mediaEngine } from '../media/media-engine.js';

export function createMainHostApi(manifest: ModuleManifest): MainHostApi {
  const dataDir = join(app.getPath('userData'), 'modules', manifest.slug, 'data');

  // Secrets live in a separate .secret file holding OS-encrypted base64.
  const secretPath = (key: string) => join(dataDir, `${key}.secret`);
  const canControl = manifest.permissions?.includes('vehicleControl') ?? false;
  const noPermission = { ok: false, error: "missing the 'vehicleControl' permission" } as const;

  return {
    moduleSlug: manifest.slug,
    dataDir,
    async readData(key) {
      const p = join(dataDir, `${key}.json`);
      try {
        await access(p);
        return await readFile(p, 'utf-8');
      } catch {
        return undefined;
      }
    },
    async writeData(key, value) {
      await mkdir(dataDir, { recursive: true });
      await writeFile(join(dataDir, `${key}.json`), value, 'utf-8');
    },
    async secureRead(key) {
      try {
        await access(secretPath(key));
      } catch {
        return undefined;
      }
      const stored = await readFile(secretPath(key), 'utf-8');
      if (stored.startsWith('plain:')) return stored.slice(6);
      if (!safeStorage.isEncryptionAvailable()) {
        console.warn(`[module:${manifest.slug}] secureRead: OS encryption unavailable, cannot decrypt`);
        return undefined;
      }
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    },
    async secureWrite(key, value) {
      await mkdir(dataDir, { recursive: true });
      if (safeStorage.isEncryptionAvailable()) {
        const enc = safeStorage.encryptString(value).toString('base64');
        await writeFile(secretPath(key), enc, 'utf-8');
      } else {
        console.warn(`[module:${manifest.slug}] secureWrite: OS encryption unavailable, storing plaintext`);
        await writeFile(secretPath(key), `plain:${value}`, 'utf-8');
      }
    },
    log(level, ...args) {
      const tag = `[module:${manifest.slug}]`;
      if (level === 'error') console.error(tag, ...args);
      else if (level === 'warn') console.warn(tag, ...args);
      else console.log(tag, ...args);
    },
    emit(channel, data) {
      // Every window: the first one is not always the main window, and cargo UI also lives in pop-outs.
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) win.webContents.send(`module:${manifest.slug}:event:${channel}`, data);
      }
    },
    onRendererMessage(channel, handler) {
      const fullChannel = `module:${manifest.slug}:${channel}`;
      const listener = async (_: unknown, data: unknown) => handler(data);
      ipcMain.handle(fullChannel, listener);
      return () => ipcMain.removeHandler(fullChannel);
    },
    vehicle: {
      getGuidedState: () => vehicleControl.guidedState(),
      command: async (req) => (canControl ? vehicleControl.command(req) : noPermission),
      setpoint: async (sp) => (canControl ? vehicleControl.setpoint(manifest.slug, sp) : noPermission),
    },
    mavlink: {
      subscribe: (msgIds, listener) => vehicleControl.subscribe(msgIds, listener),
    },
    camera: {
      listStreams: () => mediaEngine.liveStreams(),
    },
  };
}
