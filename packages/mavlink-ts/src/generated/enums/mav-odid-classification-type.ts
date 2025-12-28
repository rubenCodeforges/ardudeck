export enum MavOdidClassificationType {
  /** The classification type for the UA is undeclared. */
  MAV_ODID_CLASSIFICATION_TYPE_UNDECLARED = 0,
  /** The classification type for the UA follows EU (European Union) specifications. */
  MAV_ODID_CLASSIFICATION_TYPE_EU = 1,
}

/** @deprecated Use MavOdidClassificationType instead */
export const MAV_ODID_CLASSIFICATION_TYPE = MavOdidClassificationType;