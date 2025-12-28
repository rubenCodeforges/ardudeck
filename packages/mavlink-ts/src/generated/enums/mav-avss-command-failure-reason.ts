export enum MavAvssCommandFailureReason {
  /** AVSS defined command failure reason. PRS not steady. */
  PRS_NOT_STEADY = 1,
  /** AVSS defined command failure reason. PRS DTM not armed. */
  PRS_DTM_NOT_ARMED = 2,
  /** AVSS defined command failure reason. PRS OTM not armed. */
  PRS_OTM_NOT_ARMED = 3,
}

/** @deprecated Use MavAvssCommandFailureReason instead */
export const MAV_AVSS_COMMAND_FAILURE_REASON = MavAvssCommandFailureReason;