export enum IcarousFmsState {
  ICAROUS_FMS_STATE_IDLE = 0,
  ICAROUS_FMS_STATE_TAKEOFF = 1,
  ICAROUS_FMS_STATE_CLIMB = 2,
  ICAROUS_FMS_STATE_CRUISE = 3,
  ICAROUS_FMS_STATE_APPROACH = 4,
  ICAROUS_FMS_STATE_LAND = 5,
}

/** @deprecated Use IcarousFmsState instead */
export const ICAROUS_FMS_STATE = IcarousFmsState;