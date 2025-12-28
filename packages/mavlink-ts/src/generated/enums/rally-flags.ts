/**
 * Flags in RALLY_POINT message.
 */
export enum RallyFlags {
  /** Flag set when requiring favorable winds for landing. */
  FAVORABLE_WIND = 1,
  /** Flag set when plane is to immediately descend to break altitude and land without GCS intervention. Flag not set when plane is to loiter at Rally point until commanded to land. */
  LAND_IMMEDIATELY = 2,
  /** True if the following altitude frame value is valid. */
  ALT_FRAME_VALID = 4,
  /** 2 bit value representing altitude frame. 0: absolute, 1: relative home, 2: relative origin, 3: relative terrain */
  ALT_FRAME = 24,
}

/** @deprecated Use RallyFlags instead */
export const RALLY_FLAGS = RallyFlags;