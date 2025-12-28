/**
 * Emit an encrypted signature / key identifying this system. PLEASE NOTE: This protocol has been kept simple, so transmitting the key requires an encrypted channel for true safety.
 * Message ID: 7
 * CRC Extra: 119
 */
export interface AuthKey {
  /** key */
  key: string;
}

export const AUTH_KEY_ID = 7;
export const AUTH_KEY_CRC_EXTRA = 119;
export const AUTH_KEY_MIN_LENGTH = 32;
export const AUTH_KEY_MAX_LENGTH = 32;

export function serializeAuthKey(msg: AuthKey): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  // String: key
  const keyBytes = new TextEncoder().encode(msg.key || '');
  buffer.set(keyBytes.slice(0, 32), 0);

  return buffer;
}

export function deserializeAuthKey(payload: Uint8Array): AuthKey {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    key: new TextDecoder().decode(payload.slice(0, 32)).replace(/\0.*$/, ''),
  };
}