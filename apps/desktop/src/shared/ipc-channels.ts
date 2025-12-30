/**
 * IPC Channel definitions for main<->renderer communication
 */

export const IPC_CHANNELS = {
  // Port management
  COMMS_LIST_PORTS: 'comms:list-ports',
  COMMS_SCAN_PORTS: 'comms:scan-ports',
  COMMS_CONNECT: 'comms:connect',
  COMMS_DISCONNECT: 'comms:disconnect',

  // MAVLink messages
  MAVLINK_PACKET: 'mavlink:packet',
  MAVLINK_SEND: 'mavlink:send',

  // Connection state
  CONNECTION_STATE: 'connection:state',

  // Console/debug
  CONSOLE_LOG: 'console:log',

  // Telemetry
  TELEMETRY_UPDATE: 'telemetry:update',

  // Layout management
  LAYOUT_GET_ALL: 'layout:get-all',
  LAYOUT_GET: 'layout:get',
  LAYOUT_SAVE: 'layout:save',
  LAYOUT_DELETE: 'layout:delete',
  LAYOUT_SET_ACTIVE: 'layout:set-active',
  LAYOUT_GET_ACTIVE: 'layout:get-active',

  // Parameters
  PARAM_REQUEST_ALL: 'param:request-all',
  PARAM_SET: 'param:set',
  PARAM_VALUE: 'param:value',
  PARAM_PROGRESS: 'param:progress',
  PARAM_COMPLETE: 'param:complete',
  PARAM_ERROR: 'param:error',
  PARAM_WRITE_FLASH: 'param:write-flash',
  PARAM_SAVE_FILE: 'param:save-file',
  PARAM_LOAD_FILE: 'param:load-file',

  // Parameter metadata
  PARAM_METADATA_FETCH: 'param:metadata-fetch',
  PARAM_METADATA_RESULT: 'param:metadata-result',

  // Mission planning
  MISSION_DOWNLOAD: 'mission:download',
  MISSION_UPLOAD: 'mission:upload',
  MISSION_CLEAR: 'mission:clear',
  MISSION_SET_CURRENT: 'mission:set-current',
  MISSION_ITEM: 'mission:item',
  MISSION_PROGRESS: 'mission:progress',
  MISSION_COMPLETE: 'mission:complete',
  MISSION_UPLOAD_COMPLETE: 'mission:upload-complete',
  MISSION_CLEAR_COMPLETE: 'mission:clear-complete',
  MISSION_ERROR: 'mission:error',
  MISSION_CURRENT: 'mission:current',
  MISSION_REACHED: 'mission:reached',
  MISSION_SAVE_FILE: 'mission:save-file',
  MISSION_LOAD_FILE: 'mission:load-file',

  // Geofencing (mission_type = FENCE)
  FENCE_DOWNLOAD: 'fence:download',
  FENCE_UPLOAD: 'fence:upload',
  FENCE_CLEAR: 'fence:clear',
  FENCE_ITEM: 'fence:item',
  FENCE_PROGRESS: 'fence:progress',
  FENCE_COMPLETE: 'fence:complete',
  FENCE_UPLOAD_COMPLETE: 'fence:upload-complete',
  FENCE_CLEAR_COMPLETE: 'fence:clear-complete',
  FENCE_ERROR: 'fence:error',
  FENCE_STATUS: 'fence:status',
  FENCE_SAVE_FILE: 'fence:save-file',
  FENCE_LOAD_FILE: 'fence:load-file',

  // Rally points (mission_type = RALLY)
  RALLY_DOWNLOAD: 'rally:download',
  RALLY_UPLOAD: 'rally:upload',
  RALLY_CLEAR: 'rally:clear',
  RALLY_ITEM: 'rally:item',
  RALLY_PROGRESS: 'rally:progress',
  RALLY_COMPLETE: 'rally:complete',
  RALLY_UPLOAD_COMPLETE: 'rally:upload-complete',
  RALLY_CLEAR_COMPLETE: 'rally:clear-complete',
  RALLY_ERROR: 'rally:error',
  RALLY_SAVE_FILE: 'rally:save-file',
  RALLY_LOAD_FILE: 'rally:load-file',

  // Settings/Vehicle profiles
  SETTINGS_GET: 'settings:get',
  SETTINGS_SAVE: 'settings:save',
} as const;

export type IpcChannels = typeof IPC_CHANNELS[keyof typeof IPC_CHANNELS];

/**
 * Connection options for comms:connect
 */
export interface ConnectOptions {
  type: 'serial' | 'tcp' | 'udp';
  port?: string;
  baudRate?: number;
  host?: string;
  tcpPort?: number;
  udpPort?: number;
}

/**
 * Connection state
 */
export interface ConnectionState {
  isConnected: boolean;
  isWaitingForHeartbeat?: boolean;
  transport?: string;
  systemId?: number;
  componentId?: number;
  autopilot?: string;
  vehicleType?: string;
  mavType?: number; // Raw MAV_TYPE for metadata lookup
  packetsReceived: number;
  packetsSent: number;
}

/**
 * Console log entry for debug panel
 */
export interface ConsoleLogEntry {
  id: number;
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'debug' | 'packet';
  message: string;
  details?: string;
}

/**
 * Saved dashboard layout
 */
export interface SavedLayout {
  name: string;
  createdAt: number;
  updatedAt: number;
  data: unknown; // dockview serialized state
}

/**
 * Layout store schema
 */
export interface LayoutStoreSchema {
  activeLayout: string;
  layouts: Record<string, SavedLayout>;
}

/**
 * Vehicle type for profiles
 */
export type SettingsVehicleType = 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

/**
 * Vehicle profile for performance calculations
 */
export interface SettingsVehicleProfile {
  id: string;
  name: string;
  type: SettingsVehicleType;
  weight: number;
  batteryCells: number;
  batteryCapacity: number;
  batteryDischarge?: number;
  // Copter
  frameSize?: number;
  motorCount?: number;
  motorKv?: number;
  propSize?: string;
  escRating?: number;
  // Plane
  wingspan?: number;
  wingArea?: number;
  stallSpeed?: number;
  // VTOL
  vtolMotorCount?: number;
  transitionSpeed?: number;
  // Rover
  wheelbase?: number;
  wheelDiameter?: number;
  driveType?: 'differential' | 'ackermann' | 'skid';
  maxSpeed?: number;
  // Boat
  hullLength?: number;
  hullType?: 'displacement' | 'planing' | 'catamaran' | 'pontoon';
  propellerType?: 'prop' | 'jet' | 'paddle';
  displacement?: number;
  // Sub
  maxDepth?: number;
  thrusterCount?: number;
  buoyancy?: 'positive' | 'neutral' | 'negative';
  // Notes
  notes?: string;
}

/**
 * Mission planning defaults
 */
export interface SettingsMissionDefaults {
  safeAltitudeBuffer: number;
  defaultWaypointAltitude: number;
  defaultTakeoffAltitude: number;
}

/**
 * Flight statistics
 */
export interface SettingsFlightStats {
  totalFlightTimeSeconds: number;
  totalDistanceMeters: number;
  totalMissions: number;
  lastFlightDate: string | null;
  lastConnectionDate: string | null;
}

/**
 * Settings store schema (persisted to disk)
 */
export interface SettingsStoreSchema {
  missionDefaults: SettingsMissionDefaults;
  vehicles: SettingsVehicleProfile[];
  activeVehicleId: string | null;
  flightStats: SettingsFlightStats;
}
