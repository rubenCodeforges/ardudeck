/**
 * Type of mission items being requested/sent in mission protocol.
 */
export enum MavMissionType {
  /** Items are mission commands for main mission. */
  MAV_MISSION_TYPE_MISSION = 0,
  /** Specifies GeoFence area(s). Items are MAV_CMD_NAV_FENCE_ GeoFence items. */
  MAV_MISSION_TYPE_FENCE = 1,
  /** Specifies the rally points for the vehicle. Rally points are alternative RTL points. Items are MAV_CMD_NAV_RALLY_POINT rally point items. */
  MAV_MISSION_TYPE_RALLY = 2,
  /** Only used in MISSION_CLEAR_ALL to clear all mission types. */
  MAV_MISSION_TYPE_ALL = 255,
}

/** @deprecated Use MavMissionType instead */
export const MAV_MISSION_TYPE = MavMissionType;