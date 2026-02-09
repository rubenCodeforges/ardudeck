/**
 * MSP Protocol Types
 * Core type definitions for MSP packets and messages
 */

// =============================================================================
// Packet Types
// =============================================================================

/** MSP protocol version */
export type MSPVersion = 1 | 2;

/** Packet direction */
export type MSPDirection = 'request' | 'response' | 'error';

/**
 * Parsed MSP packet
 */
export interface MSPPacket {
  /** Protocol version (1 or 2) */
  readonly version: MSPVersion;
  /** Packet direction */
  readonly direction: MSPDirection;
  /** MSP v2 flag byte (0 for v1) */
  readonly flag: number;
  /** Command ID */
  readonly command: number;
  /** Payload data */
  readonly payload: Uint8Array;
  /** Checksum value */
  readonly checksum: number;
  /** Receive timestamp */
  readonly timestamp: number;
}

/**
 * MSP message metadata for registry
 */
export interface MSPMessageInfo {
  /** Command ID */
  command: number;
  /** Human-readable name */
  name: string;
  /** Minimum expected payload length */
  minLength: number;
  /** Maximum expected payload length (-1 for variable) */
  maxLength: number;
  /** Deserialize payload to typed object */
  deserialize?: (payload: Uint8Array) => unknown;
  /** Serialize typed object to payload */
  serialize?: (data: unknown) => Uint8Array;
}

// =============================================================================
// Parser Statistics
// =============================================================================

/**
 * Parser statistics for debugging
 */
export interface MSPParserStats {
  /** Total packets received */
  packetsReceived: number;
  /** MSP v1 packets received */
  packetsV1: number;
  /** MSP v2 packets received */
  packetsV2: number;
  /** Packets with bad checksum */
  badChecksum: number;
  /** Packets with bad length */
  badLength: number;
  /** Error responses received */
  errors: number;
  /** Total bytes received */
  bytesReceived: number;
}

// =============================================================================
// Info Messages
// =============================================================================

/**
 * MSP_API_VERSION response
 */
export interface MSPApiVersion {
  protocol: number;
  apiMajor: number;
  apiMinor: number;
}

/**
 * MSP_FC_VARIANT response
 */
export interface MSPFcVariant {
  /** 4-character FC variant code (e.g., "BTFL", "INAV") */
  variant: string;
}

/**
 * MSP_FC_VERSION response
 */
export interface MSPFcVersion {
  major: number;
  minor: number;
  patch: number;
  /** Formatted version string (e.g., "4.5.1") */
  version: string;
}

/**
 * MSP_BOARD_INFO response
 */
export interface MSPBoardInfo {
  /** 4-character board identifier */
  boardId: string;
  /** Hardware revision */
  hardwareRevision: number;
  /** Board type (0 = FC, 1 = External Sensor, etc.) */
  boardType: number;
  /** Target capabilities flags */
  targetCapabilities: number;
  /** Target name (build target) */
  targetName: string;
  /** Board name (human-readable) */
  boardName: string;
  /** Manufacturer ID */
  manufacturerId: string;
  /** Signature */
  signature: Uint8Array;
  /** MCU type ID */
  mcuTypeId: number;
  /** Configuration state */
  configurationState: number;
  /** Sample rate in Hz */
  sampleRateHz: number;
  /** Configuration problem flags */
  configurationProblems: number;
}

/**
 * MSP_BUILD_INFO response
 */
export interface MSPBuildInfo {
  /** Build date string */
  buildDate: string;
  /** Build time string */
  buildTime: string;
  /** Git revision short hash */
  gitRevision: string;
}

/**
 * MSP_NAME response
 */
export interface MSPName {
  /** Craft name */
  name: string;
}

// =============================================================================
// Telemetry Messages
// =============================================================================

/**
 * MSP_STATUS response
 */
