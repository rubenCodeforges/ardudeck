/**
 * Specifies the datatype of a MAVLink extended parameter.
 */
export enum MavParamExtType {
  /** 8-bit unsigned integer */
  MAV_PARAM_EXT_TYPE_UINT8 = 1,
  /** 8-bit signed integer */
  MAV_PARAM_EXT_TYPE_INT8 = 2,
  /** 16-bit unsigned integer */
  MAV_PARAM_EXT_TYPE_UINT16 = 3,
  /** 16-bit signed integer */
  MAV_PARAM_EXT_TYPE_INT16 = 4,
  /** 32-bit unsigned integer */
  MAV_PARAM_EXT_TYPE_UINT32 = 5,
  /** 32-bit signed integer */
  MAV_PARAM_EXT_TYPE_INT32 = 6,
  /** 64-bit unsigned integer */
  MAV_PARAM_EXT_TYPE_UINT64 = 7,
  /** 64-bit signed integer */
  MAV_PARAM_EXT_TYPE_INT64 = 8,
  /** 32-bit floating-point */
  MAV_PARAM_EXT_TYPE_REAL32 = 9,
  /** 64-bit floating-point */
  MAV_PARAM_EXT_TYPE_REAL64 = 10,
  /** Custom Type */
  MAV_PARAM_EXT_TYPE_CUSTOM = 11,
}

/** @deprecated Use MavParamExtType instead */
export const MAV_PARAM_EXT_TYPE = MavParamExtType;