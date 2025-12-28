/**
 * Message encoding a mission item. This message is emitted to announce
                the presence of a mission item and to set a mission item on the system. The mission item can be either in x, y, z meters (type: LOCAL) or x:lat, y:lon, z:altitude. Local frame is Z-down, right handed (NED), global frame is Z-up, right handed (ENU). NaN may be used to indicate an optional/default value (e.g. to use the system's current latitude or yaw rather than a specific value). See also https://mavlink.io/en/services/mission.html.
 * Message ID: 39
 * CRC Extra: 95
 */
export interface MissionItem {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
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
  /** PARAM5 / local: X coordinate, global: latitude */
  x: number;
  /** PARAM6 / local: Y coordinate, global: longitude */
  y: number;
  /** PARAM7 / local: Z coordinate, global: altitude (relative or absolute, depending on frame). */
  z: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_ITEM_ID = 39;
export const MISSION_ITEM_CRC_EXTRA = 95;
export const MISSION_ITEM_MIN_LENGTH = 38;
export const MISSION_ITEM_MAX_LENGTH = 38;

export function serializeMissionItem(msg: MissionItem): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.param1, true);
  view.setFloat32(4, msg.param2, true);
  view.setFloat32(8, msg.param3, true);
  view.setFloat32(12, msg.param4, true);
  view.setFloat32(16, msg.x, true);
  view.setFloat32(20, msg.y, true);
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

export function deserializeMissionItem(payload: Uint8Array): MissionItem {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    param1: view.getFloat32(0, true),
    param2: view.getFloat32(4, true),
    param3: view.getFloat32(8, true),
    param4: view.getFloat32(12, true),
    x: view.getFloat32(16, true),
    y: view.getFloat32(20, true),
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