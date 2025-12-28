/**
 * Parameter protocol error types (see PARAM_ERROR).
 */
export enum MavParamError {
  /** No error occurred (not expected in PARAM_ERROR but may be used in future implementations. */
  MAV_PARAM_ERROR_NO_ERROR = 0,
  /** Parameter does not exist */
  MAV_PARAM_ERROR_DOES_NOT_EXIST = 1,
  /** Parameter value does not fit within accepted range */
  MAV_PARAM_ERROR_VALUE_OUT_OF_RANGE = 2,
  /** Caller is not permitted to set the value of this parameter */
  MAV_PARAM_ERROR_PERMISSION_DENIED = 3,
  /** Unknown component specified */
  MAV_PARAM_ERROR_COMPONENT_NOT_FOUND = 4,
  /** Parameter is read-only */
  MAV_PARAM_ERROR_READ_ONLY = 5,
}

/** @deprecated Use MavParamError instead */
export const MAV_PARAM_ERROR = MavParamError;