/**
 * Report button state change.
 * Message ID: 257
 * CRC Extra: 131
 */
export interface ButtonChange {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Time of last change of button state. (ms) */
  lastChangeMs: number;
  /** Bitmap for state of buttons. */
  state: number;
}

export const BUTTON_CHANGE_ID = 257;
export const BUTTON_CHANGE_CRC_EXTRA = 131;
export const BUTTON_CHANGE_MIN_LENGTH = 9;
export const BUTTON_CHANGE_MAX_LENGTH = 9;

export function serializeButtonChange(msg: ButtonChange): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.lastChangeMs, true);
  buffer[8] = msg.state & 0xff;

  return buffer;
}

export function deserializeButtonChange(payload: Uint8Array): ButtonChange {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    lastChangeMs: view.getUint32(4, true),
    state: payload[8],
  };
}