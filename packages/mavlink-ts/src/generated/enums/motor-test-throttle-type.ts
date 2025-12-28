/**
 * Defines how throttle value is represented in MAV_CMD_DO_MOTOR_TEST.
 */
export enum MotorTestThrottleType {
  /** Throttle as a percentage (0 ~ 100) */
  MOTOR_TEST_THROTTLE_PERCENT = 0,
  /** Throttle as an absolute PWM value (normally in range of 1000~2000). */
  MOTOR_TEST_THROTTLE_PWM = 1,
  /** Throttle pass-through from pilot's transmitter. */
  MOTOR_TEST_THROTTLE_PILOT = 2,
  /** Per-motor compass calibration test. */
  MOTOR_TEST_COMPASS_CAL = 3,
}

/** @deprecated Use MotorTestThrottleType instead */
export const MOTOR_TEST_THROTTLE_TYPE = MotorTestThrottleType;