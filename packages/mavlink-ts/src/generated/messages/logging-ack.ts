/**
 * An ack for a LOGGING_DATA_ACKED message
 * Message ID: 268
 * CRC Extra: 14
 */
export interface LoggingAck {
  /** system ID of the target */
  targetSystem: number;
  /** component ID of the target */
  targetComponent: number;
  /** sequence number (must match the one in LOGGING_DATA_ACKED) */
  sequence: number;
}

export const LOGGING_ACK_ID = 268;
export const LOGGING_ACK_CRC_EXTRA = 14;
export const LOGGING_ACK_MIN_LENGTH = 4;
export const LOGGING_ACK_MAX_LENGTH = 4;

export function serializeLoggingAck(msg: LoggingAck): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.sequence, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeLoggingAck(payload: Uint8Array): LoggingAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
  };
}