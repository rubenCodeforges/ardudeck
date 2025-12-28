export enum NavVtolLandOptions {
  /** Default autopilot landing behaviour. */
  NAV_VTOL_LAND_OPTIONS_DEFAULT = 0,
  /** Use a fixed wing spiral desent approach before landing. */
  NAV_VTOL_LAND_OPTIONS_FW_SPIRAL_APPROACH = 1,
  /** Use a fixed wing approach before detransitioning and landing vertically. */
  NAV_VTOL_LAND_OPTIONS_FW_APPROACH = 2,
}

/** @deprecated Use NavVtolLandOptions instead */
export const NAV_VTOL_LAND_OPTIONS = NavVtolLandOptions;