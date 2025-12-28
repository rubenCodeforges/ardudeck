/**
 * Authorization package
 * Message ID: 52000
 * CRC Extra: 13
 */
export interface AirlinkAuth {
  /** Login */
  login: string;
  /** Password */
  password: string;
}

export const AIRLINK_AUTH_ID = 52000;
export const AIRLINK_AUTH_CRC_EXTRA = 13;
export const AIRLINK_AUTH_MIN_LENGTH = 100;
export const AIRLINK_AUTH_MAX_LENGTH = 100;

export function serializeAirlinkAuth(msg: AirlinkAuth): Uint8Array {
  const buffer = new Uint8Array(100);
  const view = new DataView(buffer.buffer);

  // String: login
  const loginBytes = new TextEncoder().encode(msg.login || '');
  buffer.set(loginBytes.slice(0, 50), 0);
  // String: password
  const passwordBytes = new TextEncoder().encode(msg.password || '');
  buffer.set(passwordBytes.slice(0, 50), 50);

  return buffer;
}

export function deserializeAirlinkAuth(payload: Uint8Array): AirlinkAuth {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    login: new TextDecoder().decode(payload.slice(0, 50)).replace(/\0.*$/, ''),
    password: new TextDecoder().decode(payload.slice(50, 100)).replace(/\0.*$/, ''),
  };
}