/**
 * Message encoding a mission script item. This message is emitted upon a request for the next script item.
 * Message ID: 180
 * CRC Extra: 231
 */
export interface ScriptItem {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
  seq: number;
  /** The name of the mission script, NULL terminated. */
  name: string;
}

export const SCRIPT_ITEM_ID = 180;
export const SCRIPT_ITEM_CRC_EXTRA = 231;
export const SCRIPT_ITEM_MIN_LENGTH = 54;
export const SCRIPT_ITEM_MAX_LENGTH = 54;

export function serializeScriptItem(msg: ScriptItem): Uint8Array {
  const buffer = new Uint8Array(54);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 50), 4);

  return buffer;
}

export function deserializeScriptItem(payload: Uint8Array): ScriptItem {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    name: new TextDecoder().decode(payload.slice(4, 54)).replace(/\0.*$/, ''),
  };
}