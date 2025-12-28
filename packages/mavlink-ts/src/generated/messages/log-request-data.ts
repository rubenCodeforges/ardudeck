/**
 * Request a chunk of a log
 * Message ID: 119
 * CRC Extra: 116
 */
export interface LogRequestData {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Log id (from LOG_ENTRY reply) */
  id: number;
  /** Offset into the log */
  ofs: number;
  /** Number of bytes (bytes) */
  count: number;
}

export const LOG_REQUEST_DATA_ID = 119;
export const LOG_REQUEST_DATA_CRC_EXTRA = 116;
export const LOG_REQUEST_DATA_MIN_LENGTH = 12;
export const LOG_REQUEST_DATA_MAX_LENGTH = 12;

export function serializeLogRequestData(msg: LogRequestData): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.ofs, true);
  view.setUint32(4, msg.count, true);
  view.setUint16(8, msg.id, true);
  buffer[10] = msg.targetSystem & 0xff;
  buffer[11] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeLogRequestData(payload: Uint8Array): LogRequestData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    ofs: view.getUint32(0, true),
    count: view.getUint32(4, true),
    id: view.getUint16(8, true),
    targetSystem: payload[10],
    targetComponent: payload[11],
  };
}