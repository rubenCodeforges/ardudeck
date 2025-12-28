/**
 * Array test #0.
 * Message ID: 17150
 * CRC Extra: 26
 */
export interface ArrayTest0 {
  /** Stub field */
  v1: number;
  /** Value array */
  arI8: number[];
  /** Value array */
  arU8: number[];
  /** Value array */
  arU16: number[];
  /** Value array */
  arU32: number[];
}

export const ARRAY_TEST_0_ID = 17150;
export const ARRAY_TEST_0_CRC_EXTRA = 26;
export const ARRAY_TEST_0_MIN_LENGTH = 33;
export const ARRAY_TEST_0_MAX_LENGTH = 33;

export function serializeArrayTest0(msg: ArrayTest0): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  // Array: ar_u32
  for (let i = 0; i < 4; i++) {
    view.setUint32(0 + i * 4, msg.arU32[i] ?? 0, true);
  }
  // Array: ar_u16
  for (let i = 0; i < 4; i++) {
    view.setUint16(16 + i * 2, msg.arU16[i] ?? 0, true);
  }
  buffer[24] = msg.v1 & 0xff;
  // Array: ar_i8
  for (let i = 0; i < 4; i++) {
    view.setInt8(25 + i * 1, msg.arI8[i] ?? 0);
  }
  // Array: ar_u8
  for (let i = 0; i < 4; i++) {
    buffer[29 + i * 1] = msg.arU8[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeArrayTest0(payload: Uint8Array): ArrayTest0 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arU32: Array.from({ length: 4 }, (_, i) => view.getUint32(0 + i * 4, true)),
    arU16: Array.from({ length: 4 }, (_, i) => view.getUint16(16 + i * 2, true)),
    v1: payload[24],
    arI8: Array.from({ length: 4 }, (_, i) => view.getInt8(25 + i * 1)),
    arU8: Array.from({ length: 4 }, (_, i) => payload[29 + i * 1]),
  };
}