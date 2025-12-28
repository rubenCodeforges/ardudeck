/**
 * Status of key hardware.
 * Message ID: 165
 * CRC Extra: 21
 */
export interface Hwstatus {
  /** Board voltage. (mV) */
  vcc: number;
  /** I2C error count. */
  i2cerr: number;
}

export const HWSTATUS_ID = 165;
export const HWSTATUS_CRC_EXTRA = 21;
export const HWSTATUS_MIN_LENGTH = 3;
export const HWSTATUS_MAX_LENGTH = 3;

export function serializeHwstatus(msg: Hwstatus): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.vcc, true);
  buffer[2] = msg.i2cerr & 0xff;

  return buffer;
}

export function deserializeHwstatus(payload: Uint8Array): Hwstatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    vcc: view.getUint16(0, true),
    i2cerr: payload[2],
  };
}