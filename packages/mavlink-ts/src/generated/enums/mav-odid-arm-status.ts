export enum MavOdidArmStatus {
  /** Passing arming checks. */
  MAV_ODID_ARM_STATUS_GOOD_TO_ARM = 0,
  /** Generic arming failure, see error string for details. */
  MAV_ODID_ARM_STATUS_PRE_ARM_FAIL_GENERIC = 1,
}

/** @deprecated Use MavOdidArmStatus instead */
export const MAV_ODID_ARM_STATUS = MavOdidArmStatus;