export interface MSPStatus {
  /** Cycle time in microseconds */
  cycleTime: number;
  /** I2C error count */
  i2cError: number;
  /** Active sensors bitmask */
  activeSensors: number;
  /** Flight mode flags */
  flightModeFlags: number;
  /** Current PID profile index */
  currentPidProfile: number;
  /** Average system load (0-100%) */
  averageSystemLoad: number;
  /** Arming disable flags count */
  armingDisableFlagsCount: number;
  /** Arming disable flags bitmask */
  armingDisableFlags: number;
  /** Config state flags */
  configStateFlags: number;
  /** CPU temperature in 0.01C units */
  cpuTemp: number;
}

/**
 * MSP_RAW_IMU response
 */
export interface MSPRawImu {
  /** Accelerometer X (raw) */
  accX: number;
  /** Accelerometer Y (raw) */
  accY: number;
  /** Accelerometer Z (raw) */
  accZ: number;
  /** Gyroscope X (raw) */
  gyroX: number;
  /** Gyroscope Y (raw) */
  gyroY: number;
  /** Gyroscope Z (raw) */
  gyroZ: number;
  /** Magnetometer X (raw) */
  magX: number;
  /** Magnetometer Y (raw) */
  magY: number;
  /** Magnetometer Z (raw) */
  magZ: number;
}

/**
 * MSP_ATTITUDE response
 */
export interface MSPAttitude {
  /** Roll angle in 0.1 degrees */
  roll: number;
  /** Pitch angle in 0.1 degrees */
  pitch: number;
  /** Yaw/heading in degrees (0-359) */
  yaw: number;
}

/**
 * MSP_ALTITUDE response
 */
export interface MSPAltitude {
  /** Estimated altitude in cm */
  altitude: number;
  /** Vertical velocity (vario) in cm/s */
  vario: number;
  /** Barometer altitude in cm */
  baroAltitude: number;
}

/**
 * MSP_ANALOG response
 */
export interface MSPAnalog {
  /** Battery voltage in 0.1V (legacy) or 0.01V */
  voltage: number;
  /** mAh drawn */
  mAhDrawn: number;
  /** RSSI (0-1023) */
  rssi: number;
  /** Current draw in 0.01A */
  current: number;
}

/**
 * MSP_RC response (RC channel values)
 */
export interface MSPRc {
  /** RC channel values (typically 16 channels) */
  channels: number[];
}

/**
 * MSP_RX_MAP response (RC channel mapping)
 * Maps stick functions to channel positions.
 * Standard order: AETR (Aileron=0, Elevator=1, Throttle=2, Rudder=3)
 */
export interface MSPRxMap {
  /**
   * Channel map: index = function (A/E/R/T/AUX...), value = channel position
   * - rxMap[0] = Aileron (Roll) channel position
   * - rxMap[1] = Elevator (Pitch) channel position
   * - rxMap[2] = Rudder (Yaw) channel position
   * - rxMap[3] = Throttle channel position
   * - rxMap[4-7] = AUX channels
   */
  rxMap: number[];
}

/**
 * MSP_MOTOR response
 */
export interface MSPMotor {
  /** Motor output values (typically 4-8 motors) */
  motors: number[];
}

/**
 * MSP_SERVO response
 */
export interface MSPServo {
  /** Servo output values */
  servos: number[];
}

/**
 * MSP_RAW_GPS response
 */
export interface MSPRawGps {
  /** Fix type (0=none, 1=dead reckoning, 2=2D, 3=3D) */
  fixType: number;
  /** Number of satellites */
  numSat: number;
  /** Latitude in 1/10000000 degrees */
  lat: number;
  /** Longitude in 1/10000000 degrees */
  lon: number;
  /** Altitude in meters */
  alt: number;
  /** Ground speed in cm/s */
  groundSpeed: number;
  /** Ground course in 0.1 degrees */
  groundCourse: number;
  /** Horizontal dilution of precision */
  hdop: number;
}

/**
 * MSP_COMP_GPS response (computed GPS values)
 */
export interface MSPCompGps {
  /** Distance to home in meters */
  distanceToHome: number;
  /** Direction to home in degrees */
  directionToHome: number;
  /** GPS heartbeat */
  gpsHeartbeat: number;
}

// =============================================================================
// Configuration Messages
// =============================================================================

// Note: MSPPid, MSPRcTuning, MSPModeRange, MSPFeatureConfig are defined in
// messages/config.ts along with their serializers/deserializers

