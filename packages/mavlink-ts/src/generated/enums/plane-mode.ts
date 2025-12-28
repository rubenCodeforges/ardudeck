/**
 * A mapping of plane flight modes for custom_mode field of heartbeat.
 */
export enum PlaneMode {
  /** MANUAL */
  PLANE_MODE_MANUAL = 0,
  /** CIRCLE */
  PLANE_MODE_CIRCLE = 1,
  /** STABILIZE */
  PLANE_MODE_STABILIZE = 2,
  /** TRAINING */
  PLANE_MODE_TRAINING = 3,
  /** ACRO */
  PLANE_MODE_ACRO = 4,
  /** FBWA */
  PLANE_MODE_FLY_BY_WIRE_A = 5,
  /** FBWB */
  PLANE_MODE_FLY_BY_WIRE_B = 6,
  /** CRUISE */
  PLANE_MODE_CRUISE = 7,
  /** AUTOTUNE */
  PLANE_MODE_AUTOTUNE = 8,
  /** AUTO */
  PLANE_MODE_AUTO = 10,
  /** RTL */
  PLANE_MODE_RTL = 11,
  /** LOITER */
  PLANE_MODE_LOITER = 12,
  /** TAKEOFF */
  PLANE_MODE_TAKEOFF = 13,
  /** AVOID ADSB */
  PLANE_MODE_AVOID_ADSB = 14,
  /** GUIDED */
  PLANE_MODE_GUIDED = 15,
  /** INITIALISING */
  PLANE_MODE_INITIALIZING = 16,
  /** QSTABILIZE */
  PLANE_MODE_QSTABILIZE = 17,
  /** QHOVER */
  PLANE_MODE_QHOVER = 18,
  /** QLOITER */
  PLANE_MODE_QLOITER = 19,
  /** QLAND */
  PLANE_MODE_QLAND = 20,
  /** QRTL */
  PLANE_MODE_QRTL = 21,
  /** QAUTOTUNE */
  PLANE_MODE_QAUTOTUNE = 22,
  /** QACRO */
  PLANE_MODE_QACRO = 23,
  /** THERMAL */
  PLANE_MODE_THERMAL = 24,
  /** LOITER2QLAND */
  PLANE_MODE_LOITER_ALT_QLAND = 25,
  /** AUTOLAND */
  PLANE_MODE_AUTOLAND = 26,
}

/** @deprecated Use PlaneMode instead */
export const PLANE_MODE = PlaneMode;