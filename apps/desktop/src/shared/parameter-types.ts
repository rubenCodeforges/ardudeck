/**
 * Parameter types for MAVLink parameter management
 */

/**
 * MAVLink parameter type enum (MAV_PARAM_TYPE)
 */
export enum MavParamType {
  UINT8 = 1,
  INT8 = 2,
  UINT16 = 3,
  INT16 = 4,
  UINT32 = 5,
  INT32 = 6,
  UINT64 = 7,
  INT64 = 8,
  REAL32 = 9,
  REAL64 = 10,
}

/**
 * Get display name for parameter type
 */
export function getParamTypeName(type: MavParamType): string {
  switch (type) {
    case MavParamType.UINT8: return 'UINT8';
    case MavParamType.INT8: return 'INT8';
    case MavParamType.UINT16: return 'UINT16';
    case MavParamType.INT16: return 'INT16';
    case MavParamType.UINT32: return 'UINT32';
    case MavParamType.INT32: return 'INT32';
    case MavParamType.UINT64: return 'UINT64';
    case MavParamType.INT64: return 'INT64';
    case MavParamType.REAL32: return 'FLOAT';
    case MavParamType.REAL64: return 'DOUBLE';
    default: return 'UNKNOWN';
  }
}

/**
 * Core parameter data
 */
export interface Parameter {
  id: string;           // Parameter name (e.g., "ARMING_CHECK")
  value: number;        // Current value
  type: MavParamType;   // Data type
  index: number;        // Parameter index (0 to paramCount-1)
}

/**
 * Parameter with modification tracking
 */
export interface ParameterWithMeta extends Parameter {
  originalValue?: number;  // Original value from vehicle
  isModified?: boolean;    // Has been changed locally
}

/**
 * Download progress tracking
 */
export interface ParameterProgress {
  total: number;        // Total parameters expected
  received: number;     // Parameters received so far
  percentage: number;   // 0-100
}

/**
 * PARAM_VALUE message payload (from MAVLink)
 */
export interface ParamValuePayload {
  paramId: string;
  paramValue: number;
  paramType: number;
  paramCount: number;
  paramIndex: number;
}
