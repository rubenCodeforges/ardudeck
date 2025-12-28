/**
 * Actions being taken to mitigate/prevent fence breach
 */
export enum FenceMitigate {
  /** Unknown */
  FENCE_MITIGATE_UNKNOWN = 0,
  /** No actions being taken */
  FENCE_MITIGATE_NONE = 1,
  /** Velocity limiting active to prevent breach */
  FENCE_MITIGATE_VEL_LIMIT = 2,
}

/** @deprecated Use FenceMitigate instead */
export const FENCE_MITIGATE = FenceMitigate;