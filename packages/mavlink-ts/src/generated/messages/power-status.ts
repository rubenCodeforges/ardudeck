/**
 * Power supply status
 * Message ID: 125
 * CRC Extra: 203
 */
export interface PowerStatus {
  /** 5V rail voltage. (mV) */
  vcc: number;
  /** Servo rail voltage. (mV) */
  vservo: number;
  /** Bitmap of power supply status flags. */
  flags: number;
}

export const POWER_STATUS_ID = 125;
export const POWER_STATUS_CRC_EXTRA = 203;
export const POWER_STATUS_MIN_LENGTH = 6;
export const POWER_STATUS_MAX_LENGTH = 6;

export function serializePowerStatus(msg: PowerStatus): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.vcc, true);
  view.setUint16(2, msg.vservo, true);
  view.setUint16(4, msg.flags, true);

  return buffer;
}

export function deserializePowerStatus(payload: Uint8Array): PowerStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    vcc: view.getUint16(0, true),
    vservo: view.getUint16(2, true),
    flags: view.getUint16(4, true),
  };
}