/**
 * Precision land modes (used in MAV_CMD_NAV_LAND).
 */
export enum PrecisionLandMode {
  /** Normal (non-precision) landing. */
  PRECISION_LAND_MODE_DISABLED = 0,
  /** Use precision landing if beacon detected when land command accepted, otherwise land normally. */
  PRECISION_LAND_MODE_OPPORTUNISTIC = 1,
  /** Use precision landing, searching for beacon if not found when land command accepted (land normally if beacon cannot be found). */
  PRECISION_LAND_MODE_REQUIRED = 2,
}

/** @deprecated Use PrecisionLandMode instead */
export const PRECISION_LAND_MODE = PrecisionLandMode;