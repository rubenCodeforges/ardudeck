/**
 * Array test #5.
 * Message ID: 17155
 * CRC Extra: 27
 */
export interface ArrayTest5 {
  /** Value array */
  c1: string;
  /** Value array */
  c2: string;
}

export const ARRAY_TEST_5_ID = 17155;
export const ARRAY_TEST_5_CRC_EXTRA = 27;
export const ARRAY_TEST_5_MIN_LENGTH = 10;
export const ARRAY_TEST_5_MAX_LENGTH = 10;

export function serializeArrayTest5(msg: ArrayTest5): Uint8Array {
  const buffer = new Uint8Array(10);
  const view = new DataView(buffer.buffer);

  // String: c1
  const c1Bytes = new TextEncoder().encode(msg.c1 || '');
  buffer.set(c1Bytes.slice(0, 5), 0);
  // String: c2
  const c2Bytes = new TextEncoder().encode(msg.c2 || '');
  buffer.set(c2Bytes.slice(0, 5), 5);

  return buffer;
}

export function deserializeArrayTest5(payload: Uint8Array): ArrayTest5 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    c1: new TextDecoder().decode(payload.slice(0, 5)).replace(/\0.*$/, ''),
    c2: new TextDecoder().decode(payload.slice(5, 10)).replace(/\0.*$/, ''),
  };
}