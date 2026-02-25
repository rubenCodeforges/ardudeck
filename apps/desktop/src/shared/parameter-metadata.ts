/**
 * Parameter Metadata Types
 * Structures for ArduPilot parameter definitions from XML
 */

export interface ParameterMetadata {
  name: string;
  humanName: string;
  description: string;
  range?: {
    min: number;
    max: number;
  };
  units?: string;
  values?: Record<number, string>; // For enum-like params (e.g., 0: "Disabled", 1: "Enabled")
  increment?: number;
  rebootRequired?: boolean;
  bitmask?: Record<number, string>; // For bitmask params
}

export type VehicleType = 'copter' | 'plane' | 'rover' | 'sub' | 'tracker';

export interface ParameterMetadataStore {
  [paramName: string]: ParameterMetadata;
}

// ArduPilot parameter XML URLs (apm.pdef.xml format)
export const PARAMETER_METADATA_URLS: Record<VehicleType, string> = {
  copter: 'https://autotest.ardupilot.org/Parameters/ArduCopter/apm.pdef.xml',
  plane: 'https://autotest.ardupilot.org/Parameters/ArduPlane/apm.pdef.xml',
  rover: 'https://autotest.ardupilot.org/Parameters/Rover/apm.pdef.xml',
  sub: 'https://autotest.ardupilot.org/Parameters/ArduSub/apm.pdef.xml',
  tracker: 'https://autotest.ardupilot.org/Parameters/AntennaTracker/apm.pdef.xml',
};

// Map MAVLink MAV_TYPE to our VehicleType
/**
 * Validation result for parameter values
 */
export interface ValidationResult {
  valid: boolean;
  error?: string;
  warning?: string;
}

/**
 * Validate a parameter value against its metadata
 */
export function validateParameterValue(
  value: number,
  metadata: ParameterMetadata | undefined
): ValidationResult {
  if (!metadata) {
    // No metadata available - allow any value
    return { valid: true };
  }

  // Bitmask params: validate value is non-negative integer, skip enum check
  if (metadata.bitmask && Object.keys(metadata.bitmask).length > 0) {
    if (value < 0 || !Number.isInteger(value)) {
      return {
        valid: false,
        error: 'Bitmask value must be a non-negative integer',
      };
    }
    return { valid: true };
  }

  // Check if value is in allowed values list (enum-like params)
  if (metadata.values && Object.keys(metadata.values).length > 0) {
    const allowedValues = Object.keys(metadata.values).map(Number);
    if (!allowedValues.includes(value)) {
      const options = Object.entries(metadata.values)
        .map(([k, v]) => `${k}=${v}`)
        .join(', ');
      return {
        valid: false,
        error: `Value must be one of: ${options}`,
      };
    }
    return { valid: true };
  }

  // Check range bounds
  if (metadata.range) {
    const { min, max } = metadata.range;
    if (value < min || value > max) {
      return {
        valid: false,
        error: `Value must be between ${min} and ${max}${metadata.units ? ` ${metadata.units}` : ''}`,
      };
    }
  }

  // Check increment (warn but don't block)
  if (metadata.increment && metadata.increment > 0) {
    const remainder = Math.abs(value % metadata.increment);
    if (remainder > 0.0001 && Math.abs(remainder - metadata.increment) > 0.0001) {
      return {
        valid: true,
        warning: `Value should be a multiple of ${metadata.increment}`,
      };
    }
  }

  return { valid: true };
}

// Map MAVLink MAV_TYPE to our VehicleType
export function mavTypeToVehicleType(mavType: number): VehicleType | null {
  // MAV_TYPE values from MAVLink
  switch (mavType) {
    case 1: // MAV_TYPE_FIXED_WING
    case 7: // MAV_TYPE_AIRSHIP
    case 8: // MAV_TYPE_FREE_BALLOON
    case 16: // MAV_TYPE_FLAPPING_WING
    case 17: // MAV_TYPE_KITE
    case 19: // MAV_TYPE_VTOL_DUOROTOR
    case 20: // MAV_TYPE_VTOL_QUADROTOR
    case 21: // MAV_TYPE_VTOL_TILTROTOR
    case 22: // MAV_TYPE_VTOL_FIXEDROTOR
    case 23: // MAV_TYPE_VTOL_TAILSITTER
    case 24: // MAV_TYPE_VTOL_TILTWING
    case 25: // MAV_TYPE_VTOL_RESERVED5
    case 28: // MAV_TYPE_PARAFOIL
      return 'plane';
    case 2: // MAV_TYPE_QUADROTOR
    case 3: // MAV_TYPE_COAXIAL
    case 4: // MAV_TYPE_HELICOPTER
    case 13: // MAV_TYPE_HEXAROTOR
    case 14: // MAV_TYPE_OCTOROTOR
    case 15: // MAV_TYPE_TRICOPTER
    case 29: // MAV_TYPE_DODECAROTOR
    case 35: // MAV_TYPE_DECAROTOR
      return 'copter';
    case 10: // MAV_TYPE_GROUND_ROVER
    case 11: // MAV_TYPE_SURFACE_BOAT
      return 'rover';
    case 12: // MAV_TYPE_SUBMARINE
      return 'sub';
    case 5: // MAV_TYPE_ANTENNA_TRACKER
      return 'tracker';
    default:
      // Default to copter for unknown types (most comprehensive param set)
      return 'copter';
  }
}
