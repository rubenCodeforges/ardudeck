import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type {
  CameraSettingsApplyResult,
  CameraSettingsLogin,
  CameraSettingsResult,
  CameraSettingsSnapshot,
} from '../../shared/camera-settings-types.js';
import { SshSession, describeSshError } from './ssh-session.js';
import { discoverCameras } from './camera-discovery.js';
import {
  buildReadScript,
  buildWriteScript,
  mismatchedFields,
  parseReadOutput,
  validateChanges,
  type ChangeSet,
} from './wifilink-device.js';
import { t } from '../../shared/i18n/index.js';

const HOST_RE = /^[A-Za-z0-9.-]{1,253}$/;

let session: SshSession | null = null;
let login: CameraSettingsLogin | null = null;
let last: CameraSettingsSnapshot | null = null;

function drop(): void {
  session?.close();
  session = null;
  login = null;
  last = null;
}

async function read(): Promise<CameraSettingsSnapshot> {
  const r = await session!.run(buildReadScript());
  const parsed = parseReadOutput(r.stdout, login!.host);
  last = parsed.snapshot;
  return parsed.snapshot;
}

export function registerCameraSettingsIpcHandlers(): void {
  ipcMain.handle(
    IPC_CHANNELS.CAMERA_SETTINGS_DISCOVER,
    (_e, creds: { username: string; password: string }, lastHost?: string) =>
      discoverCameras(creds, lastHost && HOST_RE.test(lastHost) ? lastHost : undefined),
  );

  ipcMain.handle(IPC_CHANNELS.CAMERA_SETTINGS_CONNECT, async (_e, req: CameraSettingsLogin): Promise<CameraSettingsResult> => {
    drop();
    const host = req.host.trim();
    if (!HOST_RE.test(host)) return { ok: false, error: t('main:cameraSettings.invalidAddress') };
    try {
      session = await SshSession.open({ host, username: req.username, password: req.password });
      login = { host, username: req.username, password: req.password };
      const r = await session.run(buildReadScript());
      const parsed = parseReadOutput(r.stdout, host);
      if (!parsed.isWifilink) {
        drop();
        return {
          ok: false,
          error: t('main:cameraSettings.notWifilink'),
        };
      }
      last = parsed.snapshot;
      return { ok: true, snapshot: parsed.snapshot };
    } catch (err) {
      drop();
      return { ok: false, error: describeSshError(err, host) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CAMERA_SETTINGS_REFRESH, async (): Promise<CameraSettingsResult> => {
    if (!session?.isAlive || !login) return { ok: false, error: t('main:cameraSettings.notConnected') };
    try {
      return { ok: true, snapshot: await read() };
    } catch (err) {
      return { ok: false, error: describeSshError(err, login.host) };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CAMERA_SETTINGS_APPLY, async (_e, changes: ChangeSet): Promise<CameraSettingsApplyResult> => {
    if (!session?.isAlive || !login || !last) return { ok: false, error: t('main:cameraSettings.notConnected'), mismatched: [] };
    const invalid = validateChanges(changes, last);
    if (invalid) return { ok: false, error: invalid, mismatched: [] };
    try {
      const w = await session.run(buildWriteScript(changes, login));
      const after = await read();
      if (w.code !== 0) {
        return { ok: false, error: w.stderr.trim() || t('main:cameraSettings.changeRefused'), mismatched: mismatchedFields(changes, after), snapshot: after };
      }
      const mismatched = mismatchedFields(changes, after);
      return { ok: mismatched.length === 0, mismatched, snapshot: after };
    } catch (err) {
      return { ok: false, error: describeSshError(err, login.host), mismatched: [] };
    }
  });

  ipcMain.handle(IPC_CHANNELS.CAMERA_SETTINGS_DISCONNECT, () => { drop(); });
}
