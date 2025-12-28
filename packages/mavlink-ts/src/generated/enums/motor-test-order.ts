/**
 * Sequence that motors are tested when using MAV_CMD_DO_MOTOR_TEST.
 */
export enum MotorTestOrder {
  /** Default autopilot motor test method. */
  MOTOR_TEST_ORDER_DEFAULT = 0,
  /** Motor numbers are specified as their index in a predefined vehicle-specific sequence. */
  MOTOR_TEST_ORDER_SEQUENCE = 1,
  /** Motor numbers are specified as the output as labeled on the board. */
  MOTOR_TEST_ORDER_BOARD = 2,
}

/** @deprecated Use MotorTestOrder instead */
export const MOTOR_TEST_ORDER = MotorTestOrder;