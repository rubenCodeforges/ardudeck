/**
 * IPC Handlers for DroneBridge ESP32 features.
 * Bridges renderer requests to the stateless DroneBridge HTTP client.
 */

import { ipcMain, BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import type { DroneBridgeSettings } from '../../shared/dronebridge-types.js';
import * as client from './dronebridge-client.js';
import { readDroneBridgeBootLog, readDroneBridgeWithReset } from './dronebridge-serial-reader.js';

const DRONEBRIDGE_DEFAULT_IP = '192.168.2.1';

export function registerDroneBridgeIpcHandlers(mainWindow: BrowserWindow): void {
  // Detect a DroneBridge device — probe given IP and the default IP
  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_DETECT, async (_event, ip?: string) => {
    try {
      // Try the provided IP first
      if (ip && ip !== DRONEBRIDGE_DEFAULT_IP) {
        const info = await client.probe(ip);
        if (info) {
          mainWindow.webContents.send(IPC_CHANNELS.DRONEBRIDGE_DETECTED, { ip, info });
          return { ip, info };
        }
      }

      // Try the default DroneBridge IP
      const info = await client.probe(ip ?? DRONEBRIDGE_DEFAULT_IP);
      if (info) {
        const detectedIp = ip ?? DRONEBRIDGE_DEFAULT_IP;
        mainWindow.webContents.send(IPC_CHANNELS.DRONEBRIDGE_DETECTED, { ip: detectedIp, info });
        return { ip: detectedIp, info };
      }

      return null;
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_GET_INFO, async (_event, ip: string) => {
    try {
      return await client.getInfo(ip);
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_GET_STATS, async (_event, ip: string) => {
    try {
      return await client.getStats(ip);
    } catch {
      return null;
    }
  });

  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_GET_SETTINGS, async (_event, ip: string) => {
    try {
      return await client.getSettings(ip);
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.DRONEBRIDGE_UPDATE_SETTINGS,
    async (_event, ip: string, settings: Partial<DroneBridgeSettings>) => {
      try {
        return await client.updateSettings(ip, settings);
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_GET_CLIENTS, async (_event, ip: string) => {
    try {
      return await client.getClients(ip);
    } catch {
      return null;
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.DRONEBRIDGE_ADD_UDP_CLIENT,
    async (_event, ip: string, clientIp: string, clientPort: number) => {
      try {
        await client.addUdpClient(ip, clientIp, clientPort);
        return true;
      } catch {
        return null;
      }
    },
  );

  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_CLEAR_UDP_CLIENTS, async (_event, ip: string) => {
    try {
      await client.clearUdpClients(ip);
      return true;
    } catch {
      return null;
    }
  });

  // Read DroneBridge boot log over USB serial (no WiFi needed)
  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_READ_SERIAL, async (_event, port: string) => {
    try {
      return await readDroneBridgeBootLog(port, 8000);
    } catch {
      return null;
    }
  });

  // Reset ESP32 via DTR toggle and read boot log (for already-connected devices)
  ipcMain.handle(IPC_CHANNELS.DRONEBRIDGE_READ_SERIAL_RESET, async (_event, port: string) => {
    try {
      return await readDroneBridgeWithReset(port, 10000);
    } catch (err) {
      console.error('[DroneBridge] Serial reset read failed:', err);
      throw err;
    }
  });
}
