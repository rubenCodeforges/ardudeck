export enum GimbalAxisCalibrationStatus {
  /** Axis calibration is in progress. */
  GIMBAL_AXIS_CALIBRATION_STATUS_IN_PROGRESS = 0,
  /** Axis calibration succeeded. */
  GIMBAL_AXIS_CALIBRATION_STATUS_SUCCEEDED = 1,
  /** Axis calibration failed. */
  GIMBAL_AXIS_CALIBRATION_STATUS_FAILED = 2,
}

/** @deprecated Use GimbalAxisCalibrationStatus instead */
export const GIMBAL_AXIS_CALIBRATION_STATUS = GimbalAxisCalibrationStatus;