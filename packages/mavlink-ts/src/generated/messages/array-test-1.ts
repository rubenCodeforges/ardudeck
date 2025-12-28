/**
 * Array test #1.
 * Message ID: 17151
 * CRC Extra: 72
 */
export interface ArrayTest1 {
  /** Value array */
  arU32: number[];
}

export const ARRAY_TEST_1_ID = 17151;
export const ARRAY_TEST_1_CRC_EXTRA = 72;
export const ARRAY_TEST_1_MIN_LENGTH = 16;
export const ARRAY_TEST_1_MAX_LENGTH = 16;

export function serializeArrayTest1(msg: ArrayTest1): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  // Array: ar_u32
  for (let i = 0; i < 4; i++) {
    view.setUint32(0 + i * 4, msg.arU32[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeArrayTest1(payload: Uint8Array): ArrayTest1 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arU32: Array.from({ length: 4 }, (_, i) => view.getUint32(0 + i * 4, true)),
  };
}