/**
 * Response to the authorization request
 * Message ID: 52001
 * CRC Extra: 239
 */
export interface AirlinkAuthResponse {
  /** Response type */
  respType: number;
}

export const AIRLINK_AUTH_RESPONSE_ID = 52001;
export const AIRLINK_AUTH_RESPONSE_CRC_EXTRA = 239;
export const AIRLINK_AUTH_RESPONSE_MIN_LENGTH = 1;
export const AIRLINK_AUTH_RESPONSE_MAX_LENGTH = 1;

export function serializeAirlinkAuthResponse(msg: AirlinkAuthResponse): Uint8Array {
  const buffer = new Uint8Array(1);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.respType & 0xff;

  return buffer;
}

export function deserializeAirlinkAuthResponse(payload: Uint8Array): AirlinkAuthResponse {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    respType: payload[0],
  };
}