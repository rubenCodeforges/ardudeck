/**
 * Stop log transfer and resume normal logging
 * Message ID: 122
 * CRC Extra: 203
 */
export interface LogRequestEnd {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const LOG_REQUEST_END_ID = 122;
export const LOG_REQUEST_END_CRC_EXTRA = 203;
export const LOG_REQUEST_END_MIN_LENGTH = 2;
export const LOG_REQUEST_END_MAX_LENGTH = 2;

export function serializeLogRequestEnd(msg: LogRequestEnd): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeLogRequestEnd(payload: Uint8Array): LogRequestEnd {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}