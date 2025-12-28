/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout } from '../shared/ipc-channels.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../shared/telemetry-types.js';

type TelemetryUpdate =
  | { type: 'attitude'; data: AttitudeData }
  | { type: 'position'; data: PositionData }
  | { type: 'gps'; data: GpsData }
  | { type: 'battery'; data: BatteryData }
  | { type: 'vfrHud'; data: VfrHudData }
  | { type: 'flight'; data: FlightState };
import type { SerialPortInfo, ScanResult } from '@ardudeck/comms';

/**
 * Exposed API for renderer process
 */
const api = {
  // Port management
  listPorts: (): Promise<SerialPortInfo[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_LIST_PORTS),

  scanPorts: (): Promise<ScanResult[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_SCAN_PORTS),

  connect: (options: ConnectOptions): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_CONNECT, options),

  disconnect: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_DISCONNECT),

  // MAVLink
  sendMessage: (payload: number[]): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MAVLINK_SEND, payload),

  // Event listeners
  onPacket: (callback: (packet: { msgid: number; sysid: number; compid: number; seq: number; payload: number[] }) => void) => {
    const handler = (_: unknown, packet: { msgid: number; sysid: number; compid: number; seq: number; payload: number[] }) => callback(packet);
    ipcRenderer.on(IPC_CHANNELS.MAVLINK_PACKET, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MAVLINK_PACKET, handler);
  },

  onConnectionState: (callback: (state: ConnectionState) => void) => {
    const handler = (_: unknown, state: ConnectionState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.CONNECTION_STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONNECTION_STATE, handler);
  },

  onScanProgress: (callback: (progress: { port: string; baudRate: number; status: string }) => void) => {
    const handler = (_: unknown, progress: { port: string; baudRate: number; status: string }) => callback(progress);
    ipcRenderer.on('scan:progress', handler);
    return () => ipcRenderer.removeListener('scan:progress', handler);
  },

  onConnectionError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on('connection:error', handler);
    return () => ipcRenderer.removeListener('connection:error', handler);
  },

  onConsoleLog: (callback: (entry: ConsoleLogEntry) => void) => {
    const handler = (_: unknown, entry: ConsoleLogEntry) => callback(entry);
    ipcRenderer.on(IPC_CHANNELS.CONSOLE_LOG, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CONSOLE_LOG, handler);
  },

  onTelemetryUpdate: (callback: (update: TelemetryUpdate) => void) => {
    const handler = (_: unknown, update: TelemetryUpdate) => callback(update);
    ipcRenderer.on(IPC_CHANNELS.TELEMETRY_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TELEMETRY_UPDATE, handler);
  },

  // Layout management
  getAllLayouts: (): Promise<Record<string, SavedLayout>> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_GET_ALL),

  getLayout: (name: string): Promise<SavedLayout | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_GET, name),

  saveLayout: (name: string, data: unknown): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_SAVE, name, data),

  deleteLayout: (name: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_DELETE, name),

  setActiveLayout: (name: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_SET_ACTIVE, name),

  getActiveLayout: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.LAYOUT_GET_ACTIVE),
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for renderer
export type ElectronAPI = typeof api;
