/**
 * IPC Channel definitions for main<->renderer communication
 */

export const IPC_CHANNELS = {
  // Port management
  COMMS_LIST_PORTS: 'comms:list-ports',
  COMMS_SCAN_PORTS: 'comms:scan-ports',
  COMMS_CONNECT: 'comms:connect',
  COMMS_DISCONNECT: 'comms:disconnect',
  COMMS_NEW_PORT: 'comms:new-port',
  COMMS_START_PORT_WATCH: 'comms:start-port-watch',
  COMMS_STOP_PORT_WATCH: 'comms:stop-port-watch',

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

  // Firmware flash
  FIRMWARE_DETECT_BOARD: 'firmware:detect-board',
  FIRMWARE_FETCH_MANIFEST: 'firmware:fetch-manifest',
  FIRMWARE_FETCH_BOARDS: 'firmware:fetch-boards',
  FIRMWARE_FETCH_VERSIONS: 'firmware:fetch-versions',
  FIRMWARE_DOWNLOAD: 'firmware:download',
  FIRMWARE_FLASH: 'firmware:flash',
  FIRMWARE_ABORT: 'firmware:abort',
  FIRMWARE_PROGRESS: 'firmware:progress',
  FIRMWARE_COMPLETE: 'firmware:complete',
  FIRMWARE_ERROR: 'firmware:error',
  FIRMWARE_SELECT_FILE: 'firmware:select-file',
  FIRMWARE_ENTER_BOOTLOADER: 'firmware:enter-bootloader',
  FIRMWARE_LIST_PORTS: 'firmware:list-ports',
  FIRMWARE_PROBE_STM32: 'firmware:probe-stm32',
  FIRMWARE_QUERY_MAVLINK: 'firmware:query-mavlink',
  FIRMWARE_QUERY_MSP: 'firmware:query-msp',
  FIRMWARE_AUTO_DETECT: 'firmware:auto-detect',

  // MSP Connection (Betaflight/iNav/Cleanflight)
  MSP_CONNECT: 'msp:connect',
  MSP_DISCONNECT: 'msp:disconnect',
  MSP_CONNECTION_STATE: 'msp:connection-state',

  // MSP Telemetry
  MSP_TELEMETRY_UPDATE: 'msp:telemetry-update',
  MSP_START_TELEMETRY: 'msp:start-telemetry',
  MSP_STOP_TELEMETRY: 'msp:stop-telemetry',
  MSP_START_GPS_SENDER: 'msp:start-gps-sender',
  MSP_STOP_GPS_SENDER: 'msp:stop-gps-sender',

  // MSP Configuration
  MSP_GET_STATUS: 'msp:get-status',
  MSP_GET_ATTITUDE: 'msp:get-attitude',
  MSP_GET_ANALOG: 'msp:get-analog',
  MSP_GET_RC: 'msp:get-rc',
  MSP_GET_MOTOR: 'msp:get-motor',
  MSP_GET_GPS: 'msp:get-gps',
  MSP_GET_PID: 'msp:get-pid',
  MSP_SET_PID: 'msp:set-pid',
  MSP_GET_RC_TUNING: 'msp:get-rc-tuning',
  MSP_SET_RC_TUNING: 'msp:set-rc-tuning',
  MSP_GET_MODE_RANGES: 'msp:get-mode-ranges',
  MSP_SET_MODE_RANGE: 'msp:set-mode-range',
  MSP_GET_FEATURES: 'msp:get-features',
  MSP_GET_MIXER_CONFIG: 'msp:get-mixer-config',
  MSP_SET_MIXER_CONFIG: 'msp:set-mixer-config',
  // iNav-specific mixer config (proper MSP2 commands for platform type)
  MSP_GET_INAV_MIXER_CONFIG: 'msp:get-inav-mixer-config',
  MSP_SET_INAV_PLATFORM_TYPE: 'msp:set-inav-platform-type',
  MSP_CONFIG_UPDATE: 'msp:config-update',

  // MSP Servo Configuration (iNav)
  MSP_GET_SERVO_CONFIGS: 'msp:get-servo-configs',
  MSP_SET_SERVO_CONFIG: 'msp:set-servo-config',
  MSP_SAVE_SERVO_CLI: 'msp:save-servo-cli', // CLI fallback for old iNav
  MSP_GET_SERVO_VALUES: 'msp:get-servo-values',
  MSP_GET_SERVO_MIXER: 'msp:get-servo-mixer',
  MSP_SET_SERVO_MIXER: 'msp:set-servo-mixer',
  MSP_GET_SERVO_CONFIG_MODE: 'msp:get-servo-config-mode', // Check if using CLI fallback + valid ranges
  MSP_GET_MOTOR_MIXER: 'msp:get-motor-mixer', // MSP motor mixer (modern boards)
  MSP_SET_MOTOR_MIXER: 'msp:set-motor-mixer', // MSP motor mixer (modern boards)
  MSP_SET_MOTOR_MIXER_CLI: 'msp:set-motor-mixer-cli', // CLI mmix for legacy iNav boards
  MSP_SET_SERVO_MIXER_CLI: 'msp:set-servo-mixer-cli', // CLI smix for legacy iNav boards
  MSP_READ_SMIX_CLI: 'msp:read-smix-cli', // Read smix via CLI for preset detection
  MSP_READ_MMIX_CLI: 'msp:read-mmix-cli', // Read mmix via CLI for verification

  // MSP Waypoint/Mission (iNav)
  MSP_GET_WAYPOINTS: 'msp:get-waypoints',       // Read all waypoints from FC
  MSP_SET_WAYPOINT: 'msp:set-waypoint',         // Write single waypoint to FC
  MSP_SAVE_WAYPOINTS: 'msp:save-waypoints',     // Save mission to EEPROM
  MSP_CLEAR_WAYPOINTS: 'msp:clear-waypoints',   // Clear all waypoints
  MSP_GET_MISSION_INFO: 'msp:get-mission-info', // Get mission info (count, validity)

  // MSP Navigation Settings (iNav)
  MSP_GET_NAV_CONFIG: 'msp:get-nav-config',
  MSP_SET_NAV_CONFIG: 'msp:set-nav-config',
  MSP_GET_GPS_CONFIG: 'msp:get-gps-config',
  MSP_SET_GPS_CONFIG: 'msp:set-gps-config',

  // MSP Failsafe Configuration
  MSP_GET_FAILSAFE_CONFIG: 'msp:get-failsafe-config',
  MSP_SET_FAILSAFE_CONFIG: 'msp:set-failsafe-config',

  // MSP Generic Settings API (read/write any CLI setting via MSP)
  MSP_GET_SETTING: 'msp:get-setting',
  MSP_SET_SETTING: 'msp:set-setting',
  MSP_GET_SETTINGS: 'msp:get-settings',
  MSP_SET_SETTINGS: 'msp:set-settings',

  // MSP Commands
  MSP_SAVE_EEPROM: 'msp:save-eeprom',
  MSP_CALIBRATE_ACC: 'msp:calibrate-acc',
  MSP_CALIBRATE_MAG: 'msp:calibrate-mag',
  MSP_REBOOT: 'msp:reboot',

  // MSP RC Control (GCS arm/disarm, mode switching)
  MSP_SET_RAW_RC: 'msp:set-raw-rc',       // Send RC channel values to FC
  MSP_GET_ACTIVE_BOXES: 'msp:get-active-boxes', // Get active mode boxes (bitmask)

  // Reconnection control (for expected reboots)
  RECONNECT_CANCEL: 'reconnect:cancel',

  // MSP Progress/Status
  MSP_PROGRESS: 'msp:progress',
  MSP_ERROR: 'msp:error',

  // CLI Terminal (iNav/Betaflight raw CLI access)
  CLI_ENTER_MODE: 'cli:enter-mode',
  CLI_EXIT_MODE: 'cli:exit-mode',
  CLI_SEND_COMMAND: 'cli:send-command',
  CLI_SEND_RAW: 'cli:send-raw',
  CLI_DATA_RECEIVED: 'cli:data-received',
  CLI_GET_DUMP: 'cli:get-dump',
  CLI_SAVE_OUTPUT: 'cli:save-output',
  CLI_SAVE_OUTPUT_JSON: 'cli:save-output-json',
  CLI_RESET_ALL_FLAGS: 'cli:reset-all-flags', // Reset ALL CLI mode flags (both cli-handlers and msp-handlers)

  // Driver utilities
  DRIVER_OPEN_BUNDLED: 'driver:open-bundled',

  // SITL Simulator
  SITL_START: 'sitl:start',
  SITL_STOP: 'sitl:stop',
  SITL_STATUS: 'sitl:status',
  SITL_DELETE_EEPROM: 'sitl:delete-eeprom',
  SITL_STDOUT: 'sitl:stdout',
  SITL_STDERR: 'sitl:stderr',
  SITL_ERROR: 'sitl:error',
  SITL_EXIT: 'sitl:exit',

  // Visual Simulators (FlightGear, X-Plane)
  SIMULATOR_DETECT: 'simulator:detect',
  SIMULATOR_BROWSE_FG: 'simulator:browse-fg',
  SIMULATOR_BROWSE_XP: 'simulator:browse-xp',
  SIMULATOR_LAUNCH_FG: 'simulator:launch-fg',
  SIMULATOR_STOP_FG: 'simulator:stop-fg',
  SIMULATOR_FG_STATUS: 'simulator:fg-status',
  SIMULATOR_LAUNCH_XP: 'simulator:launch-xp',
  SIMULATOR_STOP_XP: 'simulator:stop-xp',
  SIMULATOR_XP_STATUS: 'simulator:xp-status',
  BRIDGE_START: 'bridge:start',
  BRIDGE_STOP: 'bridge:stop',
  BRIDGE_STATUS: 'bridge:status',

  // Virtual RC Control (for SITL testing)
  VIRTUAL_RC_SET: 'virtual-rc:set',
  VIRTUAL_RC_GET: 'virtual-rc:get',
  VIRTUAL_RC_RESET: 'virtual-rc:reset',

  // Bug Report / Logging
  REPORT_COLLECT_LOGS: 'report:collect-logs',
  REPORT_COLLECT_MSP_DUMP: 'report:collect-msp-dump',
  REPORT_COLLECT_MAVLINK_DUMP: 'report:collect-mavlink-dump',
  REPORT_GET_SYSTEM_INFO: 'report:get-system-info',
  REPORT_CREATE: 'report:create',
  REPORT_SAVE: 'report:save',
  REPORT_PROGRESS: 'report:progress',
  REPORT_GET_ENCRYPTION_INFO: 'report:get-encryption-info',
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
  /** Force a specific protocol, skipping auto-detection */
  protocol?: 'mavlink' | 'msp';
}

