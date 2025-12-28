export enum MavOdidSpeedAcc {
  /** The speed accuracy is unknown. */
  MAV_ODID_SPEED_ACC_UNKNOWN = 0,
  /** The speed accuracy is smaller than 10 meters per second. */
  MAV_ODID_SPEED_ACC_10_METERS_PER_SECOND = 1,
  /** The speed accuracy is smaller than 3 meters per second. */
  MAV_ODID_SPEED_ACC_3_METERS_PER_SECOND = 2,
  /** The speed accuracy is smaller than 1 meters per second. */
  MAV_ODID_SPEED_ACC_1_METERS_PER_SECOND = 3,
  /** The speed accuracy is smaller than 0.3 meters per second. */
  MAV_ODID_SPEED_ACC_0_3_METERS_PER_SECOND = 4,
}

/** @deprecated Use MavOdidSpeedAcc instead */
export const MAV_ODID_SPEED_ACC = MavOdidSpeedAcc;