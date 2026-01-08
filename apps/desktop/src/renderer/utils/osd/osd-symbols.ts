/**
 * OSD Symbol Constants
 *
 * Character indices for OSD symbols in MAX7456/AT7456E fonts.
 * Ported from iNav Configurator.
 */

export const SYM = {
  // Basic symbols
  BLANK: 0x20,
  LAST_CHAR: 225,

  // Signal/Link quality
  RSSI: 0x01,
  LQ: 0x02,
  RSS2: 0x11,
  DB: 0x12,
  DBM: 0x13,
  SNR: 0x14,

  // GPS
  LAT: 0x03,
  LON: 0x04,
  GPS_SAT1: 0x08,
  GPS_SAT2: 0x09,
  GPS_HDP1: 0x0e,
  GPS_HDP2: 0x0f,

  // Navigation
  AZIMUTH: 0x05,
  HOME: 0x10,
  DIRECTION: 0x17,
  DIR_TO_HOME: 0x13c,
  HEADING: 0x0c,
  DEGREES: 0x0b,
  HEADING_N: 0xc8,
  HEADING_E: 0xca,
  HEADING_W: 0xcb,
  HEADING_DIVIDED_LINE: 0xcc,
  HEADING_LINE: 0xcd,
  GROUND_COURSE: 0xdc,
  SCALE: 0x0d,

  // Artificial Horizon
  AH_RIGHT: 0x12d,
  AH_LEFT: 0x12c,
  AH_CENTER_LINE: 0x13a,
  AH_CENTER_LINE_RIGHT: 0x13b,
  AH_DECORATION_UP: 0x15,
  AH_DECORATION_DOWN: 0x16,
  AH_DECORATION: 0x131,
  AH_BAR9_0: 0x14c,

  // Aircraft symbols (for crosshairs)
  AH_AIRCRAFT0: 0x1a2,
  AH_AIRCRAFT1: 0x1a3,
  AH_AIRCRAFT2: 0x1a4,
  AH_AIRCRAFT3: 0x1a5,
  AH_AIRCRAFT4: 0x1a6,

  // Battery
  BATT: 0x63,
  MILLIOHM: 0x62,
  VOLT: 0x1f,
  AMP: 0x6a,
  MAH: 0x99,
  WH: 0x6d,
  WATT: 0x71,
  MW: 0x72,
  MAH_KM_0: 0x6b,
  MAH_KM_1: 0x6c,
  MAH_MI_0: 0x93,
  MAH_MI_1: 0x94,
  MAH_NM_0: 0x60,
  MAH_NM_1: 0x61,
  WH_KM: 0x6e,
  WH_MI: 0x6f,
  WH_NM: 0x70,

  // Throttle
  THR: 0x95,
  THROTTLE_GAUGE_EMPTY: 0x16b,
  THROTTLE_GAUGE_FULL: 0x16d,

  // Speed/Distance
  KM: 0x83,
  KMH: 0x90,
  KMH_3D: 0x88,
  MPH: 0x91,
  MPH_3D: 0x89,
  M: 0x82,
  MI: 0x84,
  NM: 0x85,
  KT: 0x92,
  KT_3D: 0x8a,
  M_S: 0x8f,
  FT_S: 0x8d,
  HUND_FTM: 0x8e,
  DIST_KM: 0x7e,
  DIST_MI: 0x80,
  DIST_NM: 0x81,
  TRIP_DIST: 0x75,
  ODOMETER: 0x168,
  MIN_GND_SPEED: 0xde,

  // Altitude
  ALT_M: 0x76,
  ALT_FT: 0x78,
  AH_V_FT_0: 0xd6,
  AH_V_FT_1: 0xd7,
  AH_V_M_0: 0xd8,
  AH_V_M_1: 0xd9,
  AH_NM: 0x3f,

  // Vario
  VARIO_UP_2A: 0x155,

  // Wind
  WIND_SPEED_HORIZONTAL: 0x86,
  WIND_SPEED_VERTICAL: 0x87,
  AIR: 0x8c,

  // Time
  FLY_M: 0x9f,
  ON_M: 0x9e,
  CLOCK: 0xa0,
  GLIDE_MINS: 0xd5,
  FLIGHT_MINS_REMAINING: 0xda,
  FLIGHT_DIST_REMAINING: 0x167,

  // Numbers with dots
  ZERO_HALF_TRAILING_DOT: 0xa1,
  ZERO_HALF_LEADING_DOT: 0xb1,

  // Attitude indicators
  ROLL_LEFT: 0xad,
  ROLL_LEVEL: 0xae,
  ROLL_RIGHT: 0xaf,
  PITCH_UP: 0xb0,
  PITCH_DOWN: 0xbb,

  // Temperature
  TEMP_C: 0x97,
  TEMP_F: 0x96,
  BARO_TEMP: 0xc0,
  IMU_TEMP: 0xc1,
  TEMP: 0xc2,
  ESC_TEMPERATURE: 0xc3,

  // G-Force
  GFORCE: 0xbc,
  GFORCE_X: 0xbd,
  GFORCE_Y: 0xbe,
  GFORCE_Z: 0xbf,

  // Motors/ESC
  RPM: 0x8b,

  // Glide
  GLIDESLOPE: 0x9c,
  GLIDE_RANGE: 0xd4,

  // VTX
  VTX_POWER: 0x27,

  // Misc
  MAX: 0xce,
  PROFILE: 0xcf,
  SWITCH_INDICATOR_HIGH: 0xd2,
  ALERT: 0xdd,
  CROSS_TRACK_ERROR: 0xfc,
  ADSB: 0xfd,
  BLACKBOX: 0xfe,

  // Pan servo
  PAN_SERVO_IS_OFFSET_L: 0x1c7,

  // Pilot logo
  PILOT_LOGO_SML_L: 0x1d5,
  PILOT_LOGO_SML_C: 0x1d6,
  PILOT_LOGO_SML_R: 0x1d7,

  // HUD elements
  SYM_HUD_SIGNAL_3: 0x163,
  SYM_HUD_CARDINAL: 0x1ba,
  RX_BAND: 0x169,
  RX_MODE: 0x16a,

  // Digits (ASCII compatible)
  DIGIT_0: 0x30,
  DIGIT_1: 0x31,
  DIGIT_2: 0x32,
  DIGIT_3: 0x33,
  DIGIT_4: 0x34,
  DIGIT_5: 0x35,
  DIGIT_6: 0x36,
  DIGIT_7: 0x37,
  DIGIT_8: 0x38,
  DIGIT_9: 0x39,

  // Letters (ASCII compatible - uppercase)
  LETTER_A: 0x41,
  LETTER_B: 0x42,
  LETTER_C: 0x43,
  LETTER_D: 0x44,
  LETTER_E: 0x45,
  LETTER_F: 0x46,
  LETTER_G: 0x47,
  LETTER_H: 0x48,
  LETTER_I: 0x49,
  LETTER_J: 0x4a,
  LETTER_K: 0x4b,
  LETTER_L: 0x4c,
  LETTER_M: 0x4d,
  LETTER_N: 0x4e,
  LETTER_O: 0x4f,
  LETTER_P: 0x50,
  LETTER_Q: 0x51,
  LETTER_R: 0x52,
  LETTER_S: 0x53,
  LETTER_T: 0x54,
  LETTER_U: 0x55,
  LETTER_V: 0x56,
  LETTER_W: 0x57,
  LETTER_X: 0x58,
  LETTER_Y: 0x59,
  LETTER_Z: 0x5a,
} as const;

