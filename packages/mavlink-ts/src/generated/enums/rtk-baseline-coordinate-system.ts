/**
 * RTK GPS baseline coordinate system, used for RTK corrections
 */
export enum RtkBaselineCoordinateSystem {
  /** Earth-centered, Earth-fixed */
  RTK_BASELINE_COORDINATE_SYSTEM_ECEF = 0,
  /** RTK basestation centered, north, east, down */
  RTK_BASELINE_COORDINATE_SYSTEM_NED = 1,
}

/** @deprecated Use RtkBaselineCoordinateSystem instead */
export const RTK_BASELINE_COORDINATE_SYSTEM = RtkBaselineCoordinateSystem;