/**
 * Request the information of the mission item with the sequence number seq. The response of the system to this message should be a MISSION_ITEM_INT message. https://mavlink.io/en/services/mission.html
 * Message ID: 51
 * CRC Extra: 129
 */
export interface MissionRequestInt {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
  seq: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_REQUEST_INT_ID = 51;
export const MISSION_REQUEST_INT_CRC_EXTRA = 129;
export const MISSION_REQUEST_INT_MIN_LENGTH = 5;
export const MISSION_REQUEST_INT_MAX_LENGTH = 5;

export function serializeMissionRequestInt(msg: MissionRequestInt): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionRequestInt(payload: Uint8Array): MissionRequestInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    missionType: payload[4],
  };
}