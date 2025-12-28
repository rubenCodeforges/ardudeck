/**
 * Delete all mission items at once.
 * Message ID: 45
 * CRC Extra: 25
 */
export interface MissionClearAll {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_CLEAR_ALL_ID = 45;
export const MISSION_CLEAR_ALL_CRC_EXTRA = 25;
export const MISSION_CLEAR_ALL_MIN_LENGTH = 3;
export const MISSION_CLEAR_ALL_MAX_LENGTH = 3;

export function serializeMissionClearAll(msg: MissionClearAll): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionClearAll(payload: Uint8Array): MissionClearAll {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    missionType: payload[2],
  };
}