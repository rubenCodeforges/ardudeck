/**
 * A mapping of rover flight modes for custom_mode field of heartbeat.
 */
export enum RoverMode {
  /** MANUAL */
  ROVER_MODE_MANUAL = 0,
  /** ACRO */
  ROVER_MODE_ACRO = 1,
  /** STEERING */
  ROVER_MODE_STEERING = 3,
  /** HOLD */
  ROVER_MODE_HOLD = 4,
  /** LOITER */
  ROVER_MODE_LOITER = 5,
  /** FOLLOW */
  ROVER_MODE_FOLLOW = 6,
  /** SIMPLE */
  ROVER_MODE_SIMPLE = 7,
  /** DOCK */
  ROVER_MODE_DOCK = 8,
  /** CIRCLE */
  ROVER_MODE_CIRCLE = 9,
  /** AUTO */
  ROVER_MODE_AUTO = 10,
  /** RTL */
  ROVER_MODE_RTL = 11,
  /** SMART RTL */
  ROVER_MODE_SMART_RTL = 12,
  /** GUIDED */
  ROVER_MODE_GUIDED = 15,
  /** INITIALISING */
  ROVER_MODE_INITIALIZING = 16,
}

/** @deprecated Use RoverMode instead */
export const ROVER_MODE = RoverMode;