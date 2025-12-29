/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout, type SettingsStoreSchema } from '../shared/ipc-channels.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../shared/telemetry-types.js';
import type { ParamValuePayload, ParameterProgress } from '../shared/parameter-types.js';
import type { ParameterMetadataStore } from '../shared/parameter-metadata.js';
import type { MissionItem, MissionProgress } from '../shared/mission-types.js';

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

  // Parameter management
  requestAllParameters: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_REQUEST_ALL),

  setParameter: (paramId: string, value: number, type: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_SET, paramId, value, type),

  onParamValue: (callback: (param: ParamValuePayload) => void) => {
    const handler = (_: unknown, param: ParamValuePayload) => callback(param);
    ipcRenderer.on(IPC_CHANNELS.PARAM_VALUE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PARAM_VALUE, handler);
  },

  onParamProgress: (callback: (progress: ParameterProgress) => void) => {
    const handler = (_: unknown, progress: ParameterProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.PARAM_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PARAM_PROGRESS, handler);
  },

  onParamComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.PARAM_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PARAM_COMPLETE, handler);
  },

  onParamError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.PARAM_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.PARAM_ERROR, handler);
  },

  // Parameter metadata
  fetchParameterMetadata: (mavType: number): Promise<{ success: boolean; metadata?: ParameterMetadataStore; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_METADATA_FETCH, mavType),

  // Parameter file operations
  writeParamsToFlash: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_WRITE_FLASH),

  saveParamsToFile: (params: Array<{ id: string; value: number }>): Promise<{ success: boolean; error?: string; filePath?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_SAVE_FILE, params),

  loadParamsFromFile: (): Promise<{ success: boolean; error?: string; params?: Array<{ id: string; value: number }> }> =>
    ipcRenderer.invoke(IPC_CHANNELS.PARAM_LOAD_FILE),

  // Mission planning
  downloadMission: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_DOWNLOAD),

  uploadMission: (items: MissionItem[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_UPLOAD, items),

  clearMission: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_CLEAR),

  setCurrentWaypoint: (seq: number): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_SET_CURRENT, seq),

  saveMissionToFile: (items: MissionItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_SAVE_FILE, items),

  loadMissionFromFile: (): Promise<{ success: boolean; items?: MissionItem[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MISSION_LOAD_FILE),

  // Mission event listeners
  onMissionItem: (callback: (item: MissionItem) => void) => {
    const handler = (_: unknown, item: MissionItem) => callback(item);
    ipcRenderer.on(IPC_CHANNELS.MISSION_ITEM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_ITEM, handler);
  },

  onMissionProgress: (callback: (progress: MissionProgress) => void) => {
    const handler = (_: unknown, progress: MissionProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.MISSION_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_PROGRESS, handler);
  },

  onMissionComplete: (callback: (items: MissionItem[]) => void) => {
    const handler = (_: unknown, items: MissionItem[]) => callback(items);
    ipcRenderer.on(IPC_CHANNELS.MISSION_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_COMPLETE, handler);
  },

  onMissionError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.MISSION_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_ERROR, handler);
  },

  onMissionCurrent: (callback: (seq: number) => void) => {
    const handler = (_: unknown, seq: number) => callback(seq);
    ipcRenderer.on(IPC_CHANNELS.MISSION_CURRENT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_CURRENT, handler);
  },

  onMissionReached: (callback: (seq: number) => void) => {
    const handler = (_: unknown, seq: number) => callback(seq);
    ipcRenderer.on(IPC_CHANNELS.MISSION_REACHED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_REACHED, handler);
  },

  onMissionUploadComplete: (callback: (itemCount: number) => void) => {
    const handler = (_: unknown, itemCount: number) => callback(itemCount);
    ipcRenderer.on(IPC_CHANNELS.MISSION_UPLOAD_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_UPLOAD_COMPLETE, handler);
  },

  onMissionClearComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.MISSION_CLEAR_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MISSION_CLEAR_COMPLETE, handler);
  },

  // Settings/Vehicle profiles
  getSettings: (): Promise<SettingsStoreSchema> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (settings: SettingsStoreSchema): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for renderer
export type ElectronAPI = typeof api;
