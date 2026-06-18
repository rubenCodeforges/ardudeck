/**
 * Calibration Types
 *
 * Shared types for the calibration system supporting MSP (iNav/Betaflight)
 * and MAVLink (ArduPilot) protocols.
 */

// ============================================================================
// Calibration Types
// ============================================================================

export type CalibrationTypeId =
  | 'accel-level'    // Simple level calibration
  | 'accel-6point'   // Full 6-position calibration
  | 'compass'        // Magnetometer calibration
  | 'gyro'           // Gyroscope calibration
  | 'opflow';        // Optical flow calibration (iNav only)

export type CalibrationProtocol = 'msp' | 'mavlink';

export interface CalibrationTypeInfo {
  id: CalibrationTypeId;
  name: string;
  description: string;
  icon: string;
  protocols: CalibrationProtocol[];
  variants: ('INAV' | 'BTFL' | 'ARDU' | 'PX4')[]; // FC variants that support this
  requiresSensor?: string; // Sensor that must be present
  estimatedDuration: number; // Seconds
}

/**
 * Calibration type definitions with protocol support info
 */
export const CALIBRATION_TYPES: CalibrationTypeInfo[] = [
  {
    id: 'accel-level',
    name: 'Accelerometer (Level)',
    description: 'Quick 1-position level calibration. Place your vehicle on a flat surface.',
    icon: 'level',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    estimatedDuration: 5,
  },
  {
    id: 'accel-6point',
    name: 'Accelerometer (6-Point)',
    description: 'Full 6-position calibration for maximum accuracy. iNav and ArduPilot only.',
    icon: '6point',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'ARDU'],
    estimatedDuration: 60,
  },
  {
    id: 'compass',
    name: 'Compass / Magnetometer',
    description: 'Rotate your vehicle in all directions to calibrate the compass.',
    icon: 'compass',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    requiresSensor: 'hasCompass',
    estimatedDuration: 30,
  },
  {
    id: 'gyro',
    name: 'Gyroscope',
    description: 'Quick gyro calibration. Keep your vehicle completely still.',
    icon: 'gyro',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    estimatedDuration: 3,
  },
  {
    id: 'opflow',
    name: 'Optical Flow',
    description: 'Calibrate optical flow sensor. iNav only.',
    icon: 'opflow',
    protocols: ['msp'],
    variants: ['INAV'],
    requiresSensor: 'hasOpflow',
    estimatedDuration: 30,
  },
];

// ============================================================================
// Sensor Availability
// ============================================================================

export interface SensorAvailability {
  hasAccel: boolean;
  hasGyro: boolean;
  hasCompass: boolean;
  hasBarometer: boolean;
  hasGps: boolean;
  hasOpflow: boolean;
  hasPitot: boolean;
}

// ============================================================================
// Calibration State
// ============================================================================

export type CalibrationStep =
  | 'select'      // Select calibration type
  | 'prepare'     // Instructions before starting
  | 'calibrating' // Active calibration
  | 'complete';   // Calibration finished

/**
 * 6-point calibration position names
 */
// Order matches ArduPilot's ACCELCAL_VEHICLE_POS enum so the position number
// shown to the user lines up with the order AP actually requests them.
export const ACCEL_6POINT_POSITIONS = [
  'Level (Top Up)',
  'Left Side Down',
  'Right Side Down',
  'Nose Down',
  'Nose Up',
  'Inverted (Top Down)',
] as const;

export type AccelPosition = 0 | 1 | 2 | 3 | 4 | 5;

// ============================================================================
// Calibration Data
// ============================================================================

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CalibrationData {
  // Accelerometer
  accZero?: Vector3;
  accGain?: Vector3;

  // Magnetometer
  magZero?: Vector3;
  magGain?: Vector3;
  compassFitness?: number; // MAVLink only (0-1, lower is better)

  // Optical flow
  opflowScale?: number;
}

// ============================================================================
// MSP Calibration Data (from MSP_CALIBRATION_DATA - code 14)
// ============================================================================

export interface MspCalibrationData {
  // Position bitmask for 6-point accel (bits 0-5 = positions 0-5)
  positionBitmask: number;

  // Accelerometer calibration
  accZero: Vector3; // int16 x3
  accGain: Vector3; // int16 x3

  // Magnetometer calibration
  magZero: Vector3; // int16 x3
  magGain: Vector3; // int16 x3

  // Optical flow (iNav)
  opflowScale: number; // int16 / 256 -> float
}

// ============================================================================
// Calibration Progress Events
// ============================================================================

export interface CalibrationProgressEvent {
  /** Calibration type being performed */
  type: CalibrationTypeId;

  /** Overall progress 0-100 */
  progress: number;

  /** Current position for 6-point calibration (0-5) */
  currentPosition?: AccelPosition;

