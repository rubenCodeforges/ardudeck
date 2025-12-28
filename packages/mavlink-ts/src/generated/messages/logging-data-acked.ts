/**
 * A message containing logged data which requires a LOGGING_ACK to be sent back
 * Message ID: 267
 * CRC Extra: 35
 */
export interface LoggingDataAcked {
  /** system ID of the target */
  targetSystem: number;
  /** component ID of the target */
  targetComponent: number;
  /** sequence number (can wrap) */
  sequence: number;
  /** data length (bytes) */
  length: number;
  /** offset into data where first message starts. This can be used for recovery, when a previous message got lost (set to UINT8_MAX if no start exists). (bytes) */
  firstMessageOffset: number;
  /** logged data */
  data: number[];
}

export const LOGGING_DATA_ACKED_ID = 267;
export const LOGGING_DATA_ACKED_CRC_EXTRA = 35;
export const LOGGING_DATA_ACKED_MIN_LENGTH = 255;
export const LOGGING_DATA_ACKED_MAX_LENGTH = 255;

export function serializeLoggingDataAcked(msg: LoggingDataAcked): Uint8Array {
  const buffer = new Uint8Array(255);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.sequence, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.length & 0xff;
  buffer[5] = msg.firstMessageOffset & 0xff;
  // Array: data
  for (let i = 0; i < 249; i++) {
    buffer[6 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeLoggingDataAcked(payload: Uint8Array): LoggingDataAcked {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    sequence: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    length: payload[4],
    firstMessageOffset: payload[5],
    data: Array.from({ length: 249 }, (_, i) => payload[6 + i * 1]),
  };
}