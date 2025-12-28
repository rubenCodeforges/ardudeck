/**
 * Request the information of the mission item with the sequence number seq. The response of the system to this message should be a MISSION_ITEM message. https://mavlink.io/en/services/mission.html
 * Message ID: 40
 * CRC Extra: 177
 */
export interface MissionRequest {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
  seq: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_REQUEST_ID = 40;
export const MISSION_REQUEST_CRC_EXTRA = 177;
export const MISSION_REQUEST_MIN_LENGTH = 5;
export const MISSION_REQUEST_MAX_LENGTH = 5;

export function serializeMissionRequest(msg: MissionRequest): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionRequest(payload: Uint8Array): MissionRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    missionType: payload[4],
  };
}