export type OsdSymbol = (typeof SYM)[keyof typeof SYM];

/**
 * Crosshairs styles - arrays of character indices
 */
export const AH_CROSSHAIRS = [
  0x166, // Style 0: single char
  0x1a4, // Style 1: aircraft center
  [0x190, 0x191, 0x192], // Style 2
  [0x193, 0x194, 0x195], // Style 3
  [0x196, 0x197, 0x198], // Style 4
  [0x199, 0x19a, 0x19b], // Style 5
  [0x19c, 0x19d, 0x19e], // Style 6
  [0x19f, 0x1a0, 0x1a1], // Style 7
] as const;

/**
 * Convert a number to OSD digit symbols
 */
export function numberToSymbols(value: number, digits: number = 0, padChar: number = SYM.BLANK): number[] {
  const str = digits > 0 ? Math.abs(value).toString().padStart(digits, ' ') : Math.abs(value).toString();
  const symbols: number[] = [];

  if (value < 0) {
    symbols.push(0x2d); // minus sign
  }

  for (const char of str) {
    if (char === ' ') {
      symbols.push(padChar);
    } else if (char >= '0' && char <= '9') {
      symbols.push(SYM.DIGIT_0 + parseInt(char));
    } else if (char === '.') {
      symbols.push(0x2e); // period
    }
  }

  return symbols;
}

/**
 * Convert string to OSD character indices (ASCII mapping)
 */
export function stringToSymbols(str: string): number[] {
  return Array.from(str).map((char) => char.charCodeAt(0));
}
