/**
 * A mapping of copter flight modes for custom_mode field of heartbeat.
 */
export enum CopterMode {
  /** STABILIZE */
  COPTER_MODE_STABILIZE = 0,
  /** ACRO */
  COPTER_MODE_ACRO = 1,
  /** ALT HOLD */
  COPTER_MODE_ALT_HOLD = 2,
  /** AUTO */
  COPTER_MODE_AUTO = 3,
  /** GUIDED */
  COPTER_MODE_GUIDED = 4,
  /** LOITER */
  COPTER_MODE_LOITER = 5,
  /** RTL */
  COPTER_MODE_RTL = 6,
  /** CIRCLE */
  COPTER_MODE_CIRCLE = 7,
  /** LAND */
  COPTER_MODE_LAND = 9,
  /** DRIFT */
  COPTER_MODE_DRIFT = 11,
  /** SPORT */
  COPTER_MODE_SPORT = 13,
  /** FLIP */
  COPTER_MODE_FLIP = 14,
  /** AUTOTUNE */
  COPTER_MODE_AUTOTUNE = 15,
  /** POSHOLD */
  COPTER_MODE_POSHOLD = 16,
  /** BRAKE */
  COPTER_MODE_BRAKE = 17,
  /** THROW */
  COPTER_MODE_THROW = 18,
  /** AVOID ADSB */
  COPTER_MODE_AVOID_ADSB = 19,
  /** GUIDED NOGPS */
  COPTER_MODE_GUIDED_NOGPS = 20,
  /** SMARTRTL */
  COPTER_MODE_SMART_RTL = 21,
  /** FLOWHOLD */
  COPTER_MODE_FLOWHOLD = 22,
  /** FOLLOW */
  COPTER_MODE_FOLLOW = 23,
  /** ZIGZAG */
  COPTER_MODE_ZIGZAG = 24,
  /** SYSTEMID */
  COPTER_MODE_SYSTEMID = 25,
  /** AUTOROTATE */
  COPTER_MODE_AUTOROTATE = 26,
  /** AUTO RTL */
  COPTER_MODE_AUTO_RTL = 27,
  /** TURTLE */
  COPTER_MODE_TURTLE = 28,
  /** RATE_ACRO */
  COPTER_MODE_RATE_ACRO = 29,
}

/** @deprecated Use CopterMode instead */
export const COPTER_MODE = CopterMode;