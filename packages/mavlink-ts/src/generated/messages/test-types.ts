/**
 * Test all field types
 * Message ID: 17000
 * CRC Extra: 103
 */
export interface TestTypes {
  /** char */
  c: string;
  /** string */
  s: string;
  /** uint8_t */
  u8: number;
  /** uint16_t */
  u16: number;
  /** uint32_t */
  u32: number;
  /** uint64_t */
  u64: bigint;
  /** int8_t */
  s8: number;
  /** int16_t */
  s16: number;
  /** int32_t */
  s32: number;
  /** int64_t */
  s64: bigint;
  /** float */
  f: number;
  /** double */
  d: number;
  /** uint8_t_array */
  u8Array: number[];
  /** uint16_t_array */
  u16Array: number[];
  /** uint32_t_array */
  u32Array: number[];
  /** uint64_t_array */
  u64Array: bigint[];
  /** int8_t_array */
  s8Array: number[];
  /** int16_t_array */
  s16Array: number[];
  /** int32_t_array */
  s32Array: number[];
  /** int64_t_array */
  s64Array: bigint[];
  /** float_array */
  fArray: number[];
  /** double_array */
  dArray: number[];
}

export const TEST_TYPES_ID = 17000;
export const TEST_TYPES_CRC_EXTRA = 103;
export const TEST_TYPES_MIN_LENGTH = 179;
export const TEST_TYPES_MAX_LENGTH = 179;

export function serializeTestTypes(msg: TestTypes): Uint8Array {
  const buffer = new Uint8Array(179);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.u64), true);
  view.setBigInt64(8, BigInt(msg.s64), true);
  view.setFloat64(16, msg.d, true);
  // Array: u64_array
  for (let i = 0; i < 3; i++) {
    view.setBigUint64(24 + i * 8, BigInt(msg.u64Array[i] ?? 0), true);
  }
  // Array: s64_array
  for (let i = 0; i < 3; i++) {
    view.setBigInt64(48 + i * 8, BigInt(msg.s64Array[i] ?? 0), true);
  }
  // Array: d_array
  for (let i = 0; i < 3; i++) {
    view.setFloat64(72 + i * 8, msg.dArray[i] ?? 0, true);
  }
  view.setUint32(96, msg.u32, true);
  view.setInt32(100, msg.s32, true);
  view.setFloat32(104, msg.f, true);
  // Array: u32_array
  for (let i = 0; i < 3; i++) {
    view.setUint32(108 + i * 4, msg.u32Array[i] ?? 0, true);
  }
  // Array: s32_array
  for (let i = 0; i < 3; i++) {
    view.setInt32(120 + i * 4, msg.s32Array[i] ?? 0, true);
  }
  // Array: f_array
  for (let i = 0; i < 3; i++) {
    view.setFloat32(132 + i * 4, msg.fArray[i] ?? 0, true);
  }
  view.setUint16(144, msg.u16, true);
  view.setInt16(146, msg.s16, true);
  // Array: u16_array
  for (let i = 0; i < 3; i++) {
    view.setUint16(148 + i * 2, msg.u16Array[i] ?? 0, true);
  }
  // Array: s16_array
  for (let i = 0; i < 3; i++) {
    view.setInt16(154 + i * 2, msg.s16Array[i] ?? 0, true);
  }
  // Char: c
  buffer[160] = (msg.c || '').charCodeAt(0) || 0;
  // String: s
  const sBytes = new TextEncoder().encode(msg.s || '');
  buffer.set(sBytes.slice(0, 10), 161);
  buffer[171] = msg.u8 & 0xff;
  view.setInt8(172, msg.s8);
  // Array: u8_array
  for (let i = 0; i < 3; i++) {
    buffer[173 + i * 1] = msg.u8Array[i] ?? 0 & 0xff;
  }
  // Array: s8_array
  for (let i = 0; i < 3; i++) {
    view.setInt8(176 + i * 1, msg.s8Array[i] ?? 0);
  }

  return buffer;
}

export function deserializeTestTypes(payload: Uint8Array): TestTypes {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    u64: view.getBigUint64(0, true),
    s64: view.getBigInt64(8, true),
    d: view.getFloat64(16, true),
    u64Array: Array.from({ length: 3 }, (_, i) => view.getBigUint64(24 + i * 8, true)),
    s64Array: Array.from({ length: 3 }, (_, i) => view.getBigInt64(48 + i * 8, true)),
    dArray: Array.from({ length: 3 }, (_, i) => view.getFloat64(72 + i * 8, true)),
    u32: view.getUint32(96, true),
    s32: view.getInt32(100, true),
    f: view.getFloat32(104, true),
    u32Array: Array.from({ length: 3 }, (_, i) => view.getUint32(108 + i * 4, true)),
    s32Array: Array.from({ length: 3 }, (_, i) => view.getInt32(120 + i * 4, true)),
    fArray: Array.from({ length: 3 }, (_, i) => view.getFloat32(132 + i * 4, true)),
    u16: view.getUint16(144, true),
    s16: view.getInt16(146, true),
    u16Array: Array.from({ length: 3 }, (_, i) => view.getUint16(148 + i * 2, true)),
    s16Array: Array.from({ length: 3 }, (_, i) => view.getInt16(154 + i * 2, true)),
    c: String.fromCharCode(payload[160] || 0),
    s: new TextDecoder().decode(payload.slice(161, 171)).replace(/\0.*$/, ''),
    u8: payload[171],
    s8: view.getInt8(172),
    u8Array: Array.from({ length: 3 }, (_, i) => payload[173 + i * 1]),
    s8Array: Array.from({ length: 3 }, (_, i) => view.getInt8(176 + i * 1)),
  };
}