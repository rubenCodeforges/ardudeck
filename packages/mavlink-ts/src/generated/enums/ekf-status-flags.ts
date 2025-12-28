/**
 * Flags in EKF_STATUS message.
 * @bitmask
 */
export enum EkfStatusFlags {
  /** Set if EKF's attitude estimate is good. */
  EKF_ATTITUDE = 1,
  /** Set if EKF's horizontal velocity estimate is good. */
  EKF_VELOCITY_HORIZ = 2,
  /** Set if EKF's vertical velocity estimate is good. */
  EKF_VELOCITY_VERT = 4,
  /** Set if EKF's horizontal position (relative) estimate is good. */
  EKF_POS_HORIZ_REL = 8,
  /** Set if EKF's horizontal position (absolute) estimate is good. */
  EKF_POS_HORIZ_ABS = 16,
  /** Set if EKF's vertical position (absolute) estimate is good. */
  EKF_POS_VERT_ABS = 32,
  /** Set if EKF's vertical position (above ground) estimate is good. */
  EKF_POS_VERT_AGL = 64,
  /** EKF is in constant position mode and does not know it's absolute or relative position. */
  EKF_CONST_POS_MODE = 128,
  /** Set if EKF's predicted horizontal position (relative) estimate is good. */
  EKF_PRED_POS_HORIZ_REL = 256,
  /** Set if EKF's predicted horizontal position (absolute) estimate is good. */
  EKF_PRED_POS_HORIZ_ABS = 512,
  /** Set if EKF believes the GPS input data is faulty. */
  EKF_GPS_GLITCHING = 32768,
  /** Set if EKF has never been healthy. */
  EKF_UNINITIALIZED = 1024,
}

/** @deprecated Use EkfStatusFlags instead */
export const EKF_STATUS_FLAGS = EkfStatusFlags;