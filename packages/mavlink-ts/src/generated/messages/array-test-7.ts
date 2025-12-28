/**
 * Array test #7.
 * Message ID: 17157
 * CRC Extra: 187
 */
export interface ArrayTest7 {
  /** Value array */
  arD: number[];
  /** Value array */
  arF: number[];
  /** Value array */
  arU32: number[];
  /** Value array */
  arI32: number[];
  /** Value array */
  arU16: number[];
  /** Value array */
  arI16: number[];
  /** Value array */
  arU8: number[];
  /** Value array */
  arI8: number[];
  /** Value array */
  arC: string;
}

export const ARRAY_TEST_7_ID = 17157;
export const ARRAY_TEST_7_CRC_EXTRA = 187;
export const ARRAY_TEST_7_MIN_LENGTH = 84;
export const ARRAY_TEST_7_MAX_LENGTH = 84;

export function serializeArrayTest7(msg: ArrayTest7): Uint8Array {
  const buffer = new Uint8Array(84);
  const view = new DataView(buffer.buffer);

  // Array: ar_d
  for (let i = 0; i < 2; i++) {
    view.setFloat64(0 + i * 8, msg.arD[i] ?? 0, true);
  }
  // Array: ar_f
  for (let i = 0; i < 2; i++) {
    view.setFloat32(16 + i * 4, msg.arF[i] ?? 0, true);
  }
  // Array: ar_u32
  for (let i = 0; i < 2; i++) {
    view.setUint32(24 + i * 4, msg.arU32[i] ?? 0, true);
  }
  // Array: ar_i32
  for (let i = 0; i < 2; i++) {
    view.setInt32(32 + i * 4, msg.arI32[i] ?? 0, true);
  }
  // Array: ar_u16
  for (let i = 0; i < 2; i++) {
    view.setUint16(40 + i * 2, msg.arU16[i] ?? 0, true);
  }
  // Array: ar_i16
  for (let i = 0; i < 2; i++) {
    view.setInt16(44 + i * 2, msg.arI16[i] ?? 0, true);
  }
  // Array: ar_u8
  for (let i = 0; i < 2; i++) {
    buffer[48 + i * 1] = msg.arU8[i] ?? 0 & 0xff;
  }
  // Array: ar_i8
  for (let i = 0; i < 2; i++) {
    view.setInt8(50 + i * 1, msg.arI8[i] ?? 0);
  }
  // String: ar_c
  const arCBytes = new TextEncoder().encode(msg.arC || '');
  buffer.set(arCBytes.slice(0, 32), 52);

  return buffer;
}

export function deserializeArrayTest7(payload: Uint8Array): ArrayTest7 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arD: Array.from({ length: 2 }, (_, i) => view.getFloat64(0 + i * 8, true)),
    arF: Array.from({ length: 2 }, (_, i) => view.getFloat32(16 + i * 4, true)),
    arU32: Array.from({ length: 2 }, (_, i) => view.getUint32(24 + i * 4, true)),
    arI32: Array.from({ length: 2 }, (_, i) => view.getInt32(32 + i * 4, true)),
    arU16: Array.from({ length: 2 }, (_, i) => view.getUint16(40 + i * 2, true)),
    arI16: Array.from({ length: 2 }, (_, i) => view.getInt16(44 + i * 2, true)),
    arU8: Array.from({ length: 2 }, (_, i) => payload[48 + i * 1]),
    arI8: Array.from({ length: 2 }, (_, i) => view.getInt8(50 + i * 1)),
    arC: new TextDecoder().decode(payload.slice(52, 84)).replace(/\0.*$/, ''),
  };
}