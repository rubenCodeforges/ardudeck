import { ipcMain, safeStorage } from 'electron';
import Store from 'electron-store';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { OverlayFetchParams } from '../../shared/overlay-types.js';
import { getRainViewerMeta } from './rainviewer.js';
import { fetchAirspace, fetchAirports } from './openaip.js';

// ─── API Key Store (encrypted) ───────────────────────────────────────────────

interface ApiKeyStoreSchema {
  keys: Record<string, string>;
}

const apiKeyStore = new Store<ApiKeyStoreSchema>({
  name: 'api-keys',
  defaults: { keys: {} },
});

export function getApiKey(service: string): string | null {
  const stored = apiKeyStore.get('keys')[service];
  if (!stored) return null;
  try {
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(Buffer.from(stored, 'base64'));
    }
    return stored;
  } catch {
    return null;
  }
}

function setApiKey(service: string, key: string): void {
  const keys = { ...apiKeyStore.get('keys') };
  if (!key) {
    delete keys[service];
  } else if (safeStorage.isEncryptionAvailable()) {
    keys[service] = safeStorage.encryptString(key).toString('base64');
  } else {
    keys[service] = key;
  }
  apiKeyStore.set('keys', keys);
}

// ─── IPC Registration ────────────────────────────────────────────────────────

export function setupOverlayHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_RADAR_META, async () => {
    return getRainViewerMeta();
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_AIRSPACE, async (_event, params: OverlayFetchParams) => {
    const key = getApiKey('openaip');
    if (!key) return { error: 'no-key', data: [] };
    const data = await fetchAirspace(params, key);
    return { data };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_AIRPORTS, async (_event, params: OverlayFetchParams) => {
    const key = getApiKey('openaip');
    if (!key) return { error: 'no-key', data: [] };
    const data = await fetchAirports(params, key);
    return { data };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_GET_API_KEY, async (_event, service: string) => {
    const key = getApiKey(service);
    return { hasKey: !!key, key: key ?? '' };
  });

  ipcMain.handle(IPC_CHANNELS.OVERLAY_SET_API_KEY, async (_event, service: string, key: string) => {
    setApiKey(service, key);
    return { success: true };
  });
}