/**
 * MSP_MOTOR_CONFIG response
 */
export interface MSPMotorConfig {
  /** Minimum throttle (1000-2000) */
  minThrottle: number;
  /** Maximum throttle (1000-2000) */
  maxThrottle: number;
  /** Minimum command (disarm) */
  minCommand: number;
  /** Motor count */
  motorCount: number;
  /** Motor pole count */
  motorPoles: number;
  /** Use DShot telemetry */
  useDshotTelemetry: boolean;
  /** Digital idle percent (0-100 in 0.01 units) */
  digitalIdlePercent: number;
}

/**
 * MSP_BATTERY_CONFIG response
 */
export interface MSPBatteryConfig {
  /** Cell voltage minimum (0.1V) */
  vbatMinCellVoltage: number;
  /** Cell voltage maximum (0.1V) */
  vbatMaxCellVoltage: number;
  /** Cell voltage warning (0.1V) */
  vbatWarningCellVoltage: number;
  /** Capacity in mAh */
  capacity: number;
  /** Voltage meter source */
  voltageMeterSource: number;
  /** Current meter source */
  currentMeterSource: number;
}

/**
 * MSP_BATTERY_STATE response
 */
export interface MSPBatteryState {
  /** Cell count */
  cellCount: number;
  /** Capacity in mAh */
  capacity: number;
  /** Voltage in 0.1V */
  voltage: number;
  /** mAh drawn */
  mAhDrawn: number;
  /** Current in 0.01A */
  current: number;
  /** Battery state (0=OK, 1=Warning, 2=Critical, 3=Not present) */
  state: number;
}

// =============================================================================
// OSD Configuration
// =============================================================================

/**
 * OSD element position
 */
export interface MSPOsdElement {
  /** Element ID */
  id: number;
  /** X position (0-31 or 0-59 for HD) */
  x: number;
  /** Y position (0-15 or 0-21 for HD) */
  y: number;
  /** Visibility flags per profile */
  visible: number;
}

/**
 * MSP_OSD_CONFIG response
 */
export interface MSPOsdConfig {
  /** OSD flags */
  flags: number;
  /** Video system (0=Auto, 1=PAL, 2=NTSC, 3=HD) */
  videoSystem: number;
  /** Units (0=Imperial, 1=Metric) */
  units: number;
  /** RSSI alarm */
  rssiAlarm: number;
  /** Capacity alarm in mAh */
  capacityAlarm: number;
  /** Elements */
  elements: MSPOsdElement[];
  /** Timer sources */
  timerSource: number[];
  /** Overlay radio mode */
  overlayRadioMode: number;
  /** Display warnings */
  warnings: number;
  /** OSD profiles count */
  osdProfileCount: number;
  /** Selected OSD profile */
  osdProfileIndex: number;
  /** Aux channel for OSD profile switch */
  osdStickOverlayMode: number;
  /** Camera frame width */
  cameraFrameWidth: number;
  /** Camera frame height */
  cameraFrameHeight: number;
}

// =============================================================================
// Connection Types
// =============================================================================

/**
 * Connection state for MSP device
 */
export interface MSPConnectionState {
  /** Whether connected */
  connected: boolean;
  /** Port name/path */
  port: string;
  /** Baud rate */
  baudRate: number;
  /** FC variant code */
  fcVariant: string;
  /** FC version string */
  fcVersion: string;
  /** Board identifier */
  boardId: string;
  /** API version */
  apiVersion: string;
  /** Last error message */
  lastError?: string;
}

// =============================================================================
// Callback Types
// =============================================================================

/** Progress callback for long-running operations */
export type MSPProgressCallback = (progress: {
  current: number;
  total: number;
  percent: number;
  message?: string;
}) => void;

/** Telemetry update callback */
export type MSPTelemetryCallback = (data: {
  attitude?: MSPAttitude;
  altitude?: MSPAltitude;
  analog?: MSPAnalog;
  status?: MSPStatus;
  rc?: MSPRc;
  motor?: MSPMotor;
  gps?: MSPRawGps;
}) => void;
