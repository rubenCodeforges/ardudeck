/**
 * Message encoding a mission item. This message is emitted to announce
                the presence of a mission item and to set a mission item on the system. The mission item can be either in x, y, z meters (type: LOCAL) or x:lat, y:lon, z:altitude. Local frame is Z-down, right handed (NED), global frame is Z-up, right handed (ENU). NaN or INT32_MAX may be used in float/integer params (respectively) to indicate optional/default values (e.g. to use the component's current latitude, yaw rather than a specific value). See also https://mavlink.io/en/services/mission.html.
 * Message ID: 73
 * CRC Extra: 38
 */
export interface MissionItemInt {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Waypoint ID (sequence number). Starts at zero. Increases monotonically for each waypoint, no gaps in the sequence (0,1,2,3,4). */
  seq: number;
  /** The coordinate system of the waypoint. */
  frame: number;
  /** The scheduled action for the waypoint. */
  command: number;
  /** false:0, true:1 */
  current: number;
  /** Autocontinue to next waypoint */
  autocontinue: number;
  /** PARAM1, see MAV_CMD enum */
  param1: number;
  /** PARAM2, see MAV_CMD enum */
  param2: number;
  /** PARAM3, see MAV_CMD enum */
  param3: number;
  /** PARAM4, see MAV_CMD enum */
  param4: number;
  /** PARAM5 / local: x position in meters * 1e4, global: latitude in degrees * 10^7 */
  x: number;
  /** PARAM6 / y position: local: x position in meters * 1e4, global: longitude in degrees *10^7 */
  y: number;
  /** PARAM7 / z position: global: altitude in meters (relative or absolute, depending on frame. */
  z: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_ITEM_INT_ID = 73;
export const MISSION_ITEM_INT_CRC_EXTRA = 38;
export const MISSION_ITEM_INT_MIN_LENGTH = 37;
export const MISSION_ITEM_INT_MAX_LENGTH = 38;

export function serializeMissionItemInt(msg: MissionItemInt): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.param1, true);
  view.setFloat32(4, msg.param2, true);
  view.setFloat32(8, msg.param3, true);
  view.setFloat32(12, msg.param4, true);
  view.setInt32(16, msg.x, true);
  view.setInt32(20, msg.y, true);
  view.setFloat32(24, msg.z, true);
  view.setUint16(28, msg.seq, true);
  view.setUint16(30, msg.command, true);
  buffer[32] = msg.targetSystem & 0xff;
  buffer[33] = msg.targetComponent & 0xff;
  buffer[34] = msg.frame & 0xff;
  buffer[35] = msg.current & 0xff;
  buffer[36] = msg.autocontinue & 0xff;
  buffer[37] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionItemInt(payload: Uint8Array): MissionItemInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    param1: view.getFloat32(0, true),
    param2: view.getFloat32(4, true),
    param3: view.getFloat32(8, true),
    param4: view.getFloat32(12, true),
    x: view.getInt32(16, true),
    y: view.getInt32(20, true),
    z: view.getFloat32(24, true),
    seq: view.getUint16(28, true),
    command: view.getUint16(30, true),
    targetSystem: payload[32],
    targetComponent: payload[33],
    frame: payload[34],
    current: payload[35],
    autocontinue: payload[36],
    missionType: payload[37],
  };
}