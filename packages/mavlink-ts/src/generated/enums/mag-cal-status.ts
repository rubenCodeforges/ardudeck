export enum MagCalStatus {
  MAG_CAL_NOT_STARTED = 0,
  MAG_CAL_WAITING_TO_START = 1,
  MAG_CAL_RUNNING_STEP_ONE = 2,
  MAG_CAL_RUNNING_STEP_TWO = 3,
  MAG_CAL_SUCCESS = 4,
  MAG_CAL_FAILED = 5,
  MAG_CAL_BAD_ORIENTATION = 6,
  MAG_CAL_BAD_RADIUS = 7,
}

/** @deprecated Use MagCalStatus instead */
export const MAG_CAL_STATUS = MagCalStatus;