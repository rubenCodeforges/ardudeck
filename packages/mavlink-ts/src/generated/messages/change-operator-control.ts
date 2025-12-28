/**
 * Request to control this MAV
 * Message ID: 5
 * CRC Extra: 217
 */
export interface ChangeOperatorControl {
  /** System the GCS requests control for */
  targetSystem: number;
  /** 0: request control of this MAV, 1: Release control of this MAV */
  controlRequest: number;
  /** 0: key as plaintext, 1-255: future, different hashing/encryption variants. The GCS should in general use the safest mode possible initially and then gradually move down the encryption level if it gets a NACK message indicating an encryption mismatch. (rad) */
  version: number;
  /** Password / Key, depending on version plaintext or encrypted. 25 or less characters, NULL terminated. The characters may involve A-Z, a-z, 0-9, and "!?,.-" */
  passkey: string;
}

export const CHANGE_OPERATOR_CONTROL_ID = 5;
export const CHANGE_OPERATOR_CONTROL_CRC_EXTRA = 217;
export const CHANGE_OPERATOR_CONTROL_MIN_LENGTH = 28;
export const CHANGE_OPERATOR_CONTROL_MAX_LENGTH = 28;

export function serializeChangeOperatorControl(msg: ChangeOperatorControl): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.controlRequest & 0xff;
  buffer[2] = msg.version & 0xff;
  // String: passkey
  const passkeyBytes = new TextEncoder().encode(msg.passkey || '');
  buffer.set(passkeyBytes.slice(0, 25), 3);

  return buffer;
}

export function deserializeChangeOperatorControl(payload: Uint8Array): ChangeOperatorControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    controlRequest: payload[1],
    version: payload[2],
    passkey: new TextDecoder().decode(payload.slice(3, 28)).replace(/\0.*$/, ''),
  };
}