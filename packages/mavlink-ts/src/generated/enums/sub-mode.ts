/**
 * A mapping of sub flight modes for custom_mode field of heartbeat.
 */
export enum SubMode {
  /** STABILIZE */
  SUB_MODE_STABILIZE = 0,
  /** ACRO */
  SUB_MODE_ACRO = 1,
  /** ALT HOLD */
  SUB_MODE_ALT_HOLD = 2,
  /** AUTO */
  SUB_MODE_AUTO = 3,
  /** GUIDED */
  SUB_MODE_GUIDED = 4,
  /** CIRCLE */
  SUB_MODE_CIRCLE = 7,
  /** SURFACE */
  SUB_MODE_SURFACE = 9,
  /** POSHOLD */
  SUB_MODE_POSHOLD = 16,
  /** MANUAL */
  SUB_MODE_MANUAL = 19,
  /** MOTORDETECT */
  SUB_MODE_MOTORDETECT = 20,
  /** SURFTRAK */
  SUB_MODE_SURFTRAK = 21,
}

/** @deprecated Use SubMode instead */
export const SUB_MODE = SubMode;