/**
 * Connection state
 */
export interface ConnectionState {
  isConnected: boolean;
  isWaitingForHeartbeat?: boolean;
  protocol?: 'mavlink' | 'msp'; // Auto-detected protocol
  transport?: string;
  portPath?: string; // Serial port path for reconnection
  // MAVLink-specific
  systemId?: number;
  componentId?: number;
  autopilot?: string;
  vehicleType?: string;
  mavType?: number; // Raw MAV_TYPE for metadata lookup
  // MSP-specific (Betaflight/iNav)
  fcVariant?: string; // "BTFL", "INAV", "CLFL"
  fcVersion?: string; // "4.5.1"
  boardId?: string; // "SPRACINGH7"
  apiVersion?: string;
  /**
   * Legacy board detection - TRUE for boards that only support CLI config:
   * - iNav < 2.1.0 (F3 boards like SPRacing F3)
   * - Betaflight < 4.0 (F3 boards)
   * When true, use LegacyConfigView instead of MspConfigView
   */
  isLegacyBoard?: boolean;
  /**
   * SITL connection - TRUE when connected to SITL simulator.
   * Used to disable firmware flashing UI.
   */
  isSitl?: boolean;
  /**
   * Auto-reconnect state - TRUE when reconnecting after expected reboot.
   * During reconnection, stores are NOT reset and UI stays on current screen.
   */
  isReconnecting?: boolean;
  reconnectReason?: string; // "Saving configuration", "Rebooting board"
  reconnectAttempt?: number; // Current attempt (1-based)
  reconnectMaxAttempts?: number; // Max attempts before giving up
  // Stats
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
 * Connection memory - remembers last used connection settings
 */
export interface SettingsConnectionMemory {
  lastSerialPort?: string;
  lastBaudRate?: number;
  lastTcpHost?: string;
  lastTcpPort?: number;
  lastUdpPort?: number;
  lastConnectionType?: 'serial' | 'tcp' | 'udp';
}

/**
 * Settings store schema (persisted to disk)
 */
export interface SettingsStoreSchema {
  missionDefaults: SettingsMissionDefaults;
  vehicles: SettingsVehicleProfile[];
  activeVehicleId: string | null;
  flightStats: SettingsFlightStats;
  connectionMemory?: SettingsConnectionMemory;
}

// =============================================================================
// MSP Types (Betaflight/iNav/Cleanflight)
// =============================================================================

/**
 * MSP connection options
 */
export interface MSPConnectOptions {
  port: string;
  baudRate?: number; // Default: 115200
}

/**
 * MSP connection state
 */
export interface MSPConnectionState {
  isConnected: boolean;
  port: string;
  baudRate: number;
  fcVariant: string; // "BTFL", "INAV", "CLFL"
  fcVersion: string; // "4.5.1"
  boardId: string; // "SPRACINGH7"
  apiVersion: string;
  lastError?: string;
}

/**
 * MSP telemetry data (combined from multiple MSP messages)
 */
export interface MSPTelemetryData {
  // Attitude (from MSP_ATTITUDE)
  attitude?: {
    roll: number; // degrees
    pitch: number; // degrees
    yaw: number; // degrees (heading)
  };

