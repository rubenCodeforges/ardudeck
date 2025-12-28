/**
 * Array test #3.
 * Message ID: 17153
 * CRC Extra: 19
 */
export interface ArrayTest3 {
  /** Stub field */
  v: number;
  /** Value array */
  arU32: number[];
}

export const ARRAY_TEST_3_ID = 17153;
export const ARRAY_TEST_3_CRC_EXTRA = 19;
export const ARRAY_TEST_3_MIN_LENGTH = 17;
export const ARRAY_TEST_3_MAX_LENGTH = 17;

export function serializeArrayTest3(msg: ArrayTest3): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  // Array: ar_u32
  for (let i = 0; i < 4; i++) {
    view.setUint32(0 + i * 4, msg.arU32[i] ?? 0, true);
  }
  buffer[16] = msg.v & 0xff;

  return buffer;
}

export function deserializeArrayTest3(payload: Uint8Array): ArrayTest3 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    arU32: Array.from({ length: 4 }, (_, i) => view.getUint32(0 + i * 4, true)),
    v: payload[16],
  };
}