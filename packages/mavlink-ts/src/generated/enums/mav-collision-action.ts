/**
 * Possible actions an aircraft can take to avoid a collision.
 */
export enum MavCollisionAction {
  /** Ignore any potential collisions */
  MAV_COLLISION_ACTION_NONE = 0,
  /** Report potential collision */
  MAV_COLLISION_ACTION_REPORT = 1,
  /** Ascend or Descend to avoid threat */
  MAV_COLLISION_ACTION_ASCEND_OR_DESCEND = 2,
  /** Move horizontally to avoid threat */
  MAV_COLLISION_ACTION_MOVE_HORIZONTALLY = 3,
  /** Aircraft to move perpendicular to the collision's velocity vector */
  MAV_COLLISION_ACTION_MOVE_PERPENDICULAR = 4,
  /** Aircraft to fly directly back to its launch point */
  MAV_COLLISION_ACTION_RTL = 5,
  /** Aircraft to stop in place */
  MAV_COLLISION_ACTION_HOVER = 6,
}

/** @deprecated Use MavCollisionAction instead */
export const MAV_COLLISION_ACTION = MavCollisionAction;