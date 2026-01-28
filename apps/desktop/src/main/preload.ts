/**
 * Electron Preload Script
 * Exposes safe APIs to the renderer process
 */

import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type ConnectOptions, type ConnectionState, type ConsoleLogEntry, type SavedLayout, type SettingsStoreSchema, type MSPConnectOptions, type MSPConnectionState, type MSPTelemetryData, type SitlConfig, type SitlStatus, type SitlExitData, type VirtualRCState } from '../shared/ipc-channels.js';
import type { AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../shared/telemetry-types.js';
import type { ParamValuePayload, ParameterProgress } from '../shared/parameter-types.js';
import type { ParameterMetadataStore } from '../shared/parameter-metadata.js';
import type { MissionItem, MissionProgress } from '../shared/mission-types.js';
import type { FenceItem, FenceStatus } from '../shared/fence-types.js';
import type { RallyItem } from '../shared/rally-types.js';
import type { DetectedBoard, FirmwareVersion, FlashProgress, FlashResult, FirmwareSource, FirmwareVehicleType, FirmwareManifest, FlashOptions } from '../shared/firmware-types.js';

type TelemetryUpdate =
  | { type: 'attitude'; data: AttitudeData }
  | { type: 'position'; data: PositionData }
  | { type: 'gps'; data: GpsData }
  | { type: 'battery'; data: BatteryData }
  | { type: 'vfrHud'; data: VfrHudData }
  | { type: 'flight'; data: FlightState };

/** Batched telemetry update - reduces IPC overhead from 6 messages to 1 */
interface TelemetryBatch {
  attitude?: AttitudeData;
  position?: PositionData;
  gps?: GpsData;
  battery?: BatteryData;
  vfrHud?: VfrHudData;
  flight?: FlightState;
}
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

  // Cancel auto-reconnect (during expected reboots)
  cancelReconnect: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.RECONNECT_CANCEL),

  // Port watching for detecting new devices
  startPortWatch: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_START_PORT_WATCH),

  stopPortWatch: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.COMMS_STOP_PORT_WATCH),

  onPortChange: (callback: (event: { newPorts: SerialPortInfo[]; removedPorts: string[] }) => void) => {
    const handler = (_: unknown, event: { newPorts: SerialPortInfo[]; removedPorts: string[] }) => callback(event);
    ipcRenderer.on(IPC_CHANNELS.COMMS_NEW_PORT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.COMMS_NEW_PORT, handler);
  },

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

  // Batched telemetry update - single IPC message instead of 6 for better performance
  onTelemetryBatch: (callback: (batch: TelemetryBatch) => void) => {
    const handler = (_: unknown, batch: TelemetryBatch) => callback(batch);
    ipcRenderer.on(IPC_CHANNELS.TELEMETRY_BATCH, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TELEMETRY_BATCH, handler);
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

  // ============================================================================
  // Geofencing (mission_type = FENCE)
  // ============================================================================

  downloadFence: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FENCE_DOWNLOAD),

  uploadFence: (items: FenceItem[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FENCE_UPLOAD, items),

  clearFence: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FENCE_CLEAR),

  saveFenceToFile: (items: FenceItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FENCE_SAVE_FILE, items),

  loadFenceFromFile: (): Promise<{ success: boolean; items?: FenceItem[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FENCE_LOAD_FILE),

  // Fence event listeners
  onFenceItem: (callback: (item: FenceItem) => void) => {
    const handler = (_: unknown, item: FenceItem) => callback(item);
    ipcRenderer.on(IPC_CHANNELS.FENCE_ITEM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_ITEM, handler);
  },

  onFenceProgress: (callback: (progress: MissionProgress) => void) => {
    const handler = (_: unknown, progress: MissionProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.FENCE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_PROGRESS, handler);
  },

  onFenceComplete: (callback: (items: FenceItem[]) => void) => {
    const handler = (_: unknown, items: FenceItem[]) => callback(items);
    ipcRenderer.on(IPC_CHANNELS.FENCE_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_COMPLETE, handler);
  },

  onFenceError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.FENCE_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_ERROR, handler);
  },

  onFenceUploadComplete: (callback: (itemCount: number) => void) => {
    const handler = (_: unknown, itemCount: number) => callback(itemCount);
    ipcRenderer.on(IPC_CHANNELS.FENCE_UPLOAD_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_UPLOAD_COMPLETE, handler);
  },

  onFenceClearComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.FENCE_CLEAR_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_CLEAR_COMPLETE, handler);
  },

  onFenceStatus: (callback: (status: FenceStatus) => void) => {
    const handler = (_: unknown, status: FenceStatus) => callback(status);
    ipcRenderer.on(IPC_CHANNELS.FENCE_STATUS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FENCE_STATUS, handler);
  },

  // ============================================================================
  // Rally Points (mission_type = RALLY)
  // ============================================================================

  downloadRally: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RALLY_DOWNLOAD),

  uploadRally: (items: RallyItem[]): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RALLY_UPLOAD, items),

  clearRally: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RALLY_CLEAR),

  saveRallyToFile: (items: RallyItem[]): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RALLY_SAVE_FILE, items),

  loadRallyFromFile: (): Promise<{ success: boolean; items?: RallyItem[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.RALLY_LOAD_FILE),

  // Rally event listeners
  onRallyItem: (callback: (item: RallyItem) => void) => {
    const handler = (_: unknown, item: RallyItem) => callback(item);
    ipcRenderer.on(IPC_CHANNELS.RALLY_ITEM, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_ITEM, handler);
  },

  onRallyProgress: (callback: (progress: MissionProgress) => void) => {
    const handler = (_: unknown, progress: MissionProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.RALLY_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_PROGRESS, handler);
  },

  onRallyComplete: (callback: (items: RallyItem[]) => void) => {
    const handler = (_: unknown, items: RallyItem[]) => callback(items);
    ipcRenderer.on(IPC_CHANNELS.RALLY_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_COMPLETE, handler);
  },

  onRallyError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.RALLY_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_ERROR, handler);
  },

  onRallyUploadComplete: (callback: (itemCount: number) => void) => {
    const handler = (_: unknown, itemCount: number) => callback(itemCount);
    ipcRenderer.on(IPC_CHANNELS.RALLY_UPLOAD_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_UPLOAD_COMPLETE, handler);
  },

  onRallyClearComplete: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on(IPC_CHANNELS.RALLY_CLEAR_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.RALLY_CLEAR_COMPLETE, handler);
  },

  // Settings/Vehicle profiles
  getSettings: (): Promise<SettingsStoreSchema> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),

  saveSettings: (settings: SettingsStoreSchema): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_SAVE, settings),

  // ============================================================================
  // Firmware Flash
  // ============================================================================

  detectBoard: (): Promise<{ success: boolean; boards?: DetectedBoard[]; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_DETECT_BOARD),

  fetchFirmwareManifest: (
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType,
    boardId: string
  ): Promise<{ success: boolean; manifest?: FirmwareManifest; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_FETCH_MANIFEST, source, vehicleType, boardId),

  fetchFirmwareBoards: (
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType
  ): Promise<{ success: boolean; boards?: Array<{ id: string; name: string; category: string }>; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_FETCH_BOARDS, source, vehicleType),

  fetchFirmwareVersions: (
    source: FirmwareSource,
    vehicleType: FirmwareVehicleType,
    boardId: string
  ): Promise<{ success: boolean; groups?: Array<{ major: string; label: string; versions: FirmwareVersion[]; isLatest: boolean }>; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_FETCH_VERSIONS, source, vehicleType, boardId),

  downloadFirmware: (version: FirmwareVersion): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_DOWNLOAD, version),

  flashFirmware: (firmwarePath: string, board: DetectedBoard, options?: FlashOptions): Promise<{ success: boolean; result?: FlashResult; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_FLASH, firmwarePath, board, options),

  abortFlash: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_ABORT),

  selectFirmwareFile: (): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_SELECT_FILE),

  enterBootloader: (): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_ENTER_BOOTLOADER),

  listSerialPorts: (): Promise<{
    success: boolean;
    ports?: Array<{ path: string; manufacturer?: string; vendorId?: string; productId?: string }>;
    error?: string;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_LIST_PORTS),

  probeSTM32: (port: string): Promise<{
    success: boolean;
    chipId?: number;
    mcu?: string;
    family?: string;
    error?: string;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_PROBE_STM32, port),

  queryMavlinkBoard: (port: string, baudRate?: number): Promise<{
    success: boolean;
    boardName?: string;
    boardId?: number;
    vehicleType?: string;
    firmwareVersion?: string;
    error?: string;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_QUERY_MAVLINK, port, baudRate),

  queryMspBoard: (port: string, baudRate?: number): Promise<{
    success: boolean;
    firmware?: string;
    firmwareVersion?: string;
    boardId?: string;
    boardName?: string;
    error?: string;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_QUERY_MSP, port, baudRate),

  autoDetectBoard: (port: string): Promise<{
    success: boolean;
    protocol?: 'mavlink' | 'msp' | 'dfu' | 'usb';
    boardName?: string;
    boardId?: string;
    firmware?: string;
    firmwareVersion?: string;
    mcuType?: string;
    error?: string;
  }> =>
    ipcRenderer.invoke(IPC_CHANNELS.FIRMWARE_AUTO_DETECT, port),

  // Firmware event listeners
  onFlashProgress: (callback: (progress: FlashProgress) => void) => {
    const handler = (_: unknown, progress: FlashProgress) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.FIRMWARE_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FIRMWARE_PROGRESS, handler);
  },

  onFlashComplete: (callback: (result: FlashResult) => void) => {
    const handler = (_: unknown, result: FlashResult) => callback(result);
    ipcRenderer.on(IPC_CHANNELS.FIRMWARE_COMPLETE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FIRMWARE_COMPLETE, handler);
  },

  onFlashError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.FIRMWARE_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.FIRMWARE_ERROR, handler);
  },

  // ============================================================================
  // MSP (Betaflight/iNav/Cleanflight)
  // ============================================================================

  // MSP Connection
  mspConnect: (options: MSPConnectOptions): Promise<MSPConnectionState> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_CONNECT, options),

  mspDisconnect: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_DISCONNECT),

  // MSP Telemetry
  mspStartTelemetry: (rateHz?: number): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_START_TELEMETRY, rateHz),

  mspStopTelemetry: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_STOP_TELEMETRY),

  // GPS MSP sender (for SITL with gps_provider=MSP)
  mspStartGpsSender: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_START_GPS_SENDER),

  mspStopGpsSender: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_STOP_GPS_SENDER),

  // MSP Config
  mspGetPid: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_PID),

  mspSetPid: (pid: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_PID, pid),

  mspGetRcTuning: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_RC_TUNING),

  mspSetRcTuning: (rcTuning: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_RC_TUNING, rcTuning),

  mspGetModeRanges: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_MODE_RANGES),

  mspSetModeRange: (index: number, mode: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_MODE_RANGE, index, mode),

  mspGetFeatures: (): Promise<number | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_FEATURES),

  mspGetMixerConfig: (): Promise<{ mixer: number; isMultirotor: boolean } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_MIXER_CONFIG),

  mspSetMixerConfig: (mixerType: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_MIXER_CONFIG, mixerType),

  // iNav-specific mixer config (proper MSP2 commands for platform type)
  mspGetInavMixerConfig: (): Promise<{
    yawMotorDirection: number;
    yawJumpPreventionLimit: number;
    motorStopOnLow: number;
    platformType: number;  // 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
    hasFlaps: number;
    appliedMixerPreset: number;
    numberOfMotors: number;
    numberOfServos: number;
  } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG),

  mspSetInavPlatformType: (platformType: number, mixerType?: number): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE, platformType, mixerType),

  mspGetRc: (): Promise<{ channels: number[] } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_RC),

  // MSP RC Control (GCS arm/disarm, mode switching)
  mspSetRawRc: (channels: number[]): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_RAW_RC, channels),

  mspGetActiveBoxes: (): Promise<{ boxModes: number } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_ACTIVE_BOXES),

  // MSP Servo Config (iNav)
  mspGetServoConfigs: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS),

  mspSetServoConfig: (index: number, config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_SERVO_CONFIG, index, config),

  mspSaveServoCli: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SAVE_SERVO_CLI),

  mspGetServoValues: (): Promise<number[] | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SERVO_VALUES),

  mspGetServoMixer: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SERVO_MIXER),

  mspSetServoMixer: (index: number, rule: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_SERVO_MIXER, index, rule),

  mspGetServoConfigMode: (): Promise<{ usesCli: boolean; minValue: number; maxValue: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE),

  // MSP Motor Mixer (modern boards)
  mspGetMotorMixer: (): Promise<Array<{ throttle: number; roll: number; pitch: number; yaw: number }> | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_MOTOR_MIXER),

  mspSetMotorMixer: (rules: Array<{ throttle: number; roll: number; pitch: number; yaw: number }>): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_MOTOR_MIXER, rules),

  mspSetMotorMixerCli: (rules: Array<{
    motorIndex: number;
    throttle: number;
    roll: number;
    pitch: number;
    yaw: number;
  }>): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_MOTOR_MIXER_CLI, rules),

  mspSetServoMixerCli: (rules: Array<{
    servoIndex: number;
    inputSource: number;
    rate: number;
  }>): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_SERVO_MIXER_CLI, rules),

  mspReadSmixCli: (): Promise<Array<{ index: number; target: number; input: number; rate: number }> | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_READ_SMIX_CLI),

  mspReadMmixCli: (): Promise<Array<{ index: number; throttle: number; roll: number; pitch: number; yaw: number }> | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_READ_MMIX_CLI),

  // MSP Waypoint/Mission (iNav)
  mspGetWaypoints: (): Promise<Array<{
    wpNo: number;
    action: number;
    lat: number;
    lon: number;
    altitude: number;
    p1: number;
    p2: number;
    p3: number;
    flag: number;
  }> | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_WAYPOINTS),

  mspSetWaypoint: (wp: {
    wpNo: number;
    action: number;
    lat: number;
    lon: number;
    altitude: number;
    p1: number;
    p2: number;
    p3: number;
    flag: number;
  }): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_WAYPOINT, wp),

  mspSaveWaypoints: (waypoints: Array<{
    wpNo: number;
    action: number;
    lat: number;
    lon: number;
    altitude: number;
    p1: number;
    p2: number;
    p3: number;
    flag: number;
  }>): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SAVE_WAYPOINTS, waypoints),

  mspClearWaypoints: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_CLEAR_WAYPOINTS),

  mspGetMissionInfo: (): Promise<{
    reserved: number;
    navVersion: number;
    waypointCount: number;
    isValid: boolean;
    waypointListMaximum: number;
  } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_MISSION_INFO),

  // MSP Navigation Config (iNav)
  mspGetNavConfig: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_NAV_CONFIG),

  mspSetNavConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_NAV_CONFIG, config),

  mspGetGpsConfig: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_GPS_CONFIG),

  mspSetGpsConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_GPS_CONFIG, config),

  // MSP Failsafe Configuration
  mspGetFailsafeConfig: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_FAILSAFE_CONFIG),

  mspSetFailsafeConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_FAILSAFE_CONFIG, config),

  // MSP GPS Rescue Configuration (Betaflight)
  mspGetGpsRescue: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_GPS_RESCUE),

  mspSetGpsRescue: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_GPS_RESCUE, config),

  mspGetGpsRescuePids: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_GPS_RESCUE_PIDS),

  mspSetGpsRescuePids: (pids: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_GPS_RESCUE_PIDS, pids),

  // MSP Filter Configuration (Betaflight)
  mspGetFilterConfig: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_FILTER_CONFIG),

  mspSetFilterConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_FILTER_CONFIG, config),

  // MSP VTX Configuration
  mspGetVtxConfig: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_VTX_CONFIG),

  mspSetVtxConfig: (config: unknown): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_VTX_CONFIG, config),

  // MSP Generic Settings API (read/write any CLI setting via MSP)
  mspGetSetting: (name: string): Promise<{ value: string | number; info: unknown } | null> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SETTING, name),

  mspSetSetting: (name: string, value: string | number): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_SETTING, name, value),

  mspGetSettings: (names: string[]): Promise<Record<string, string | number | null>> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_GET_SETTINGS, names),

  mspSetSettings: (settings: Record<string, string | number>): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SET_SETTINGS, settings),

  // MSP Commands
  mspSaveEeprom: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_SAVE_EEPROM),

  mspCalibrateAcc: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_CALIBRATE_ACC),

  mspCalibrateMag: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_CALIBRATE_MAG),

  mspReboot: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.MSP_REBOOT),

  // MSP Event Listeners
  onMspConnectionState: (callback: (state: MSPConnectionState) => void) => {
    const handler = (_: unknown, state: MSPConnectionState) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.MSP_CONNECTION_STATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MSP_CONNECTION_STATE, handler);
  },

  onMspTelemetryUpdate: (callback: (data: MSPTelemetryData) => void) => {
    const handler = (_: unknown, data: MSPTelemetryData) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.MSP_TELEMETRY_UPDATE, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.MSP_TELEMETRY_UPDATE, handler);
  },

  // ============================================================================
  // CLI Terminal (iNav/Betaflight raw CLI access)
  // ============================================================================

  cliEnterMode: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_ENTER_MODE),

  cliExitMode: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_EXIT_MODE),

  cliResetAllFlags: (): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_RESET_ALL_FLAGS),

  cliSendCommand: (command: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_SEND_COMMAND, command),

  cliSendRaw: (data: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_SEND_RAW, data),

  cliGetDump: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_GET_DUMP),

  cliSaveOutput: (content: string): Promise<boolean> =>
    ipcRenderer.invoke(IPC_CHANNELS.CLI_SAVE_OUTPUT, content),

  cliSaveOutputJson: (data: {
    rawDump: string;
    fcVariant: string;
    fcVersion: string;
  }): Promise<boolean> => ipcRenderer.invoke(IPC_CHANNELS.CLI_SAVE_OUTPUT_JSON, data),

  onCliData: (callback: (data: string) => void) => {
    const handler = (_: unknown, data: string) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.CLI_DATA_RECEIVED, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.CLI_DATA_RECEIVED, handler);
  },

  // Driver utilities
  openBundledDriver: (driverName: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.DRIVER_OPEN_BUNDLED, driverName),

  // ============================================================================
  // SITL (Software-In-The-Loop Simulation)
  // ============================================================================

  sitlStart: (config: SitlConfig): Promise<{ success: boolean; command?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITL_START, config),

  sitlStop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITL_STOP),

  sitlGetStatus: (): Promise<SitlStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITL_STATUS),

  sitlDeleteEeprom: (filename: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SITL_DELETE_EEPROM, filename),

  onSitlStdout: (callback: (data: string) => void) => {
    const handler = (_: unknown, data: string) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SITL_STDOUT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SITL_STDOUT, handler);
  },

  onSitlStderr: (callback: (data: string) => void) => {
    const handler = (_: unknown, data: string) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SITL_STDERR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SITL_STDERR, handler);
  },

  onSitlError: (callback: (error: string) => void) => {
    const handler = (_: unknown, error: string) => callback(error);
    ipcRenderer.on(IPC_CHANNELS.SITL_ERROR, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SITL_ERROR, handler);
  },

  onSitlExit: (callback: (data: SitlExitData) => void) => {
    const handler = (_: unknown, data: SitlExitData) => callback(data);
    ipcRenderer.on(IPC_CHANNELS.SITL_EXIT, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SITL_EXIT, handler);
  },

  // ============================================================================
  // Visual Simulators (FlightGear, X-Plane integration)
  // ============================================================================

  simulatorDetect: (customFlightGearPath?: string, customXPlanePath?: string): Promise<Array<{
    name: 'flightgear' | 'xplane';
    installed: boolean;
    path: string | null;
    version: string | null;
  }>> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_DETECT, customFlightGearPath, customXPlanePath),

  simulatorBrowseFlightGear: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_BROWSE_FG),

  simulatorLaunchFlightGear: (config: {
    aircraft?: string;
    airport?: string;
    runwayId?: string;
    timeOfDay?: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';
    weather?: 'clear' | 'cloudy' | 'rain';
  }, customFlightGearPath?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_LAUNCH_FG, config, customFlightGearPath),

  simulatorStopFlightGear: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_STOP_FG),

  simulatorFlightGearStatus: (): Promise<{ running: boolean; pid?: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_FG_STATUS),

  // X-Plane
  simulatorBrowseXPlane: (): Promise<{ success: boolean; path?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_BROWSE_XP),

  simulatorLaunchXPlane: (config: {
    sitlHost?: string;
    dataOutPort?: number;
    dataInPort?: number;
    fullscreen?: boolean;
  }, customXPlanePath?: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_LAUNCH_XP, config, customXPlanePath),

  simulatorStopXPlane: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_STOP_XP),

  simulatorXPlaneStatus: (): Promise<{ running: boolean; pid?: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.SIMULATOR_XP_STATUS),

  bridgeStart: (config?: {
    fgOutPort?: number;
    fgInPort?: number;
    sitlHost?: string;
    sitlSimPort?: number;
  }): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_START, config),

  bridgeStop: (): Promise<{ success: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_STOP),

  bridgeStatus: (): Promise<{ running: boolean }> =>
    ipcRenderer.invoke(IPC_CHANNELS.BRIDGE_STATUS),

  // =============================================================================
  // Virtual RC Control (for SITL testing)
  // =============================================================================

  /** Set virtual RC channel values for SITL testing */
  virtualRCSet: (state: Partial<VirtualRCState>): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.VIRTUAL_RC_SET, state),

  /** Get current virtual RC values */
  virtualRCGet: (): Promise<VirtualRCState> =>
    ipcRenderer.invoke(IPC_CHANNELS.VIRTUAL_RC_GET),

  /** Reset virtual RC to defaults */
  virtualRCReset: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.VIRTUAL_RC_RESET),

  // =============================================================================
  // Bug Report / Logging
  // =============================================================================

  /** Collect logs from the last N hours */
  reportCollectLogs: (hours?: number): Promise<unknown[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_COLLECT_LOGS, hours),

  /** Get system info for bug report */
  reportGetSystemInfo: (): Promise<unknown> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_GET_SYSTEM_INFO),

  /** Get encryption configuration info */
  reportGetEncryptionInfo: (): Promise<{ isPlaceholderKey: boolean; keyVersion: number; formatVersion: number }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_GET_ENCRYPTION_INFO),

  /** Collect MSP board dump (enters CLI mode, board will reboot) */
  reportCollectMspDump: (): Promise<{ success: boolean; dump?: unknown; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_COLLECT_MSP_DUMP),

  /** Collect MAVLink board dump (uses cached parameter data) */
  reportCollectMavlinkDump: (): Promise<{ success: boolean; dump?: unknown; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_COLLECT_MAVLINK_DUMP),

  /** Save encrypted bug report to file */
  reportSave: (
    userDescription: string,
    boardDump: unknown | null,
    logHours?: number
  ): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke(IPC_CHANNELS.REPORT_SAVE, userDescription, boardDump, logHours),

  /** Listen for report progress updates */
  onReportProgress: (callback: (progress: { stage: string; message: string }) => void) => {
    const handler = (_: unknown, progress: { stage: string; message: string }) => callback(progress);
    ipcRenderer.on(IPC_CHANNELS.REPORT_PROGRESS, handler);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.REPORT_PROGRESS, handler);
  },

  /** Send log entry from renderer to main process */
  logEntry: (level: 'info' | 'warn' | 'error' | 'debug', message: string, details?: string): void => {
    ipcRenderer.invoke('log:entry', level, message, details);
  },
};

// Expose to renderer
contextBridge.exposeInMainWorld('electronAPI', api);

// Type declaration for renderer
export type ElectronAPI = typeof api;
