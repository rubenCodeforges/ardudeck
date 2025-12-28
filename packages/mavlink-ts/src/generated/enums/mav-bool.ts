/**
 * Enum used to indicate true or false (also: success or failure, enabled or disabled, active or inactive).
 * @bitmask
 */
export enum MavBool {
  /** False. */
  MAV_BOOL_FALSE = 0,
  /** True. */
  MAV_BOOL_TRUE = 1,
}

/** @deprecated Use MavBool instead */
export const MAV_BOOL = MavBool;