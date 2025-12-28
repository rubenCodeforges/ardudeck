/**
 * Response from a GOPRO_COMMAND set request.
 * Message ID: 219
 * CRC Extra: 162
 */
export interface GoproSetResponse {
  /** Command ID. */
  cmdId: number;
  /** Status. */
  status: number;
}

export const GOPRO_SET_RESPONSE_ID = 219;
export const GOPRO_SET_RESPONSE_CRC_EXTRA = 162;
export const GOPRO_SET_RESPONSE_MIN_LENGTH = 2;
export const GOPRO_SET_RESPONSE_MAX_LENGTH = 2;

export function serializeGoproSetResponse(msg: GoproSetResponse): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.cmdId & 0xff;
  buffer[1] = msg.status & 0xff;

  return buffer;
}

export function deserializeGoproSetResponse(payload: Uint8Array): GoproSetResponse {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    cmdId: payload[0],
    status: payload[1],
  };
}