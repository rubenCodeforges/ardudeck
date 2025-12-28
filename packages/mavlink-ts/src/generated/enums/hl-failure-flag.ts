/**
 * Flags to report failure cases over the high latency telemetry.
 * @bitmask
 */
export enum HlFailureFlag {
  /** GPS failure. */
  HL_FAILURE_FLAG_GPS = 1,
  /** Differential pressure sensor failure. */
  HL_FAILURE_FLAG_DIFFERENTIAL_PRESSURE = 2,
  /** Absolute pressure sensor failure. */
  HL_FAILURE_FLAG_ABSOLUTE_PRESSURE = 4,
  /** Accelerometer sensor failure. */
  HL_FAILURE_FLAG_3D_ACCEL = 8,
  /** Gyroscope sensor failure. */
  HL_FAILURE_FLAG_3D_GYRO = 16,
  /** Magnetometer sensor failure. */
  HL_FAILURE_FLAG_3D_MAG = 32,
  /** Terrain subsystem failure. */
  HL_FAILURE_FLAG_TERRAIN = 64,
  /** Battery failure/critical low battery. */
  HL_FAILURE_FLAG_BATTERY = 128,
  /** RC receiver failure/no RC connection. */
  HL_FAILURE_FLAG_RC_RECEIVER = 256,
  /** Offboard link failure. */
  HL_FAILURE_FLAG_OFFBOARD_LINK = 512,
  /** Engine failure. */
  HL_FAILURE_FLAG_ENGINE = 1024,
  /** Geofence violation. */
  HL_FAILURE_FLAG_GEOFENCE = 2048,
  /** Estimator failure, for example measurement rejection or large variances. */
  HL_FAILURE_FLAG_ESTIMATOR = 4096,
  /** Mission failure. */
  HL_FAILURE_FLAG_MISSION = 8192,
}

/** @deprecated Use HlFailureFlag instead */
export const HL_FAILURE_FLAG = HlFailureFlag;