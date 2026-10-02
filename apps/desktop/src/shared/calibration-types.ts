/**
 * Calibration Types
 *
 * Shared types for the calibration system supporting MSP (iNav/Betaflight)
 * and MAVLink (ArduPilot) protocols.
 */

import { t } from './i18n/index.js';

// ============================================================================
// Calibration Types
// ============================================================================

export type CalibrationTypeId =
  | 'accel-level'    // Level trim only (AHRS_TRIM_*)
  | 'accel-quick'    // One position, writes the offsets the arming check reads
  | 'accel-6point'   // Full 6-position calibration
  | 'compass'        // Magnetometer calibration
  | 'gyro'           // Gyroscope calibration
  | 'opflow';        // Optical flow calibration (iNav only)

export type CalibrationProtocol = 'msp' | 'mavlink';

/**
 * Which MAVLink firmware dialect to speak. The two differ fundamentally:
 * ArduPilot compass cal is DO_START_MAG_CAL + MAG_CAL_PROGRESS/REPORT and its
 * 6-point flow is GCS-confirmed via ACCELCAL_VEHICLE_POS; PX4 does everything
 * through PREFLIGHT_CALIBRATION and narrates via "[cal] ..." STATUSTEXT with
 * automatic orientation detection (no confirm step).
 */
export type CalibrationFirmware = 'ardupilot' | 'px4';

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
    name: 'Accelerometer (Level)', // i18n-exempt
    description: 'Quick 1-position level calibration. Place your vehicle on a flat surface.', // i18n-exempt
    icon: 'level',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    estimatedDuration: 5,
  },
  {
    id: 'accel-quick',
    name: 'Accelerometer (Quick)', // i18n-exempt
    description: 'One position, vehicle level and still. Writes the offsets ArduPilot wants before it will arm, without turning the vehicle over.', // i18n-exempt
    icon: 'level',
    protocols: ['mavlink'],
    variants: ['ARDU'],
    estimatedDuration: 15,
  },
  {
    id: 'accel-6point',
    name: 'Accelerometer (6-Point)', // i18n-exempt
    description: 'Full 6-position calibration for maximum accuracy.', // i18n-exempt
    icon: '6point',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'ARDU', 'PX4'],
    estimatedDuration: 60,
  },
  {
    id: 'compass',
    name: 'Compass / Magnetometer', // i18n-exempt
    description: 'Rotate your vehicle in all directions to calibrate the compass.', // i18n-exempt
    icon: 'compass',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    requiresSensor: 'hasCompass',
    estimatedDuration: 30,
  },
  {
    id: 'gyro',
    name: 'Gyroscope', // i18n-exempt
    description: 'Quick gyro calibration. Keep your vehicle completely still.', // i18n-exempt
    icon: 'gyro',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU', 'PX4'],
    estimatedDuration: 3,
  },
  {
    id: 'opflow',
    name: 'Optical Flow', // i18n-exempt
    description: 'Calibrate optical flow sensor. iNav only.', // i18n-exempt
    icon: 'opflow',
    protocols: ['msp'],
    variants: ['INAV'],
    requiresSensor: 'hasOpflow',
    estimatedDuration: 30,
  },
];

const CALIBRATION_TYPE_KEYS: Record<CalibrationTypeId, string> = {
  'accel-level': 'accelLevel',
  'accel-quick': 'accelQuick',
  'accel-6point': 'accel6point',
  compass: 'compass',
  gyro: 'gyro',
  opflow: 'opflow',
};

export function calibrationTypeName(info: Pick<CalibrationTypeInfo, 'id'>): string {
  return t(`shared:calibrationTypes.${CALIBRATION_TYPE_KEYS[info.id]}.name`);
}

export function calibrationTypeDescription(info: Pick<CalibrationTypeInfo, 'id'>): string {
  return t(`shared:calibrationTypes.${CALIBRATION_TYPE_KEYS[info.id]}.description`);
}

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
  'Level (Top Up)', // i18n-exempt
  'Left Side Down', // i18n-exempt
  'Right Side Down', // i18n-exempt
  'Nose Down', // i18n-exempt
  'Nose Up', // i18n-exempt
  'Inverted (Top Down)', // i18n-exempt
] as const;

export type AccelPosition = 0 | 1 | 2 | 3 | 4 | 5;

const ACCEL_POSITION_KEYS = ['level', 'leftSide', 'rightSide', 'noseDown', 'noseUp', 'inverted'] as const;

