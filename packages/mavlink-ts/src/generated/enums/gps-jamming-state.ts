/**
 * Signal jamming state in a GPS receiver.
 */
export enum GpsJammingState {
  /** The GPS receiver does not provide GPS signal jamming info. */
  GPS_JAMMING_STATE_UNKNOWN = 0,
  /** The GPS receiver detected no signal jamming. */
  GPS_JAMMING_STATE_OK = 1,
  /** The GPS receiver detected and mitigated signal jamming. */
  GPS_JAMMING_STATE_MITIGATED = 2,
  /** The GPS receiver detected signal jamming. */
  GPS_JAMMING_STATE_DETECTED = 3,
}

/** @deprecated Use GpsJammingState instead */
export const GPS_JAMMING_STATE = GpsJammingState;