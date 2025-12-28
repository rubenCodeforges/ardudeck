/**
 * Erase all logs
 * Message ID: 121
 * CRC Extra: 237
 */
export interface LogErase {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const LOG_ERASE_ID = 121;
export const LOG_ERASE_CRC_EXTRA = 237;
export const LOG_ERASE_MIN_LENGTH = 2;
export const LOG_ERASE_MAX_LENGTH = 2;

export function serializeLogErase(msg: LogErase): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeLogErase(payload: Uint8Array): LogErase {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}