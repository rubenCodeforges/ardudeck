/**
 * Set the mission item with sequence number seq as current item. This means that the MAV will continue to this mission item on the shortest path (not following the mission items in-between).
 * Message ID: 41
 * CRC Extra: 28
 */
export interface MissionSetCurrent {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
  seq: number;
}

export const MISSION_SET_CURRENT_ID = 41;
export const MISSION_SET_CURRENT_CRC_EXTRA = 28;
export const MISSION_SET_CURRENT_MIN_LENGTH = 4;
export const MISSION_SET_CURRENT_MAX_LENGTH = 4;

export function serializeMissionSetCurrent(msg: MissionSetCurrent): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeMissionSetCurrent(payload: Uint8Array): MissionSetCurrent {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
  };
}