export function accelPositionName(position: number): string {
  const key = ACCEL_POSITION_KEYS[position];
  return key ? t(`shared:calibrationTypes.position.${key}`) : (ACCEL_6POINT_POSITIONS[position] ?? '');
}

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
  /**
   * Per-compass calibration result (ArduPilot). fitness is RMS milligauss
   * residual (< ~2 good, > ~3.5 poor); orientation is the detected rotation
   * enum (null if not reported). Parsed from the "Mag(N) ... orientation: X
   * <fitness>" STATUSTEXT and/or MAG_CAL_REPORT.
   */
  compassResults?: Array<{ compass: number; fitness: number; orientation: number | null }>;

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

  /** FC must be rebooted for the calibration to take effect (compass on ArduPilot) */
  rebootRequired?: boolean;

  /**
   * success=true but the FC never explicitly confirmed it (e.g. the 6-point
   * completion message was lost and a fallback fired). The post-cal param
   * verification is the deciding witness; until it reports, the UI must not
   * present this as a confirmed success.
   */
  unconfirmed?: boolean;
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
  /** MAVLink dialect, ArduPilot and PX4 use different commands and feedback */
  firmware?: CalibrationFirmware;
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
  // Same parameters as the six-point calibration: that is the point of it.
  'accel-quick': [
    'INS_ACCOFFS_X', 'INS_ACCOFFS_Y', 'INS_ACCOFFS_Z',
    'INS_ACCSCAL_X', 'INS_ACCSCAL_Y', 'INS_ACCSCAL_Z',
    'INS_ACC2OFFS_X', 'INS_ACC2OFFS_Y', 'INS_ACC2OFFS_Z',
    'INS_ACC3OFFS_X', 'INS_ACC3OFFS_Y', 'INS_ACC3OFFS_Z',
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
 * PX4 equivalents. PX4 stores calibration in CAL_* params (offsets in SI
 * units: Gauss for mag, m/s² for accel, rad/s for gyro) and level-horizon
 * trim in SENS_BOARD_*_OFF (degrees). Secondary-instance entries may not
 * exist on boards with fewer sensors, ignored during diff, same as the
 * ArduPilot table.
 */
export const PX4_CALIBRATION_PARAMS: Partial<Record<CalibrationTypeId, readonly string[]>> = {
  'accel-level': [
    'SENS_BOARD_X_OFF',
    'SENS_BOARD_Y_OFF',
  ],
  'accel-6point': [
    'CAL_ACC0_XOFF', 'CAL_ACC0_YOFF', 'CAL_ACC0_ZOFF',
    'CAL_ACC0_XSCALE', 'CAL_ACC0_YSCALE', 'CAL_ACC0_ZSCALE',
    'CAL_ACC1_XOFF', 'CAL_ACC1_YOFF', 'CAL_ACC1_ZOFF',
    'CAL_ACC1_XSCALE', 'CAL_ACC1_YSCALE', 'CAL_ACC1_ZSCALE',
    'CAL_ACC2_XOFF', 'CAL_ACC2_YOFF', 'CAL_ACC2_ZOFF',
    'CAL_ACC2_XSCALE', 'CAL_ACC2_YSCALE', 'CAL_ACC2_ZSCALE',
  ],
  'gyro': [
    'CAL_GYRO0_XOFF', 'CAL_GYRO0_YOFF', 'CAL_GYRO0_ZOFF',
    'CAL_GYRO1_XOFF', 'CAL_GYRO1_YOFF', 'CAL_GYRO1_ZOFF',
    'CAL_GYRO2_XOFF', 'CAL_GYRO2_YOFF', 'CAL_GYRO2_ZOFF',
  ],
  'compass': [
    'CAL_MAG0_OFF_X', 'CAL_MAG0_OFF_Y', 'CAL_MAG0_OFF_Z',
    'CAL_MAG1_OFF_X', 'CAL_MAG1_OFF_Y', 'CAL_MAG1_OFF_Z',
    'CAL_MAG2_OFF_X', 'CAL_MAG2_OFF_Y', 'CAL_MAG2_OFF_Z',
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
  'accel-quick': 1e-4,   // same offsets as the six-point calibration
  'accel-6point': 1e-4,  // m/s² for offsets, dimensionless ~1.0 for scale
  'gyro': 1e-5,          // rad/s
  'compass': 1.0,        // mGauss
  'opflow': 0,           // not applicable (MSP only)
};

/**
 * PX4 epsilons. CRITICAL difference from ArduPilot: PX4 mag offsets are in
 * GAUSS (typical real values 0.05-0.5), so reusing the ArduPilot 1.0 mGauss
 * epsilon literal would classify every genuine PX4 compass cal as
 * "unchanged" and fail it. Level trim is in degrees.
 */
export const PX4_CALIBRATION_DIFF_EPSILON: Record<CalibrationTypeId, number> = {
  'accel-level': 1e-3,   // degrees
  'accel-quick': 1e-4,   // ArduPilot only, listed for completeness
  'accel-6point': 1e-4,  // m/s² offsets, dimensionless scale
  'gyro': 1e-6,          // rad/s (PX4 gyro offsets are tiny but real)
  'compass': 1e-3,       // Gauss
  'opflow': 0,           // not applicable
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
