export enum MavOdidTimeAcc {
  /** The timestamp accuracy is unknown. */
  MAV_ODID_TIME_ACC_UNKNOWN = 0,
  /** The timestamp accuracy is smaller than or equal to 0.1 second. */
  MAV_ODID_TIME_ACC_0_1_SECOND = 1,
  /** The timestamp accuracy is smaller than or equal to 0.2 second. */
  MAV_ODID_TIME_ACC_0_2_SECOND = 2,
  /** The timestamp accuracy is smaller than or equal to 0.3 second. */
  MAV_ODID_TIME_ACC_0_3_SECOND = 3,
  /** The timestamp accuracy is smaller than or equal to 0.4 second. */
  MAV_ODID_TIME_ACC_0_4_SECOND = 4,
  /** The timestamp accuracy is smaller than or equal to 0.5 second. */
  MAV_ODID_TIME_ACC_0_5_SECOND = 5,
  /** The timestamp accuracy is smaller than or equal to 0.6 second. */
  MAV_ODID_TIME_ACC_0_6_SECOND = 6,
  /** The timestamp accuracy is smaller than or equal to 0.7 second. */
  MAV_ODID_TIME_ACC_0_7_SECOND = 7,
  /** The timestamp accuracy is smaller than or equal to 0.8 second. */
  MAV_ODID_TIME_ACC_0_8_SECOND = 8,
  /** The timestamp accuracy is smaller than or equal to 0.9 second. */
  MAV_ODID_TIME_ACC_0_9_SECOND = 9,
  /** The timestamp accuracy is smaller than or equal to 1.0 second. */
  MAV_ODID_TIME_ACC_1_0_SECOND = 10,
  /** The timestamp accuracy is smaller than or equal to 1.1 second. */
  MAV_ODID_TIME_ACC_1_1_SECOND = 11,
  /** The timestamp accuracy is smaller than or equal to 1.2 second. */
  MAV_ODID_TIME_ACC_1_2_SECOND = 12,
  /** The timestamp accuracy is smaller than or equal to 1.3 second. */
  MAV_ODID_TIME_ACC_1_3_SECOND = 13,
  /** The timestamp accuracy is smaller than or equal to 1.4 second. */
  MAV_ODID_TIME_ACC_1_4_SECOND = 14,
  /** The timestamp accuracy is smaller than or equal to 1.5 second. */
  MAV_ODID_TIME_ACC_1_5_SECOND = 15,
}

/** @deprecated Use MavOdidTimeAcc instead */
export const MAV_ODID_TIME_ACC = MavOdidTimeAcc;