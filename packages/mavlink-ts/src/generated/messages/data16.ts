/**
 * Data packet, size 16.
 * Message ID: 169
 * CRC Extra: 234
 */
export interface Data16 {
  /** Data type. */
  type: number;
  /** Data length. (bytes) */
  len: number;
  /** Raw data. */
  data: number[];
}

export const DATA16_ID = 169;
export const DATA16_CRC_EXTRA = 234;
export const DATA16_MIN_LENGTH = 18;
export const DATA16_MAX_LENGTH = 18;

export function serializeData16(msg: Data16): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.type & 0xff;
  buffer[1] = msg.len & 0xff;
  // Array: data
  for (let i = 0; i < 16; i++) {
    buffer[2 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeData16(payload: Uint8Array): Data16 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    type: payload[0],
    len: payload[1],
    data: Array.from({ length: 16 }, (_, i) => payload[2 + i * 1]),
  };
}