/**
 * Request a GOPRO_COMMAND response from the GoPro.
 * Message ID: 216
 * CRC Extra: 50
 */
export interface GoproGetRequest {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Command ID. */
  cmdId: number;
}

export const GOPRO_GET_REQUEST_ID = 216;
export const GOPRO_GET_REQUEST_CRC_EXTRA = 50;
export const GOPRO_GET_REQUEST_MIN_LENGTH = 3;
export const GOPRO_GET_REQUEST_MAX_LENGTH = 3;

export function serializeGoproGetRequest(msg: GoproGetRequest): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.cmdId & 0xff;

  return buffer;
}

export function deserializeGoproGetRequest(payload: Uint8Array): GoproGetRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    cmdId: payload[2],
  };
}