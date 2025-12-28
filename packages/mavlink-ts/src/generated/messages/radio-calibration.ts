/**
 * Complete set of calibration parameters for the radio
 * Message ID: 221
 * CRC Extra: 71
 */
export interface RadioCalibration {
  /** Aileron setpoints: left, center, right */
  aileron: number[];
  /** Elevator setpoints: nose down, center, nose up */
  elevator: number[];
  /** Rudder setpoints: nose left, center, nose right */
  rudder: number[];
  /** Tail gyro mode/gain setpoints: heading hold, rate mode */
  gyro: number[];
  /** Pitch curve setpoints (every 25%) */
  pitch: number[];
  /** Throttle curve setpoints (every 25%) */
  throttle: number[];
}

export const RADIO_CALIBRATION_ID = 221;
export const RADIO_CALIBRATION_CRC_EXTRA = 71;
export const RADIO_CALIBRATION_MIN_LENGTH = 42;
export const RADIO_CALIBRATION_MAX_LENGTH = 42;

export function serializeRadioCalibration(msg: RadioCalibration): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  // Array: aileron
  for (let i = 0; i < 3; i++) {
    view.setUint16(0 + i * 2, msg.aileron[i] ?? 0, true);
  }
  // Array: elevator
  for (let i = 0; i < 3; i++) {
    view.setUint16(6 + i * 2, msg.elevator[i] ?? 0, true);
  }
  // Array: rudder
  for (let i = 0; i < 3; i++) {
    view.setUint16(12 + i * 2, msg.rudder[i] ?? 0, true);
  }
  // Array: gyro
  for (let i = 0; i < 2; i++) {
    view.setUint16(18 + i * 2, msg.gyro[i] ?? 0, true);
  }
  // Array: pitch
  for (let i = 0; i < 5; i++) {
    view.setUint16(22 + i * 2, msg.pitch[i] ?? 0, true);
  }
  // Array: throttle
  for (let i = 0; i < 5; i++) {
    view.setUint16(32 + i * 2, msg.throttle[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeRadioCalibration(payload: Uint8Array): RadioCalibration {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    aileron: Array.from({ length: 3 }, (_, i) => view.getUint16(0 + i * 2, true)),
    elevator: Array.from({ length: 3 }, (_, i) => view.getUint16(6 + i * 2, true)),
    rudder: Array.from({ length: 3 }, (_, i) => view.getUint16(12 + i * 2, true)),
    gyro: Array.from({ length: 2 }, (_, i) => view.getUint16(18 + i * 2, true)),
    pitch: Array.from({ length: 5 }, (_, i) => view.getUint16(22 + i * 2, true)),
    throttle: Array.from({ length: 5 }, (_, i) => view.getUint16(32 + i * 2, true)),
  };
}