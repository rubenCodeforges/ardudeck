export enum MavOdidDescType {
  /** Free-form text description of the purpose of the flight. */
  MAV_ODID_DESC_TYPE_TEXT = 0,
  /** Optional additional clarification when status == MAV_ODID_STATUS_EMERGENCY. */
  MAV_ODID_DESC_TYPE_EMERGENCY = 1,
  /** Optional additional clarification when status != MAV_ODID_STATUS_EMERGENCY. */
  MAV_ODID_DESC_TYPE_EXTENDED_STATUS = 2,
}

/** @deprecated Use MavOdidDescType instead */
export const MAV_ODID_DESC_TYPE = MavOdidDescType;