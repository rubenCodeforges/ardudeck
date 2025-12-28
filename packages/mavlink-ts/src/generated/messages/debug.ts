/**
 * Send a debug value. The index is used to discriminate between values. These values show up in the plot of QGroundControl as DEBUG N.
 * Message ID: 254
 * CRC Extra: 46
 */
export interface Debug {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** index of debug variable */
  ind: number;
  /** DEBUG value */
  value: number;
}

export const DEBUG_ID = 254;
export const DEBUG_CRC_EXTRA = 46;
export const DEBUG_MIN_LENGTH = 9;
export const DEBUG_MAX_LENGTH = 9;

export function serializeDebug(msg: Debug): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.value, true);
  buffer[8] = msg.ind & 0xff;

  return buffer;
}

export function deserializeDebug(payload: Uint8Array): Debug {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    value: view.getFloat32(4, true),
    ind: payload[8],
  };
}