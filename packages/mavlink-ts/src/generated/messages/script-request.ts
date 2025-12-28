/**
 * Request script item with the sequence number seq. The response of the system to this message should be a SCRIPT_ITEM message.
 * Message ID: 181
 * CRC Extra: 129
 */
export interface ScriptRequest {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Sequence */
  seq: number;
}

export const SCRIPT_REQUEST_ID = 181;
export const SCRIPT_REQUEST_CRC_EXTRA = 129;
export const SCRIPT_REQUEST_MIN_LENGTH = 4;
export const SCRIPT_REQUEST_MAX_LENGTH = 4;

export function serializeScriptRequest(msg: ScriptRequest): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeScriptRequest(payload: Uint8Array): ScriptRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
  };
}