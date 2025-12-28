/**
 * Fence types to enable or disable as a bitmask. Used in MAV_CMD_DO_FENCE_ENABLE.
 * @bitmask
 */
export enum FenceType {
  /** Maximum altitude fence */
  FENCE_TYPE_ALT_MAX = 1,
  /** Circle fence */
  FENCE_TYPE_CIRCLE = 2,
  /** Polygon fence */
  FENCE_TYPE_POLYGON = 4,
  /** Minimum altitude fence */
  FENCE_TYPE_ALT_MIN = 8,
}

/** @deprecated Use FenceType instead */
export const FENCE_TYPE = FenceType;