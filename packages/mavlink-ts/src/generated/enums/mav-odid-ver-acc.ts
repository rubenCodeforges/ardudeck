export enum MavOdidVerAcc {
  /** The vertical accuracy is unknown. */
  MAV_ODID_VER_ACC_UNKNOWN = 0,
  /** The vertical accuracy is smaller than 150 meter. */
  MAV_ODID_VER_ACC_150_METER = 1,
  /** The vertical accuracy is smaller than 45 meter. */
  MAV_ODID_VER_ACC_45_METER = 2,
  /** The vertical accuracy is smaller than 25 meter. */
  MAV_ODID_VER_ACC_25_METER = 3,
  /** The vertical accuracy is smaller than 10 meter. */
  MAV_ODID_VER_ACC_10_METER = 4,
  /** The vertical accuracy is smaller than 3 meter. */
  MAV_ODID_VER_ACC_3_METER = 5,
  /** The vertical accuracy is smaller than 1 meter. */
  MAV_ODID_VER_ACC_1_METER = 6,
}

/** @deprecated Use MavOdidVerAcc instead */
export const MAV_ODID_VER_ACC = MavOdidVerAcc;