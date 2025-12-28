/**
 * This message informs about the currently active SCRIPT.
 * Message ID: 184
 * CRC Extra: 40
 */
export interface ScriptCurrent {
  /** Active Sequence */
  seq: number;
}

export const SCRIPT_CURRENT_ID = 184;
export const SCRIPT_CURRENT_CRC_EXTRA = 40;
export const SCRIPT_CURRENT_MIN_LENGTH = 2;
export const SCRIPT_CURRENT_MAX_LENGTH = 2;

export function serializeScriptCurrent(msg: ScriptCurrent): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);

  return buffer;
}

export function deserializeScriptCurrent(payload: Uint8Array): ScriptCurrent {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
  };
}