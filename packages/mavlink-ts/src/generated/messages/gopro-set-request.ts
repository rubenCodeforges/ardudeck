/**
 * Request to set a GOPRO_COMMAND with a desired.
 * Message ID: 218
 * CRC Extra: 17
 */
export interface GoproSetRequest {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Command ID. */
  cmdId: number;
  /** Value. */
  value: number[];
}

export const GOPRO_SET_REQUEST_ID = 218;
export const GOPRO_SET_REQUEST_CRC_EXTRA = 17;
export const GOPRO_SET_REQUEST_MIN_LENGTH = 7;
export const GOPRO_SET_REQUEST_MAX_LENGTH = 7;

export function serializeGoproSetRequest(msg: GoproSetRequest): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.cmdId & 0xff;
  // Array: value
  for (let i = 0; i < 4; i++) {
    buffer[3 + i * 1] = msg.value[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeGoproSetRequest(payload: Uint8Array): GoproSetRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    cmdId: payload[2],
    value: Array.from({ length: 4 }, (_, i) => payload[3 + i * 1]),
  };
}