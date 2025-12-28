/**
 * Signal authentication state in a GPS receiver.
 */
export enum GpsAuthenticationState {
  /** The GPS receiver does not provide GPS signal authentication info. */
  GPS_AUTHENTICATION_STATE_UNKNOWN = 0,
  /** The GPS receiver is initializing signal authentication. */
  GPS_AUTHENTICATION_STATE_INITIALIZING = 1,
  /** The GPS receiver encountered an error while initializing signal authentication. */
  GPS_AUTHENTICATION_STATE_ERROR = 2,
  /** The GPS receiver has correctly authenticated all signals. */
  GPS_AUTHENTICATION_STATE_OK = 3,
  /** GPS signal authentication is disabled on the receiver. */
  GPS_AUTHENTICATION_STATE_DISABLED = 4,
}

/** @deprecated Use GpsAuthenticationState instead */
export const GPS_AUTHENTICATION_STATE = GpsAuthenticationState;