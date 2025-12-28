/**
 * This message is emitted as response to SCRIPT_REQUEST_LIST by the MAV to get the number of mission scripts.
 * Message ID: 183
 * CRC Extra: 186
 */
export interface ScriptCount {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Number of script items in the sequence */
  count: number;
}

export const SCRIPT_COUNT_ID = 183;
export const SCRIPT_COUNT_CRC_EXTRA = 186;
export const SCRIPT_COUNT_MIN_LENGTH = 4;
export const SCRIPT_COUNT_MAX_LENGTH = 4;

export function serializeScriptCount(msg: ScriptCount): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.count, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeScriptCount(payload: Uint8Array): ScriptCount {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    count: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
  };
}