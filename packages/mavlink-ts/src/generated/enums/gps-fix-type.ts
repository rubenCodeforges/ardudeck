/**
 * Type of GPS fix
 */
export enum GpsFixType {
  /** No GPS connected */
  GPS_FIX_TYPE_NO_GPS = 0,
  /** No position information, GPS is connected */
  GPS_FIX_TYPE_NO_FIX = 1,
  /** 2D position */
  GPS_FIX_TYPE_2D_FIX = 2,
  /** 3D position */
  GPS_FIX_TYPE_3D_FIX = 3,
  /** DGPS/SBAS aided 3D position */
  GPS_FIX_TYPE_DGPS = 4,
  /** RTK float, 3D position */
  GPS_FIX_TYPE_RTK_FLOAT = 5,
  /** RTK Fixed, 3D position */
  GPS_FIX_TYPE_RTK_FIXED = 6,
  /** Static fixed, typically used for base stations */
  GPS_FIX_TYPE_STATIC = 7,
  /** PPP, 3D position. */
  GPS_FIX_TYPE_PPP = 8,
}

/** @deprecated Use GpsFixType instead */
export const GPS_FIX_TYPE = GpsFixType;