  /** Status of each position for 6-point [done, done, pending, ...] */
  positionStatus?: boolean[];

  /** Countdown timer (seconds remaining) for timed calibrations */
  countdown?: number;

  /** Human-readable status text */
  statusText: string;

  /** For MAVLink multi-compass: progress per compass */
  compassProgress?: number[];
}

export interface CalibrationCompleteEvent {
  /** Calibration type completed */
  type: CalibrationTypeId;

  /** Whether calibration succeeded */
  success: boolean;

  /** Error message if failed */
  error?: string;

  /** Calibration results if successful */
  data?: CalibrationData;
}

// ============================================================================
// IPC Types
// ============================================================================

export interface CalibrationStartOptions {
  type: CalibrationTypeId;
  /** For 6-point: which position to calibrate (0-5) */
  position?: AccelPosition;
  /** Protocol to use — determines MSP vs MAVLink calibration path */
  protocol?: CalibrationProtocol;
}

export interface CalibrationResult {
  success: boolean;
  error?: string;
  data?: CalibrationData;
}

// ============================================================================
// Post-Calibration Verification (MAVLink / ArduPilot only)
// ============================================================================

/**
 * ArduPilot parameters that should change after each calibration type.
 * Snapshot before, re-read after, diff to verify the FC actually wrote
 * something. The "secondary" entries (INS_ACC2*, INS_GYR3*, COMPASS_OFS3*)
 * may not exist on boards with fewer IMUs/compasses — those are silently
 * ignored during diff.
 */
export const MAVLINK_CALIBRATION_PARAMS: Partial<Record<CalibrationTypeId, readonly string[]>> = {
  'accel-level': [
    'AHRS_TRIM_X',
    'AHRS_TRIM_Y',
    'AHRS_TRIM_Z',
  ],
  'accel-6point': [
    'INS_ACCOFFS_X', 'INS_ACCOFFS_Y', 'INS_ACCOFFS_Z',
    'INS_ACCSCAL_X', 'INS_ACCSCAL_Y', 'INS_ACCSCAL_Z',
    'INS_ACC2OFFS_X', 'INS_ACC2OFFS_Y', 'INS_ACC2OFFS_Z',
    'INS_ACC2SCAL_X', 'INS_ACC2SCAL_Y', 'INS_ACC2SCAL_Z',
    'INS_ACC3OFFS_X', 'INS_ACC3OFFS_Y', 'INS_ACC3OFFS_Z',
    'INS_ACC3SCAL_X', 'INS_ACC3SCAL_Y', 'INS_ACC3SCAL_Z',
  ],
  'gyro': [
    'INS_GYROFFS_X', 'INS_GYROFFS_Y', 'INS_GYROFFS_Z',
    'INS_GYR2OFFS_X', 'INS_GYR2OFFS_Y', 'INS_GYR2OFFS_Z',
    'INS_GYR3OFFS_X', 'INS_GYR3OFFS_Y', 'INS_GYR3OFFS_Z',
  ],
  'compass': [
    'COMPASS_OFS_X', 'COMPASS_OFS_Y', 'COMPASS_OFS_Z',
    'COMPASS_OFS2_X', 'COMPASS_OFS2_Y', 'COMPASS_OFS2_Z',
    'COMPASS_OFS3_X', 'COMPASS_OFS3_Y', 'COMPASS_OFS3_Z',
  ],
} as const;

/**
 * Per-cal-type epsilon for "did this value actually move". A real cal
 * always produces changes well above these thresholds; anything smaller
 * is rounding noise. Compass uses milligauss-scale offsets so its epsilon
 * is much larger than the angular/accel ones.
 */
export const CALIBRATION_DIFF_EPSILON: Record<CalibrationTypeId, number> = {
  'accel-level': 1e-4,   // radians (trim is typically 0.001 - 0.1 rad)
  'accel-6point': 1e-4,  // m/s² for offsets, dimensionless ~1.0 for scale
  'gyro': 1e-5,          // rad/s
  'compass': 1.0,        // mGauss
  'opflow': 0,           // not applicable (MSP only)
};

export interface ParamReadResult {
  paramId: string;
  before: number | null;
  after: number | null;
  changed: boolean;
}

export type CalibrationVerificationStatus =
  | 'idle'        // No verification attempted yet
  | 'pending'     // Re-fetch in flight
  | 'verified'    // At least one tracked param moved
  | 'unchanged'   // All present params identical to snapshot — likely silent failure
  | 'skipped'     // Cal type doesn't support verification (MSP, opflow, etc.)
  | 'error';      // Re-fetch failed (timeout, disconnect, no params returned)

export interface CalibrationVerification {
  status: CalibrationVerificationStatus;
  results: ParamReadResult[]; // Only params that exist on this FC
  error?: string;
}
