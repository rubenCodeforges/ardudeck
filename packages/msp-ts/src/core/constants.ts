/**
 * MSP Protocol Constants
 * MultiWii Serial Protocol v1 and v2 definitions
 */

// =============================================================================
// Protocol Framing
// =============================================================================

/** MSP v1 header bytes: $M */
export const MSP_V1_HEADER = [0x24, 0x4d] as const;

/** MSP v2 header bytes: $X */
export const MSP_V2_HEADER = [0x24, 0x58] as const;

/** Direction byte for request (outgoing to FC) */
export const MSP_DIRECTION_REQUEST = 0x3c; // '<'

/** Direction byte for response (incoming from FC) */
export const MSP_DIRECTION_RESPONSE = 0x3e; // '>'

/** Direction byte for error response */
export const MSP_DIRECTION_ERROR = 0x21; // '!'

// =============================================================================
// Payload Limits
// =============================================================================

/** Maximum payload length for MSP v1 (1 byte length field) */
export const MSP_V1_MAX_PAYLOAD = 255;

/** Maximum payload length for MSP v2 (2 byte length field) */
export const MSP_V2_MAX_PAYLOAD = 65535;

/** Minimum packet size for MSP v1: header(2) + dir(1) + len(1) + cmd(1) + checksum(1) */
export const MSP_V1_MIN_PACKET_SIZE = 6;

/** Minimum packet size for MSP v2: header(2) + dir(1) + flag(1) + cmd(2) + len(2) + crc(1) */
export const MSP_V2_MIN_PACKET_SIZE = 9;

// =============================================================================
// MSP Command IDs
// =============================================================================

