/**
 * Array test #6.
 * Message ID: 17156
 * CRC Extra: 14
 */
export interface ArrayTest6 {
  /** Stub field */
  v1: number;
  /** Stub field */
  v2: number;
  /** Stub field */
  v3: number;
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
  /** Value array */
  arD: number[];
  /** Value array */
  arF: number[];
}

export const ARRAY_TEST_6_ID = 17156;
export const ARRAY_TEST_6_CRC_EXTRA = 14;
export const ARRAY_TEST_6_MIN_LENGTH = 91;
export const ARRAY_TEST_6_MAX_LENGTH = 91;

export function serializeArrayTest6(msg: ArrayTest6): Uint8Array {
  const buffer = new Uint8Array(91);
  const view = new DataView(buffer.buffer);

  // Array: ar_d
  for (let i = 0; i < 2; i++) {
    view.setFloat64(0 + i * 8, msg.arD[i] ?? 0, true);
  }
  view.setUint32(16, msg.v3, true);
  // Array: ar_u32
  for (let i = 0; i < 2; i++) {
    view.setUint32(20 + i * 4, msg.arU32[i] ?? 0, true);
  }
  // Array: ar_i32
  for (let i = 0; i < 2; i++) {
    view.setInt32(28 + i * 4, msg.arI32[i] ?? 0, true);
  }
  // Array: ar_f
  for (let i = 0; i < 2; i++) {
    view.setFloat32(36 + i * 4, msg.arF[i] ?? 0, true);
  }
  view.setUint16(44, msg.v2, true);
  // Array: ar_u16
  for (let i = 0; i < 2; i++) {
    view.setUint16(46 + i * 2, msg.arU16[i] ?? 0, true);
  }
  // Array: ar_i16
  for (let i = 0; i < 2; i++) {
    view.setInt16(50 + i * 2, msg.arI16[i] ?? 0, true);
  }
  buffer[54] = msg.v1 & 0xff;
  // Array: ar_u8
  for (let i = 0; i < 2; i++) {
    buffer[55 + i * 1] = msg.arU8[i] ?? 0 & 0xff;
  }
  // Array: ar_i8
  for (let i = 0; i < 2; i++) {
    view.setInt8(57 + i * 1, msg.arI8[i] ?? 0);
  }
  // String: ar_c
  const arCBytes = new TextEncoder().encode(msg.arC || '');
  buffer.set(arCBytes.slice(0, 32), 59);

  return buffer;
}

export function deserializeArrayTest6(payload: Uint8Array): ArrayTest6 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arD: Array.from({ length: 2 }, (_, i) => view.getFloat64(0 + i * 8, true)),
    v3: view.getUint32(16, true),
    arU32: Array.from({ length: 2 }, (_, i) => view.getUint32(20 + i * 4, true)),
    arI32: Array.from({ length: 2 }, (_, i) => view.getInt32(28 + i * 4, true)),
    arF: Array.from({ length: 2 }, (_, i) => view.getFloat32(36 + i * 4, true)),
    v2: view.getUint16(44, true),
    arU16: Array.from({ length: 2 }, (_, i) => view.getUint16(46 + i * 2, true)),
    arI16: Array.from({ length: 2 }, (_, i) => view.getInt16(50 + i * 2, true)),
    v1: payload[54],
    arU8: Array.from({ length: 2 }, (_, i) => payload[55 + i * 1]),
    arI8: Array.from({ length: 2 }, (_, i) => view.getInt8(57 + i * 1)),
    arC: new TextDecoder().decode(payload.slice(59, 91)).replace(/\0.*$/, ''),
  };
}