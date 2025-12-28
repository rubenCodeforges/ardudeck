/**
 * Send a key-value pair as integer. The use of this message is discouraged for normal packets, but a quite efficient way for testing new messages and getting experimental debug output.
 * Message ID: 252
 * CRC Extra: 44
 */
export interface NamedValueInt {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Name of the debug variable */
  name: string;
  /** Signed integer value */
  value: number;
}

export const NAMED_VALUE_INT_ID = 252;
export const NAMED_VALUE_INT_CRC_EXTRA = 44;
export const NAMED_VALUE_INT_MIN_LENGTH = 18;
export const NAMED_VALUE_INT_MAX_LENGTH = 18;

export function serializeNamedValueInt(msg: NamedValueInt): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.value, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 10), 8);

  return buffer;
}

export function deserializeNamedValueInt(payload: Uint8Array): NamedValueInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    value: view.getInt32(4, true),
    name: new TextDecoder().decode(payload.slice(8, 18)).replace(/\0.*$/, ''),
  };
}