export const MSP = {
  // -------------------------------------------------------------------------
  // Info Commands (1-19)
  // -------------------------------------------------------------------------
  API_VERSION: 1,
  FC_VARIANT: 2,
  FC_VERSION: 3,
  BOARD_INFO: 4,
  BUILD_INFO: 5,
  NAME: 10,
  SET_NAME: 11,

  // -------------------------------------------------------------------------
  // Mixed Commands (20-99) - Configuration and Status
  // -------------------------------------------------------------------------
  FEATURE_CONFIG: 36,
  SET_FEATURE_CONFIG: 37,
  BOARD_ALIGNMENT_CONFIG: 38,
  SET_BOARD_ALIGNMENT_CONFIG: 39,
  CURRENT_METER_CONFIG: 40,
  SET_CURRENT_METER_CONFIG: 41,
  MIXER_CONFIG: 42,
  SET_MIXER_CONFIG: 43,
  RX_CONFIG: 44,
  SET_RX_CONFIG: 45,
  LED_COLORS: 46,
  SET_LED_COLORS: 47,
  LED_STRIP_CONFIG: 48,
  SET_LED_STRIP_CONFIG: 49,
  RSSI_CONFIG: 50,
  SET_RSSI_CONFIG: 51,
  ADJUSTMENT_RANGES: 52,
  SET_ADJUSTMENT_RANGE: 53,
  CF_SERIAL_CONFIG: 54,
  SET_CF_SERIAL_CONFIG: 55,
  VOLTAGE_METER_CONFIG: 56,
  SET_VOLTAGE_METER_CONFIG: 57,
  SONAR_ALTITUDE: 58,
  ARMING_CONFIG: 61,
  SET_ARMING_CONFIG: 62,
  RX_MAP: 64,
  SET_RX_MAP: 65,
  REBOOT: 68,
  DATAFLASH_SUMMARY: 70,
  DATAFLASH_READ: 71,
  DATAFLASH_ERASE: 72,
  LOOP_TIME: 73,
  SET_LOOP_TIME: 74,
  FAILSAFE_CONFIG: 75,
  SET_FAILSAFE_CONFIG: 76,
  RXFAIL_CONFIG: 77,
  SET_RXFAIL_CONFIG: 78,
  SDCARD_SUMMARY: 79,
  BLACKBOX_CONFIG: 80,
  SET_BLACKBOX_CONFIG: 81,
  TRANSPONDER_CONFIG: 82,
  SET_TRANSPONDER_CONFIG: 83,
  OSD_CONFIG: 84,
  SET_OSD_CONFIG: 85,
  OSD_CHAR_READ: 86,
  OSD_CHAR_WRITE: 87,
  VTX_CONFIG: 88,
  SET_VTX_CONFIG: 89,
  ADVANCED_CONFIG: 90,
  SET_ADVANCED_CONFIG: 91,
  FILTER_CONFIG: 92,
  SET_FILTER_CONFIG: 93,
  PID_ADVANCED: 94,
  SET_PID_ADVANCED: 95,
  SENSOR_CONFIG: 96,
  SET_SENSOR_CONFIG: 97,
  CAMERA_CONTROL: 98,
  SET_ARMING_DISABLED: 99,

  // -------------------------------------------------------------------------
  // Telemetry Commands (100-119)
  // -------------------------------------------------------------------------
  STATUS: 101,
  RAW_IMU: 102,
  SERVO: 103,
  MOTOR: 104,
  RC: 105,
  RAW_GPS: 106,
  COMP_GPS: 107,
  ATTITUDE: 108,
  ALTITUDE: 109,
  ANALOG: 110,
  RC_TUNING: 111,
  PID: 112,
  ACTIVEBOXES: 113,
  MISC: 114,
  MOTOR_PINS: 115,
  BOXNAMES: 116,
  PIDNAMES: 117,
  WP: 118,
  BOXIDS: 119,

  // -------------------------------------------------------------------------
  // Configuration Read Commands (120-149)
  // -------------------------------------------------------------------------
  SERVO_CONFIGURATIONS: 120,
  MOTOR_3D_CONFIG: 124,
  RC_DEADBAND: 125,
  SENSOR_ALIGNMENT: 126,
  LED_STRIP_MODECOLOR: 127,
  VOLTAGE_METERS: 128,
  CURRENT_METERS: 129,
  BATTERY_STATE: 130,
  MOTOR_CONFIG: 131,
  GPS_CONFIG: 132,
  COMPASS_CONFIG: 133,
  ESC_SENSOR_DATA: 134,
  GPS_RESCUE: 135,
  GPS_RESCUE_PIDS: 136,
  VTXTABLE_BAND: 137,
  VTXTABLE_POWERLEVEL: 138,
  MOTOR_TELEMETRY: 139,
  SIMPLIFIED_TUNING: 140,

  // -------------------------------------------------------------------------
  // Status Extended (150-159)
  // -------------------------------------------------------------------------
  STATUS_EX: 150,
  SENSOR_STATUS: 151,
  UID: 160,
  GPS_SV_INFO: 164,

  // -------------------------------------------------------------------------
  // Set Commands (200-255)
  // -------------------------------------------------------------------------
  SET_RAW_RC: 200,
  SET_RAW_GPS: 201,
  SET_PID: 202,
  SET_BOX: 203,
  SET_RC_TUNING: 204,
  ACC_CALIBRATION: 205,
  MAG_CALIBRATION: 206,
  SET_MISC: 207,
  RESET_CONF: 208,
  SET_WP: 209,
  SELECT_SETTING: 210,
  SET_HEADING: 211,
  SET_SERVO_CONFIGURATION: 212,
  SET_MOTOR: 214,
  SET_MOTOR_3D_CONFIG: 217,
  SET_RC_DEADBAND: 218,
  SET_RESET_CURR_PID: 219,
  SET_SENSOR_ALIGNMENT: 220,
  SET_LED_STRIP_MODECOLOR: 221,
  SET_MOTOR_CONFIG: 222,
  SET_GPS_CONFIG: 223,
  SET_COMPASS_CONFIG: 224,
  SET_GPS_RESCUE: 225,
  SET_GPS_RESCUE_PIDS: 226,
  SET_VTXTABLE_BAND: 227,
  SET_VTXTABLE_POWERLEVEL: 228,
  SET_SIMPLIFIED_TUNING: 229,

  // -------------------------------------------------------------------------
  // Special Commands (240-255)
  // -------------------------------------------------------------------------
  SET_4WAY_IF: 245,
  SET_RTC: 246,
  RTC: 247,
  EEPROM_WRITE: 250,
  RESERVE_1: 251,
  RESERVE_2: 252,
  DEBUGMSG: 253,
  DEBUG: 254,

  // -------------------------------------------------------------------------
  // Mode Range Commands
  // -------------------------------------------------------------------------
  MODE_RANGES: 34,
  SET_MODE_RANGE: 35,
  MODE_RANGES_EXTRA: 238,
  SET_MODE_RANGE_EXTRA: 239,

  // -------------------------------------------------------------------------
  // Battery Config
  // -------------------------------------------------------------------------
  BATTERY_CONFIG: 32,
  SET_BATTERY_CONFIG: 33,
} as const;

