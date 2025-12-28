/**
 * Enumeration of estimator types
 */
export enum MavEstimatorType {
  /** Unknown type of the estimator. */
  MAV_ESTIMATOR_TYPE_UNKNOWN = 0,
  /** This is a naive estimator without any real covariance feedback. */
  MAV_ESTIMATOR_TYPE_NAIVE = 1,
  /** Computer vision based estimate. Might be up to scale. */
  MAV_ESTIMATOR_TYPE_VISION = 2,
  /** Visual-inertial estimate. */
  MAV_ESTIMATOR_TYPE_VIO = 3,
  /** Plain GPS estimate. */
  MAV_ESTIMATOR_TYPE_GPS = 4,
  /** Estimator integrating GPS and inertial sensing. */
  MAV_ESTIMATOR_TYPE_GPS_INS = 5,
  /** Estimate from external motion capturing system. */
  MAV_ESTIMATOR_TYPE_MOCAP = 6,
  /** Estimator based on lidar sensor input. */
  MAV_ESTIMATOR_TYPE_LIDAR = 7,
  /** Estimator on autopilot. */
  MAV_ESTIMATOR_TYPE_AUTOPILOT = 8,
}

/** @deprecated Use MavEstimatorType instead */
export const MAV_ESTIMATOR_TYPE = MavEstimatorType;