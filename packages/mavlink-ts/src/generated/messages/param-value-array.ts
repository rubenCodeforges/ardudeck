/**
 * Parameter multi param value container.
 * Message ID: 60041
 * CRC Extra: 191
 */
export interface ParamValueArray {
  /** Total number of onboard parameters. */
  paramCount: number;
  /** Index of the first onboard parameter in this array. */
  paramIndexFirst: number;
  /** Number of onboard parameters in this array. */
  paramArrayLen: number;
  /** Flags. */
  flags: number;
  /** Parameters buffer. Contains a series of variable length parameter blocks, one per parameter, with format as specified elsewhere. */
  packetBuf: number[];
}

export const PARAM_VALUE_ARRAY_ID = 60041;
export const PARAM_VALUE_ARRAY_CRC_EXTRA = 191;
export const PARAM_VALUE_ARRAY_MIN_LENGTH = 255;
export const PARAM_VALUE_ARRAY_MAX_LENGTH = 255;

export function serializeParamValueArray(msg: ParamValueArray): Uint8Array {
  const buffer = new Uint8Array(255);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.paramCount, true);
  view.setUint16(2, msg.paramIndexFirst, true);
  view.setUint16(4, msg.flags, true);
  buffer[6] = msg.paramArrayLen & 0xff;
  // Array: packet_buf
  for (let i = 0; i < 248; i++) {
    buffer[7 + i * 1] = msg.packetBuf[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeParamValueArray(payload: Uint8Array): ParamValueArray {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramCount: view.getUint16(0, true),
    paramIndexFirst: view.getUint16(2, true),
    flags: view.getUint16(4, true),
    paramArrayLen: payload[6],
    packetBuf: Array.from({ length: 248 }, (_, i) => payload[7 + i * 1]),
  };
}