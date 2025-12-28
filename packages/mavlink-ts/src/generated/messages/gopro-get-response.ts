/**
 * Response from a GOPRO_COMMAND get request.
 * Message ID: 217
 * CRC Extra: 202
 */
export interface GoproGetResponse {
  /** Command ID. */
  cmdId: number;
  /** Status. */
  status: number;
  /** Value. */
  value: number[];
}

export const GOPRO_GET_RESPONSE_ID = 217;
export const GOPRO_GET_RESPONSE_CRC_EXTRA = 202;
export const GOPRO_GET_RESPONSE_MIN_LENGTH = 6;
export const GOPRO_GET_RESPONSE_MAX_LENGTH = 6;

export function serializeGoproGetResponse(msg: GoproGetResponse): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.cmdId & 0xff;
  buffer[1] = msg.status & 0xff;
  // Array: value
  for (let i = 0; i < 4; i++) {
    buffer[2 + i * 1] = msg.value[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeGoproGetResponse(payload: Uint8Array): GoproGetResponse {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    cmdId: payload[0],
    status: payload[1],
    value: Array.from({ length: 4 }, (_, i) => payload[2 + i * 1]),
  };
}