// =============================================================================
// MSP v2 Specific Commands (Extended Commands)
// =============================================================================

export const MSP2 = {
  // Common commands
  COMMON_TZ: 0x1001,
  COMMON_SET_TZ: 0x1002,
  COMMON_SETTING: 0x1003,
  COMMON_SET_SETTING: 0x1004,
  COMMON_MOTOR_MIXER: 0x1005,
  COMMON_SET_MOTOR_MIXER: 0x1006,
  COMMON_SETTING_INFO: 0x1007,
  COMMON_PG_LIST: 0x1008,

  // Betaflight specific
  BETAFLIGHT_BIND: 0x3000,
  BETAFLIGHT_READ_FEATURES: 0x3001,

  // iNav specific - General
  INAV_STATUS: 0x2000,
  INAV_OPTICAL_FLOW: 0x2001,
  INAV_ANALOG: 0x2002,
  INAV_MISC: 0x2003,
  INAV_SET_MISC: 0x2004,
  INAV_BATTERY_CONFIG: 0x2005,
  INAV_SET_BATTERY_CONFIG: 0x2006,
  INAV_RATE_PROFILE: 0x2007,
  INAV_SET_RATE_PROFILE: 0x2008,
  INAV_AIR_SPEED: 0x2009,
  INAV_OUTPUT_MAPPING: 0x200A,
  INAV_MC_BRAKING: 0x200B,
  INAV_SET_MC_BRAKING: 0x200C,

  // iNav specific - Servo Mixer
  INAV_SERVO_MIXER: 0x2020,
  INAV_SET_SERVO_MIXER: 0x2021,
  INAV_LOGIC_CONDITIONS: 0x2022,
  INAV_SET_LOGIC_CONDITIONS: 0x2023,
  INAV_LOGIC_CONDITIONS_STATUS: 0x2024,
  INAV_GVAR_STATUS: 0x2025,
  INAV_PROGRAMMING_PID: 0x2026,
  INAV_SET_PROGRAMMING_PID: 0x2027,
  INAV_PROGRAMMING_PID_STATUS: 0x2028,

  // iNav specific - Navigation
  INAV_NAV_POSHOLD: 0x2010,
  INAV_SET_NAV_POSHOLD: 0x2011,
  INAV_CALIBRATION_DATA: 0x2012,
  INAV_SET_CALIBRATION_DATA: 0x2013,
  INAV_POSITION_ESTIMATION_CONFIG: 0x2014,
  INAV_SET_POSITION_ESTIMATION_CONFIG: 0x2015,
  INAV_RTH_AND_LAND_CONFIG: 0x2016,
  INAV_SET_RTH_AND_LAND_CONFIG: 0x2017,
  INAV_FW_CONFIG: 0x2018,
  INAV_SET_FW_CONFIG: 0x2019,
  INAV_FWUPD_PREPARE: 0x201A,
  INAV_FWUPD_STORE: 0x201B,
  INAV_FWUPD_EXEC: 0x201C,
  INAV_FWUPD_ROLLBACK_PREPARE: 0x201D,
  INAV_FWUPD_ROLLBACK_EXEC: 0x201E,

  // Sensor commands
  SENSOR_RANGEFINDER: 0x1F01,
  SENSOR_OPTIC_FLOW: 0x1F02,
  SENSOR_GPS: 0x1F03,
  SENSOR_COMPASS: 0x1F04,
  SENSOR_BAROMETER: 0x1F05,
  SENSOR_AIRSPEED: 0x1F06,
} as const;

// =============================================================================
// Reboot Types
// =============================================================================

