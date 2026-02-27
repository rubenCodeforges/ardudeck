/**
 * This message is emitted as response to MISSION_REQUEST_LIST by the MAV and to initiate a write transaction. The GCS can then request the individual mission item based on the knowledge of the total number of waypoints.
 * Message ID: 44
 * CRC Extra: 221
 */
export interface MissionCount {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Number of mission items in the sequence */
  count: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_COUNT_ID = 44;
export const MISSION_COUNT_CRC_EXTRA = 221;
export const MISSION_COUNT_MIN_LENGTH = 4;
export const MISSION_COUNT_MAX_LENGTH = 5;

export function serializeMissionCount(msg: MissionCount): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.count, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionCount(payload: Uint8Array): MissionCount {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    count: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    missionType: payload[4],
  };
}