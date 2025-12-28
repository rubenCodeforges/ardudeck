export enum GoproFieldOfView {
  /** 0x00: Wide. */
  GOPRO_FIELD_OF_VIEW_WIDE = 0,
  /** 0x01: Medium. */
  GOPRO_FIELD_OF_VIEW_MEDIUM = 1,
  /** 0x02: Narrow. */
  GOPRO_FIELD_OF_VIEW_NARROW = 2,
}

/** @deprecated Use GoproFieldOfView instead */
export const GOPRO_FIELD_OF_VIEW = GoproFieldOfView;