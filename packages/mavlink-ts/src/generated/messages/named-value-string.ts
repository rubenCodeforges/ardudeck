/**
 * Send a key-value pair as string. The use of this message is discouraged for normal packets, but a quite efficient way for testing new messages and getting experimental debug output.
 * Message ID: 11060
 * CRC Extra: 162
 */
export interface NamedValueString {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Name of the debug variable */
  name: string;
  /** Value of the debug variable */
  value: string;
}

export const NAMED_VALUE_STRING_ID = 11060;
export const NAMED_VALUE_STRING_CRC_EXTRA = 162;
export const NAMED_VALUE_STRING_MIN_LENGTH = 78;
export const NAMED_VALUE_STRING_MAX_LENGTH = 78;

export function serializeNamedValueString(msg: NamedValueString): Uint8Array {
  const buffer = new Uint8Array(78);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 10), 4);
  // String: value
  const valueBytes = new TextEncoder().encode(msg.value || '');
  buffer.set(valueBytes.slice(0, 64), 14);

  return buffer;
}

export function deserializeNamedValueString(payload: Uint8Array): NamedValueString {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    name: new TextDecoder().decode(payload.slice(4, 14)).replace(/\0.*$/, ''),
    value: new TextDecoder().decode(payload.slice(14, 78)).replace(/\0.*$/, ''),
  };
}