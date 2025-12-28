/**
 * Extended state information for ASLUAVs
 * Message ID: 8006
 * CRC Extra: 97
 */
export interface AsluavStatus {
  /** Status of the position-indicator LEDs */
  ledStatus: number;
  /** Status of the IRIDIUM satellite communication system */
  satcomStatus: number;
  /** Status vector for up to 8 servos */
  servoStatus: number[];
  /** Motor RPM */
  motorRpm: number;
}

export const ASLUAV_STATUS_ID = 8006;
export const ASLUAV_STATUS_CRC_EXTRA = 97;
export const ASLUAV_STATUS_MIN_LENGTH = 14;
export const ASLUAV_STATUS_MAX_LENGTH = 14;

export function serializeAsluavStatus(msg: AsluavStatus): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.motorRpm, true);
  buffer[4] = msg.ledStatus & 0xff;
  buffer[5] = msg.satcomStatus & 0xff;
  // Array: Servo_status
  for (let i = 0; i < 8; i++) {
    buffer[6 + i * 1] = msg.servoStatus[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeAsluavStatus(payload: Uint8Array): AsluavStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    motorRpm: view.getFloat32(0, true),
    ledStatus: payload[4],
    satcomStatus: payload[5],
    servoStatus: Array.from({ length: 8 }, (_, i) => payload[6 + i * 1]),
  };
}