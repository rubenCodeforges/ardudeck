/**
 * Axes that will be autotuned by MAV_CMD_DO_AUTOTUNE_ENABLE.
 *         Note that at least one flag must be set in MAV_CMD_DO_AUTOTUNE_ENABLE.param2: if none are set, the flight stack will tune its default set of axes.
 * @bitmask
 */
export enum AutotuneAxis {
  /** Autotune roll axis. */
  AUTOTUNE_AXIS_ROLL = 1,
  /** Autotune pitch axis. */
  AUTOTUNE_AXIS_PITCH = 2,
  /** Autotune yaw axis. */
  AUTOTUNE_AXIS_YAW = 4,
}

/** @deprecated Use AutotuneAxis instead */
export const AUTOTUNE_AXIS = AutotuneAxis;