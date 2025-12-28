/**
 * Send a key-value pair as float. The use of this message is discouraged for normal packets, but a quite efficient way for testing new messages and getting experimental debug output.
 * Message ID: 251
 * CRC Extra: 170
 */
export interface NamedValueFloat {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Name of the debug variable */
  name: string;
  /** Floating point value */
  value: number;
}

export const NAMED_VALUE_FLOAT_ID = 251;
export const NAMED_VALUE_FLOAT_CRC_EXTRA = 170;
export const NAMED_VALUE_FLOAT_MIN_LENGTH = 18;
export const NAMED_VALUE_FLOAT_MAX_LENGTH = 18;

export function serializeNamedValueFloat(msg: NamedValueFloat): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.value, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 10), 8);

  return buffer;
}

export function deserializeNamedValueFloat(payload: Uint8Array): NamedValueFloat {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    value: view.getFloat32(4, true),
    name: new TextDecoder().decode(payload.slice(8, 18)).replace(/\0.*$/, ''),
  };
}