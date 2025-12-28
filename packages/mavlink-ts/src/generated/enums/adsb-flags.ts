/**
 * These flags indicate status such as data validity of each data source. Set = data valid
 * @bitmask
 */
export enum AdsbFlags {
  ADSB_FLAGS_VALID_COORDS = 1,
  ADSB_FLAGS_VALID_ALTITUDE = 2,
  ADSB_FLAGS_VALID_HEADING = 4,
  ADSB_FLAGS_VALID_VELOCITY = 8,
  ADSB_FLAGS_VALID_CALLSIGN = 16,
  ADSB_FLAGS_VALID_SQUAWK = 32,
  ADSB_FLAGS_SIMULATED = 64,
  ADSB_FLAGS_VERTICAL_VELOCITY_VALID = 128,
  ADSB_FLAGS_BARO_VALID = 256,
  ADSB_FLAGS_SOURCE_UAT = 32768,
}

/** @deprecated Use AdsbFlags instead */
export const ADSB_FLAGS = AdsbFlags;