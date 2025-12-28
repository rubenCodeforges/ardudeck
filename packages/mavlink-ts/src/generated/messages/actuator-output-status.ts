/**
 * The raw values of the actuator outputs (e.g. on Pixhawk, from MAIN, AUX ports). This message supersedes SERVO_OUTPUT_RAW.
 * Message ID: 375
 * CRC Extra: 251
 */
export interface ActuatorOutputStatus {
  /** Timestamp (since system boot). (us) */
  timeUsec: bigint;
  /** Active outputs */
  active: number;
  /** Servo / motor output array values. Zero values indicate unused channels. */
  actuator: number[];
}

export const ACTUATOR_OUTPUT_STATUS_ID = 375;
export const ACTUATOR_OUTPUT_STATUS_CRC_EXTRA = 251;
export const ACTUATOR_OUTPUT_STATUS_MIN_LENGTH = 140;
export const ACTUATOR_OUTPUT_STATUS_MAX_LENGTH = 140;

export function serializeActuatorOutputStatus(msg: ActuatorOutputStatus): Uint8Array {
  const buffer = new Uint8Array(140);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.active, true);
  // Array: actuator
  for (let i = 0; i < 32; i++) {
    view.setFloat32(12 + i * 4, msg.actuator[i] ?? 0, true);
  }

  return buffer;
}

export function deserializeActuatorOutputStatus(payload: Uint8Array): ActuatorOutputStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    active: view.getUint32(8, true),
    actuator: Array.from({ length: 32 }, (_, i) => view.getFloat32(12 + i * 4, true)),
  };
}