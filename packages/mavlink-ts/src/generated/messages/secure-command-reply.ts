/**
 * Reply from secure command.
 * Message ID: 11005
 * CRC Extra: 93
 */
export interface SecureCommandReply {
  /** Sequence ID from request. */
  sequence: number;
  /** Operation that was requested. */
  operation: number;
  /** Result of command. */
  result: number;
  /** Data length. */
  dataLength: number;
  /** Reply data. */
  data: number[];
}

export const SECURE_COMMAND_REPLY_ID = 11005;
export const SECURE_COMMAND_REPLY_CRC_EXTRA = 93;
export const SECURE_COMMAND_REPLY_MIN_LENGTH = 230;
export const SECURE_COMMAND_REPLY_MAX_LENGTH = 230;

export function serializeSecureCommandReply(msg: SecureCommandReply): Uint8Array {
  const buffer = new Uint8Array(230);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.sequence, true);
  view.setUint32(4, msg.operation, true);
  buffer[8] = msg.result & 0xff;
  buffer[9] = msg.dataLength & 0xff;
  // Array: data
  for (let i = 0; i < 220; i++) {
    buffer[10 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeSecureCommandReply(payload: Uint8Array): SecureCommandReply {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint32(0, true),
    operation: view.getUint32(4, true),
    result: payload[8],
    dataLength: payload[9],
    data: Array.from({ length: 220 }, (_, i) => payload[10 + i * 1]),
  };
}