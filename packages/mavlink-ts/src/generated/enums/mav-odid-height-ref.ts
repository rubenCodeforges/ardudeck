export enum MavOdidHeightRef {
  /** The height field is relative to the take-off location. */
  MAV_ODID_HEIGHT_REF_OVER_TAKEOFF = 0,
  /** The height field is relative to ground. */
  MAV_ODID_HEIGHT_REF_OVER_GROUND = 1,
}

/** @deprecated Use MavOdidHeightRef instead */
export const MAV_ODID_HEIGHT_REF = MavOdidHeightRef;