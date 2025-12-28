/**
 * Array test #8.
 * Message ID: 17158
 * CRC Extra: 106
 */
export interface ArrayTest8 {
  /** Stub field */
  v3: number;
  /** Value array */
  arD: number[];
  /** Value array */
  arU16: number[];
}

export const ARRAY_TEST_8_ID = 17158;
export const ARRAY_TEST_8_CRC_EXTRA = 106;
export const ARRAY_TEST_8_MIN_LENGTH = 24;
export const ARRAY_TEST_8_MAX_LENGTH = 24;

export function serializeArrayTest8(msg: ArrayTest8): Uint8Array {
  const buffer = new Uint8Array(24);
  const view = new DataView(buffer.buffer);

  // Array: ar_d
  for (let i = 0; i < 2; i++) {
    view.setFloat64(0 + i * 8, msg.arD[i] ?? 0, true);
  }
  view.setUint32(16, msg.v3, true);
  // Array: ar_u16
  for (let i = 0; i < 2; i++) {
    view.setUint16(20 + i * 2, msg.arU16[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeArrayTest8(payload: Uint8Array): ArrayTest8 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arD: Array.from({ length: 2 }, (_, i) => view.getFloat64(0 + i * 8, true)),
    v3: view.getUint32(16, true),
    arU16: Array.from({ length: 2 }, (_, i) => view.getUint16(20 + i * 2, true)),
  };
}