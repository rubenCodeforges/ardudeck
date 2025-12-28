/**
 * Large debug/prototyping array. The message uses the maximum available payload for data. The array_id and name fields are used to discriminate between messages in code and in user interfaces (respectively). Do not use in production code.
 * Message ID: 350
 * CRC Extra: 68
 */
export interface DebugFloatArray {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Name, for human-friendly display in a Ground Control Station */
  name: string;
  /** Unique ID used to discriminate between arrays */
  arrayId: number;
  /** data */
  data: number[];
}

export const DEBUG_FLOAT_ARRAY_ID = 350;
export const DEBUG_FLOAT_ARRAY_CRC_EXTRA = 68;
export const DEBUG_FLOAT_ARRAY_MIN_LENGTH = 252;
export const DEBUG_FLOAT_ARRAY_MAX_LENGTH = 252;

export function serializeDebugFloatArray(msg: DebugFloatArray): Uint8Array {
  const buffer = new Uint8Array(252);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: data
  for (let i = 0; i < 58; i++) {
    view.setFloat32(8 + i * 4, msg.data[i] ?? 0, true);
  }
  view.setUint16(240, msg.arrayId, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 10), 242);

  return buffer;
}

export function deserializeDebugFloatArray(payload: Uint8Array): DebugFloatArray {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    data: Array.from({ length: 58 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    arrayId: view.getUint16(240, true),
    name: new TextDecoder().decode(payload.slice(242, 252)).replace(/\0.*$/, ''),
  };
}