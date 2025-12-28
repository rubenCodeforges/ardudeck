/**
 * Array test #4.
 * Message ID: 17154
 * CRC Extra: 89
 */
export interface ArrayTest4 {
  /** Value array */
  arU32: number[];
  /** Stub field */
  v: number;
}

export const ARRAY_TEST_4_ID = 17154;
export const ARRAY_TEST_4_CRC_EXTRA = 89;
export const ARRAY_TEST_4_MIN_LENGTH = 17;
export const ARRAY_TEST_4_MAX_LENGTH = 17;

export function serializeArrayTest4(msg: ArrayTest4): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  // Array: ar_u32
  for (let i = 0; i < 4; i++) {
    view.setUint32(0 + i * 4, msg.arU32[i] ?? 0, true);
  }
  buffer[16] = msg.v & 0xff;

  return buffer;
}

export function deserializeArrayTest4(payload: Uint8Array): ArrayTest4 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arU32: Array.from({ length: 4 }, (_, i) => view.getUint32(0 + i * 4, true)),
    v: payload[16],
  };
}