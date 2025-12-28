/**
 * Result of mission operation (in a MISSION_ACK message).
 */
export enum MavMissionResult {
  /** mission accepted OK */
  MAV_MISSION_ACCEPTED = 0,
  /** Generic error / not accepting mission commands at all right now. */
  MAV_MISSION_ERROR = 1,
  /** Coordinate frame is not supported. */
  MAV_MISSION_UNSUPPORTED_FRAME = 2,
  /** Command is not supported. */
  MAV_MISSION_UNSUPPORTED = 3,
  /** Mission items exceed storage space. */
  MAV_MISSION_NO_SPACE = 4,
  /** One of the parameters has an invalid value. */
  MAV_MISSION_INVALID = 5,
  /** param1 has an invalid value. */
  MAV_MISSION_INVALID_PARAM1 = 6,
  /** param2 has an invalid value. */
  MAV_MISSION_INVALID_PARAM2 = 7,
  /** param3 has an invalid value. */
  MAV_MISSION_INVALID_PARAM3 = 8,
  /** param4 has an invalid value. */
  MAV_MISSION_INVALID_PARAM4 = 9,
  /** x / param5 has an invalid value. */
  MAV_MISSION_INVALID_PARAM5_X = 10,
  /** y / param6 has an invalid value. */
  MAV_MISSION_INVALID_PARAM6_Y = 11,
  /** z / param7 has an invalid value. */
  MAV_MISSION_INVALID_PARAM7 = 12,
  /** Mission item received out of sequence */
  MAV_MISSION_INVALID_SEQUENCE = 13,
  /** Not accepting any mission commands from this communication partner. */
  MAV_MISSION_DENIED = 14,
  /** Current mission operation cancelled (e.g. mission upload, mission download). */
  MAV_MISSION_OPERATION_CANCELLED = 15,
}

/** @deprecated Use MavMissionResult instead */
export const MAV_MISSION_RESULT = MavMissionResult;