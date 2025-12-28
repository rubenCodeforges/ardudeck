/**
 * Signal spoofing state in a GPS receiver.
 */
export enum GpsSpoofingState {
  /** The GPS receiver does not provide GPS signal spoofing info. */
  GPS_SPOOFING_STATE_UNKNOWN = 0,
  /** The GPS receiver detected no signal spoofing. */
  GPS_SPOOFING_STATE_OK = 1,
  /** The GPS receiver detected and mitigated signal spoofing. */
  GPS_SPOOFING_STATE_MITIGATED = 2,
  /** The GPS receiver detected signal spoofing but still has a fix. */
  GPS_SPOOFING_STATE_DETECTED = 3,
}

/** @deprecated Use GpsSpoofingState instead */
export const GPS_SPOOFING_STATE = GpsSpoofingState;