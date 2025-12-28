/**
 * Raw RC Data
 * Message ID: 50001
 * CRC Extra: 246
 */
export interface CubepilotRawRc {
  rcRaw: number[];
}

export const CUBEPILOT_RAW_RC_ID = 50001;
export const CUBEPILOT_RAW_RC_CRC_EXTRA = 246;
export const CUBEPILOT_RAW_RC_MIN_LENGTH = 32;
export const CUBEPILOT_RAW_RC_MAX_LENGTH = 32;

export function serializeCubepilotRawRc(msg: CubepilotRawRc): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  // Array: rc_raw
  for (let i = 0; i < 32; i++) {
    buffer[0 + i * 1] = msg.rcRaw[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeCubepilotRawRc(payload: Uint8Array): CubepilotRawRc {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    rcRaw: Array.from({ length: 32 }, (_, i) => payload[0 + i * 1]),
  };
}