export const MSP_REBOOT_TYPE = {
  /** Normal firmware reboot */
  FIRMWARE: 0,
  /** Enter ROM bootloader (DFU mode for native USB MCUs) */
  BOOTLOADER_ROM: 1,
  /** Mass Storage Class mode */
  MSC: 2,
  /** MSC with UTC time */
  MSC_UTC: 3,
  /** Enter flash bootloader (custom bootloader for serial boards) */
  BOOTLOADER_FLASH: 4,
} as const;

// =============================================================================
// Sensor Flags (from MSP_STATUS)
// =============================================================================

export const MSP_SENSOR_FLAGS = {
  ACC: 1 << 0,
  BARO: 1 << 1,
  MAG: 1 << 2,
  GPS: 1 << 3,
  RANGEFINDER: 1 << 4,
  GYRO: 1 << 5,
} as const;

// =============================================================================
// Arming Disabled Flags
// =============================================================================

export const MSP_ARMING_DISABLE_FLAGS = {
  NO_GYRO: 1 << 0,
  FAILSAFE: 1 << 1,
  RX_FAILSAFE: 1 << 2,
  BAD_RX_RECOVERY: 1 << 3,
  BOXFAILSAFE: 1 << 4,
  RUNAWAY_TAKEOFF: 1 << 5,
  CRASH_DETECTED: 1 << 6,
  THROTTLE: 1 << 7,
  ANGLE: 1 << 8,
  BOOT_GRACE_TIME: 1 << 9,
  NOPREARM: 1 << 10,
  LOAD: 1 << 11,
  CALIBRATING: 1 << 12,
  CLI: 1 << 13,
  CMS_MENU: 1 << 14,
  BST: 1 << 15,
  MSP: 1 << 16,
  PARALYZE: 1 << 17,
  GPS: 1 << 18,
  RESC: 1 << 19,
  RPMFILTER: 1 << 20,
  REBOOT_REQUIRED: 1 << 21,
  DSHOT_BITBANG: 1 << 22,
  ACC_CALIBRATION: 1 << 23,
  MOTOR_PROTOCOL: 1 << 24,
  ARM_SWITCH: 1 << 25,
} as const;

// =============================================================================
// Flight Modes (Box IDs)
// =============================================================================

export const MSP_FLIGHT_MODE = {
  ARM: 0,
  ANGLE: 1,
  HORIZON: 2,
  MAG: 3,
  HEADFREE: 4,
  PASSTHRU: 5,
  FAILSAFE: 6,
  GPSRESCUE: 7,
  ANTIGRAVITY: 8,
  HEADADJ: 9,
  CAMSTAB: 10,
  BEEPERON: 13,
  LEDLOW: 15,
  CALIB: 17,
  OSD: 19,
  TELEMETRY: 20,
  SERVO1: 23,
  SERVO2: 24,
  SERVO3: 25,
  BLACKBOX: 26,
  AIRMODE: 28,
  ACROTRAINER: 29,
  VTXPITMODE: 30,
  USER1: 31,
  USER2: 32,
  USER3: 33,
  USER4: 34,
  PIDAUDIO: 35,
  PARALYZE: 36,
  PREARM: 38,
  BEEPGPSCOUNT: 39,
  VTXCONTROL: 40,
  LAUNCHCONTROL: 41,
  MSPOVERRIDE: 42,
  STICKCOMMANDDISABLE: 43,
  BEEPERMUTE: 44,
} as const;

// =============================================================================
// FC Variants
// =============================================================================

export const MSP_FC_VARIANT = {
  BETAFLIGHT: 'BTFL',
  INAV: 'INAV',
  CLEANFLIGHT: 'CLFL',
  EMUFLIGHT: 'EMUF',
  QUICKSILVER: 'QUIK',
} as const;

// =============================================================================
// Rate Types
// =============================================================================

export const MSP_RATES_TYPE = {
  BETAFLIGHT: 0,
  RACEFLIGHT: 1,
  KISS: 2,
  ACTUAL: 3,
  QUICK: 4,
} as const;

// =============================================================================
// Default Values
// =============================================================================

export const MSP_DEFAULTS = {
  /** Default baud rate for MSP communication */
  BAUD_RATE: 115200,
  /** Default timeout for MSP responses in ms */
  TIMEOUT_MS: 2000,
  /** Polling rate for telemetry in Hz */
  TELEMETRY_RATE_HZ: 50,
} as const;
