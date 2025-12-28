/**
 * Result from PARAM_EXT_SET message.
 */
export enum ParamAck {
  /** Parameter value ACCEPTED and SET */
  PARAM_ACK_ACCEPTED = 0,
  /** Parameter value UNKNOWN/UNSUPPORTED */
  PARAM_ACK_VALUE_UNSUPPORTED = 1,
  /** Parameter failed to set */
  PARAM_ACK_FAILED = 2,
  /** Parameter value received but not yet set/accepted. A subsequent PARAM_EXT_ACK with the final result will follow once operation is completed. This is returned immediately for parameters that take longer to set, indicating that the the parameter was received and does not need to be resent. */
  PARAM_ACK_IN_PROGRESS = 3,
}

/** @deprecated Use ParamAck instead */
export const PARAM_ACK = ParamAck;