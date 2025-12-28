/**
 * Request the overall list of mission items from the system/component.
 * Message ID: 182
 * CRC Extra: 115
 */
export interface ScriptRequestList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const SCRIPT_REQUEST_LIST_ID = 182;
export const SCRIPT_REQUEST_LIST_CRC_EXTRA = 115;
export const SCRIPT_REQUEST_LIST_MIN_LENGTH = 2;
export const SCRIPT_REQUEST_LIST_MAX_LENGTH = 2;

export function serializeScriptRequestList(msg: ScriptRequestList): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeScriptRequestList(payload: Uint8Array): ScriptRequestList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}