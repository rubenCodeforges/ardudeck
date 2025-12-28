/**
 * Reply to LOG_REQUEST_DATA
 * Message ID: 120
 * CRC Extra: 134
 */
export interface LogData {
  /** Log id (from LOG_ENTRY reply) */
  id: number;
  /** Offset into the log */
  ofs: number;
  /** Number of bytes (zero for end of log) (bytes) */
  count: number;
  /** log data */
  data: number[];
}

export const LOG_DATA_ID = 120;
export const LOG_DATA_CRC_EXTRA = 134;
export const LOG_DATA_MIN_LENGTH = 97;
export const LOG_DATA_MAX_LENGTH = 97;

export function serializeLogData(msg: LogData): Uint8Array {
  const buffer = new Uint8Array(97);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.ofs, true);
  view.setUint16(4, msg.id, true);
  buffer[6] = msg.count & 0xff;
  // Array: data
  for (let i = 0; i < 90; i++) {
    buffer[7 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeLogData(payload: Uint8Array): LogData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    ofs: view.getUint32(0, true),
    id: view.getUint16(4, true),
    count: payload[6],
    data: Array.from({ length: 90 }, (_, i) => payload[7 + i * 1]),
  };
}