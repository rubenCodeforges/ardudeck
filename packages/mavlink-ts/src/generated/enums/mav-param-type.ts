/**
 * Specifies the datatype of a MAVLink parameter.
 */
export enum MavParamType {
  /** 8-bit unsigned integer */
  MAV_PARAM_TYPE_UINT8 = 1,
  /** 8-bit signed integer */
  MAV_PARAM_TYPE_INT8 = 2,
  /** 16-bit unsigned integer */
  MAV_PARAM_TYPE_UINT16 = 3,
  /** 16-bit signed integer */
  MAV_PARAM_TYPE_INT16 = 4,
  /** 32-bit unsigned integer */
  MAV_PARAM_TYPE_UINT32 = 5,
  /** 32-bit signed integer */
  MAV_PARAM_TYPE_INT32 = 6,
  /** 64-bit unsigned integer */
  MAV_PARAM_TYPE_UINT64 = 7,
  /** 64-bit signed integer */
  MAV_PARAM_TYPE_INT64 = 8,
  /** 32-bit floating-point */
  MAV_PARAM_TYPE_REAL32 = 9,
  /** 64-bit floating-point */
  MAV_PARAM_TYPE_REAL64 = 10,
}

/** @deprecated Use MavParamType instead */
export const MAV_PARAM_TYPE = MavParamType;