  // Altitude (from MSP_ALTITUDE)
  altitude?: {
    altitude: number; // meters
    vario: number; // m/s
  };

  // Analog/Battery (from MSP_ANALOG)
  analog?: {
    voltage: number; // volts
    mAhDrawn: number;
    rssi: number; // 0-100%
    current: number; // amps
  };

  // Status (from MSP_STATUS)
  status?: {
    cycleTime: number; // microseconds
    cpuLoad: number; // 0-100%
    armingFlags: number;
    flightModeFlags: number;
    isArmed: boolean;
  };

  // RC Channels (from MSP_RC)
  rc?: {
    channels: number[]; // 16 channels, 1000-2000
  };

  // Motors (from MSP_MOTOR)
  motors?: {
    values: number[]; // 4-8 motors
  };

  // GPS (from MSP_RAW_GPS)
  gps?: {
    fixType: number;
    satellites: number;
    lat: number; // decimal degrees
    lon: number; // decimal degrees
    alt: number; // meters
    speed: number; // m/s
    heading: number; // degrees
  };

  // Timestamps
  timestamp: number;
}

/**
 * MSP PID configuration
 */
export interface MSPPidConfig {
  roll: { p: number; i: number; d: number };
  pitch: { p: number; i: number; d: number };
  yaw: { p: number; i: number; d: number };
}

/**
 * MSP rates configuration
 */
export interface MSPRatesConfig {
  rcRate: number[];
  superRate: number[];
  rcExpo: number[];
  ratesType: number; // 0=Betaflight, 3=Actual, 4=Quick
}

/**
 * MSP mode range
 */
export interface MSPModeRange {
  boxId: number;
  auxChannel: number;
  rangeStart: number;
  rangeEnd: number;
}

// =============================================================================
// SITL Types (Software-In-The-Loop Simulation)
// =============================================================================

/**
 * SITL configuration for starting the simulator
 */
export interface SitlConfig {
  /** EEPROM filename for persistent config storage */
  eepromFileName: string;
  /** Simulator type: 'xp' (X-Plane) or 'rf' (RealFlight) - Phase 2 */
  simulator?: 'xp' | 'rf';
  /** Use IMU data from simulator - Phase 2 */
  useImu?: boolean;
  /** Simulator IP address - Phase 2 */
  simIp?: string;
  /** Simulator port - Phase 2 */
  simPort?: number;
  /** Channel mapping string (e.g., "M01-01,S01-02") - Phase 2 */
  channelMap?: string;
  /** Serial port for RX passthrough - Phase 2 */
  serialPort?: string;
  /** Serial baud rate - Phase 2 */
  baudRate?: number;
  /** Serial stop bits - Phase 2 */
  stopBits?: 'One' | 'Two';
  /** Serial parity - Phase 2 */
  parity?: 'None' | 'Even' | 'Odd';
  /** Serial UART number for RX - Phase 2 */
  serialUart?: number;
}

/**
 * SITL profile for saved configurations.
 *
 * A profile represents a complete SITL configuration including:
 * - EEPROM file: Stores FC config (PIDs, rates, modes, etc.) - persists across restarts
 * - Simulator settings (Phase 2): X-Plane/RealFlight integration
 *
 * Each profile gets its own EEPROM file, so you can have different configurations
 * for testing (e.g., one for airplane testing, one for quad testing).
 */
export interface SitlProfile {
  /** Profile name */
  name: string;
  /** Description explaining what this profile is for */
  description?: string;
  /** EEPROM filename (auto-generated from name) */
  eepromFileName: string;
  /** Is this a standard (non-deletable) profile */
  isStandard?: boolean;
  /** Simulator type - Phase 2 */
  simulator?: 'xp' | 'rf';
  /** Enable simulator integration - Phase 2 */
  simEnabled?: boolean;
  /** Simulator IP - Phase 2 */
  simIp?: string;
  /** Simulator port - Phase 2 */
  simPort?: number;
  /** Use IMU from simulator - Phase 2 */
  useImu?: boolean;
  /** Channel mapping - Phase 2 */
  channelMap?: number[];
}

/**
 * SITL process status
 */
export interface SitlStatus {
  isRunning: boolean;
  pid?: number;
  /** Command line used to start (for debugging) */
  command?: string;
}

/**
 * SITL exit event data
 */
export interface SitlExitData {
  code: number | null;
  signal: string | null;
}

/**
 * Virtual RC channel values for SITL testing.
 * Values are -1.0 to +1.0 (maps to 1000-2000 PWM)
 * -1 = 1000 PWM, 0 = 1500 PWM, +1 = 2000 PWM
 */
export interface VirtualRCState {
  roll: number;      // -1 to +1
  pitch: number;     // -1 to +1
  yaw: number;       // -1 to +1
  throttle: number;  // -1 to +1 (but typically 0-1 for safety)
  aux1: number;      // -1 to +1
  aux2: number;      // -1 to +1
  aux3: number;      // -1 to +1
  aux4: number;      // -1 to +1 (ARM switch is typically here)
}
