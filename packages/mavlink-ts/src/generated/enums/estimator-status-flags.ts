/**
 * Flags in ESTIMATOR_STATUS message
 * @bitmask
 */
export enum EstimatorStatusFlags {
  /** True if the attitude estimate is good */
  ESTIMATOR_ATTITUDE = 1,
  /** True if the horizontal velocity estimate is good */
  ESTIMATOR_VELOCITY_HORIZ = 2,
  /** True if the  vertical velocity estimate is good */
  ESTIMATOR_VELOCITY_VERT = 4,
  /** True if the horizontal position (relative) estimate is good */
  ESTIMATOR_POS_HORIZ_REL = 8,
  /** True if the horizontal position (absolute) estimate is good */
  ESTIMATOR_POS_HORIZ_ABS = 16,
  /** True if the vertical position (absolute) estimate is good */
  ESTIMATOR_POS_VERT_ABS = 32,
  /** True if the vertical position (above ground) estimate is good */
  ESTIMATOR_POS_VERT_AGL = 64,
  /** True if the EKF is in a constant position mode and is not using external measurements (eg GPS or optical flow) */
  ESTIMATOR_CONST_POS_MODE = 128,
  /** True if the EKF has sufficient data to enter a mode that will provide a (relative) position estimate */
  ESTIMATOR_PRED_POS_HORIZ_REL = 256,
  /** True if the EKF has sufficient data to enter a mode that will provide a (absolute) position estimate */
  ESTIMATOR_PRED_POS_HORIZ_ABS = 512,
  /** True if the EKF has detected a GPS glitch */
  ESTIMATOR_GPS_GLITCH = 1024,
  /** True if the EKF has detected bad accelerometer data */
  ESTIMATOR_ACCEL_ERROR = 2048,
}

/** @deprecated Use EstimatorStatusFlags instead */
export const ESTIMATOR_STATUS_FLAGS = EstimatorStatusFlags;