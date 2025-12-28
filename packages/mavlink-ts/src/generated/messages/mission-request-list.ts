/**
 * Request the overall list of mission items from the system/component.
 * Message ID: 43
 * CRC Extra: 148
 */
export interface MissionRequestList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_REQUEST_LIST_ID = 43;
export const MISSION_REQUEST_LIST_CRC_EXTRA = 148;
export const MISSION_REQUEST_LIST_MIN_LENGTH = 3;
export const MISSION_REQUEST_LIST_MAX_LENGTH = 3;

export function serializeMissionRequestList(msg: MissionRequestList): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionRequestList(payload: Uint8Array): MissionRequestList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    missionType: payload[2],
  };
}