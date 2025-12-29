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

  // Parameter metadata
  PARAM_METADATA_FETCH: 'param:metadata-fetch',
  PARAM_METADATA_RESULT: 'param:metadata-result',
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
