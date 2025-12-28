/**
 * Acknowledgment message during waypoint handling. The type field states if this message is a positive ack (type=0) or if an error happened (type=non-zero).
 * Message ID: 47
 * CRC Extra: 146
 */
export interface MissionAck {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Mission result. */
  type: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_ACK_ID = 47;
export const MISSION_ACK_CRC_EXTRA = 146;
export const MISSION_ACK_MIN_LENGTH = 4;
export const MISSION_ACK_MAX_LENGTH = 4;

export function serializeMissionAck(msg: MissionAck): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.type & 0xff;
  buffer[3] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionAck(payload: Uint8Array): MissionAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    type: payload[2],
    missionType: payload[3],
  };
}