export enum MavOdidCategoryEu {
  /** The category for the UA, according to the EU specification, is undeclared. */
  MAV_ODID_CATEGORY_EU_UNDECLARED = 0,
  /** The category for the UA, according to the EU specification, is the Open category. */
  MAV_ODID_CATEGORY_EU_OPEN = 1,
  /** The category for the UA, according to the EU specification, is the Specific category. */
  MAV_ODID_CATEGORY_EU_SPECIFIC = 2,
  /** The category for the UA, according to the EU specification, is the Certified category. */
  MAV_ODID_CATEGORY_EU_CERTIFIED = 3,
}

/** @deprecated Use MavOdidCategoryEu instead */
export const MAV_ODID_CATEGORY_EU = MavOdidCategoryEu;