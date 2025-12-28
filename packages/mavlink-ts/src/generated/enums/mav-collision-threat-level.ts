/**
 * Aircraft-rated danger from this threat.
 */
export enum MavCollisionThreatLevel {
  /** Not a threat */
  MAV_COLLISION_THREAT_LEVEL_NONE = 0,
  /** Craft is mildly concerned about this threat */
  MAV_COLLISION_THREAT_LEVEL_LOW = 1,
  /** Craft is panicking, and may take actions to avoid threat */
  MAV_COLLISION_THREAT_LEVEL_HIGH = 2,
}

/** @deprecated Use MavCollisionThreatLevel instead */
export const MAV_COLLISION_THREAT_LEVEL = MavCollisionThreatLevel;