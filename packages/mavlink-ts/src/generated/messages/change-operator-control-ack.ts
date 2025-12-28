/**
 * Accept / deny control of this MAV
 * Message ID: 6
 * CRC Extra: 104
 */
export interface ChangeOperatorControlAck {
  /** ID of the GCS this message */
  gcsSystemId: number;
  /** 0: request control of this MAV, 1: Release control of this MAV */
  controlRequest: number;
  /** 0: ACK, 1: NACK: Wrong passkey, 2: NACK: Unsupported passkey encryption method, 3: NACK: Already under control */
  ack: number;
}

export const CHANGE_OPERATOR_CONTROL_ACK_ID = 6;
export const CHANGE_OPERATOR_CONTROL_ACK_CRC_EXTRA = 104;
export const CHANGE_OPERATOR_CONTROL_ACK_MIN_LENGTH = 3;
export const CHANGE_OPERATOR_CONTROL_ACK_MAX_LENGTH = 3;

export function serializeChangeOperatorControlAck(msg: ChangeOperatorControlAck): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.gcsSystemId & 0xff;
  buffer[1] = msg.controlRequest & 0xff;
  buffer[2] = msg.ack & 0xff;

  return buffer;
}

export function deserializeChangeOperatorControlAck(payload: Uint8Array): ChangeOperatorControlAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    gcsSystemId: payload[0],
    controlRequest: payload[1],
    ack: payload[2],
  };
}