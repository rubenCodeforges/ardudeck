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
  variants: ('INAV' | 'BTFL' | 'ARDU')[]; // FC variants that support this
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
    icon: '📐',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU'],
    estimatedDuration: 5,
  },
  {
    id: 'accel-6point',
    name: 'Accelerometer (6-Point)',
    description: 'Full 6-position calibration for maximum accuracy. iNav and ArduPilot only.',
    icon: '🎯',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'ARDU'],
    estimatedDuration: 60,
  },
  {
    id: 'compass',
    name: 'Compass / Magnetometer',
    description: 'Rotate your vehicle in all directions to calibrate the compass.',
    icon: '🧭',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU'],
    requiresSensor: 'hasCompass',
    estimatedDuration: 30,
  },
  {
    id: 'gyro',
    name: 'Gyroscope',
    description: 'Quick gyro calibration. Keep your vehicle completely still.',
    icon: '🔄',
    protocols: ['msp', 'mavlink'],
    variants: ['INAV', 'BTFL', 'ARDU'],
    estimatedDuration: 3,
  },
  {
    id: 'opflow',
    name: 'Optical Flow',
    description: 'Calibrate optical flow sensor. iNav only.',
    icon: '👁️',
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
export const ACCEL_6POINT_POSITIONS = [
  'Level (Top Up)',
  'Inverted (Top Down)',
  'Left Side Down',
  'Right Side Down',
  'Nose Down',
  'Nose Up',
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
}

export interface CalibrationResult {
  success: boolean;
  error?: string;
  data?: CalibrationData;
}
