/**
 * State of RAIM processing.
 */
export enum GpsRaimState {
  /** RAIM capability is unknown. */
  GPS_RAIM_STATE_UNKNOWN = 0,
  /** RAIM is disabled. */
  GPS_RAIM_STATE_DISABLED = 1,
  /** RAIM integrity check was successful. */
  GPS_RAIM_STATE_OK = 2,
  /** RAIM integrity check failed. */
  GPS_RAIM_STATE_FAILED = 3,
}

/** @deprecated Use GpsRaimState instead */
export const GPS_RAIM_STATE = GpsRaimState;