export enum GpsInputIgnoreFlags {
  /** ignore altitude field */
  GPS_INPUT_IGNORE_FLAG_ALT = 1,
  /** ignore hdop field */
  GPS_INPUT_IGNORE_FLAG_HDOP = 2,
  /** ignore vdop field */
  GPS_INPUT_IGNORE_FLAG_VDOP = 4,
  /** ignore horizontal velocity field (vn and ve) */
  GPS_INPUT_IGNORE_FLAG_VEL_HORIZ = 8,
  /** ignore vertical velocity field (vd) */
  GPS_INPUT_IGNORE_FLAG_VEL_VERT = 16,
  /** ignore speed accuracy field */
  GPS_INPUT_IGNORE_FLAG_SPEED_ACCURACY = 32,
  /** ignore horizontal accuracy field */
  GPS_INPUT_IGNORE_FLAG_HORIZONTAL_ACCURACY = 64,
  /** ignore vertical accuracy field */
  GPS_INPUT_IGNORE_FLAG_VERTICAL_ACCURACY = 128,
}

/** @deprecated Use GpsInputIgnoreFlags instead */
export const GPS_INPUT_IGNORE_FLAGS = GpsInputIgnoreFlags;