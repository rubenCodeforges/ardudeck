export enum GimbalAxisCalibrationRequired {
  /** Whether or not this axis requires calibration is unknown at this time. */
  GIMBAL_AXIS_CALIBRATION_REQUIRED_UNKNOWN = 0,
  /** This axis requires calibration. */
  GIMBAL_AXIS_CALIBRATION_REQUIRED_TRUE = 1,
  /** This axis does not require calibration. */
  GIMBAL_AXIS_CALIBRATION_REQUIRED_FALSE = 2,
}

/** @deprecated Use GimbalAxisCalibrationRequired instead */
export const GIMBAL_AXIS_CALIBRATION_REQUIRED = GimbalAxisCalibrationRequired;