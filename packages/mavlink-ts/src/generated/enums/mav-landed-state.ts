/**
 * Enumeration of landed detector states
 */
export enum MavLandedState {
  /** MAV landed state is unknown */
  MAV_LANDED_STATE_UNDEFINED = 0,
  /** MAV is landed (on ground) */
  MAV_LANDED_STATE_ON_GROUND = 1,
  /** MAV is in air */
  MAV_LANDED_STATE_IN_AIR = 2,
  /** MAV currently taking off */
  MAV_LANDED_STATE_TAKEOFF = 3,
  /** MAV currently landing */
  MAV_LANDED_STATE_LANDING = 4,
}

/** @deprecated Use MavLandedState instead */
export const MAV_LANDED_STATE = MavLandedState;