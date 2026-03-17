/**
 * IPC Handlers for companion computer features.
 * Bridges renderer requests to the CompanionConnection WebSocket/REST client.
 */

import { ipcMain, safeStorage, BrowserWindow } from 'electron';
import Store from 'electron-store';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { CompanionConnectOptions } from '../../shared/ipc-channels.js';
import { companionConnection } from './companion-connection.js';
import { startDiscovery, stopDiscovery, probeAgent } from './companion-discovery.js';
import { AGENT_DEFAULT_PORT } from '@ardudeck/companion-types';
import type {
  SystemInfo,
  NetworkInfo,
  FileEntry,
  ServiceInfo,
  ServiceAction,
  ContainerInfo,
  ContainerAction,
  ExtensionInfo,
} from '@ardudeck/companion-types';

// Persisted token storage (encrypted with safeStorage)
interface CompanionTokenStore {
  tokens: Record<string, string>; // host -> base64(encrypted(token))
}

const tokenStore = new Store<CompanionTokenStore>({
  name: 'companion-tokens',
  defaults: { tokens: {} },
});

function saveToken(host: string, token: string): void {
  const encrypted = safeStorage.encryptString(token);
  const tokens = tokenStore.get('tokens');
  tokens[host] = encrypted.toString('base64');
  tokenStore.set('tokens', tokens);
}

function loadToken(host: string): string | null {
  const tokens = tokenStore.get('tokens');
  const encoded = tokens[host];
  if (!encoded) return null;
  try {
    const buf = Buffer.from(encoded, 'base64');
    return safeStorage.decryptString(buf);
  } catch {
    return null;
  }
}

export function registerCompanionIpcHandlers(mainWindow: BrowserWindow): void {
  companionConnection.setMainWindow(mainWindow);

  // === Connection management ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_CONNECT, async (_event, options: CompanionConnectOptions) => {
    const port = options.port ?? AGENT_DEFAULT_PORT;
    const success = await companionConnection.connect(options.host, port, options.token);
    if (success) {
      saveToken(options.host, options.token);
    }
    return success;
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_DISCONNECT, async () => {
    companionConnection.disconnect();
  });

  // === Discovery ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_DISCOVER, async (_event, host?: string) => {
    // If a host is given, probe it directly
    if (host) {
      return probeAgent(host);
    }

    // Otherwise start mDNS discovery — results come asynchronously via events
    startDiscovery((result) => {
      if (mainWindow?.webContents) {
        mainWindow.webContents.send(IPC_CHANNELS.COMPANION_DISCOVER_RESULT, result);
      }
    });
    return null;
  });

  // === Layer 2: REST-based requests ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_INFO, async () => {
    return companionConnection.restGet<SystemInfo>('/info');
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_NETWORK, async () => {
    return companionConnection.restGet<NetworkInfo>('/network');
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_SERVICES, async () => {
    return companionConnection.restGet<ServiceInfo[]>('/services');
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_SERVICE_ACTION, async (_event, name: string, action: ServiceAction) => {
    return companionConnection.restPost(`/services/${encodeURIComponent(name)}/${action}`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_PROCESS_KILL, async (_event, pid: number) => {
    return companionConnection.restPost(`/processes/${pid}/kill`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_FILES_LIST, async (_event, path: string) => {
    return companionConnection.restGet<FileEntry[]>(`/files?path=${encodeURIComponent(path)}`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_FILE_READ, async (_event, path: string) => {
    return companionConnection.restGet<unknown>(`/files/read?path=${encodeURIComponent(path)}`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_FILE_WRITE, async (_event, path: string, data: string) => {
    return companionConnection.restPost('/files/write', { path, data });
  });

  // === Terminal ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_TERMINAL_SEND, async (_event, data: string) => {
    companionConnection.send('terminal', data);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_TERMINAL_RESIZE, async (_event, cols: number, rows: number) => {
    companionConnection.send('terminal', { type: 'resize', cols, rows });
  });

  // === Layer 3: Docker ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_CONTAINERS, async () => {
    return companionConnection.restGet<ContainerInfo[]>('/docker/containers');
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_CONTAINER_ACTION, async (_event, id: string, action: ContainerAction) => {
    return companionConnection.restPost(`/docker/containers/${encodeURIComponent(id)}/${action}`);
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_CONTAINER_LOGS, async (_event, id: string) => {
    return companionConnection.restGet<string>(`/docker/containers/${encodeURIComponent(id)}/logs`);
  });

  // === Layer 3: BlueOS Extensions ===

  ipcMain.handle(IPC_CHANNELS.COMPANION_EXTENSIONS, async () => {
    return companionConnection.restGet<ExtensionInfo[]>('/extensions');
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_EXTENSION_INSTALL, async (_event, identifier: string, version: string) => {
    return companionConnection.restPost('/extensions/install', { identifier, version });
  });

  ipcMain.handle(IPC_CHANNELS.COMPANION_EXTENSION_REMOVE, async (_event, identifier: string) => {
    return companionConnection.restPost(`/extensions/${encodeURIComponent(identifier)}/remove`);
  });
}

/** Get the saved token for a host (for auto-connect) */
export function getSavedToken(host: string): string | null {
  return loadToken(host);
}
