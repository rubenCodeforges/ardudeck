/**
 * Navigation filter mode
 */
export enum UalbertaNavMode {
  NAV_AHRS_INIT = 1,
  /** AHRS mode */
  NAV_AHRS = 2,
  /** INS/GPS initialization mode */
  NAV_INS_GPS_INIT = 3,
  /** INS/GPS mode */
  NAV_INS_GPS = 4,
}

/** @deprecated Use UalbertaNavMode instead */
export const UALBERTA_NAV_MODE = UalbertaNavMode;