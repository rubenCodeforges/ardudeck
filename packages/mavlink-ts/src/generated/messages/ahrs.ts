/**
 * Status of DCM attitude estimator.
 * Message ID: 163
 * CRC Extra: 127
 */
export interface Ahrs {
  /** X gyro drift estimate. (rad/s) */
  omegaix: number;
  /** Y gyro drift estimate. (rad/s) */
  omegaiy: number;
  /** Z gyro drift estimate. (rad/s) */
  omegaiz: number;
  /** Average accel_weight. */
  accelWeight: number;
  /** Average renormalisation value. */
  renormVal: number;
  /** Average error_roll_pitch value. */
  errorRp: number;
  /** Average error_yaw value. */
  errorYaw: number;
}

export const AHRS_ID = 163;
export const AHRS_CRC_EXTRA = 127;
export const AHRS_MIN_LENGTH = 28;
export const AHRS_MAX_LENGTH = 28;

export function serializeAhrs(msg: Ahrs): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.omegaix, true);
  view.setFloat32(4, msg.omegaiy, true);
  view.setFloat32(8, msg.omegaiz, true);
  view.setFloat32(12, msg.accelWeight, true);
  view.setFloat32(16, msg.renormVal, true);
  view.setFloat32(20, msg.errorRp, true);
  view.setFloat32(24, msg.errorYaw, true);

  return buffer;
}

export function deserializeAhrs(payload: Uint8Array): Ahrs {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    omegaix: view.getFloat32(0, true),
    omegaiy: view.getFloat32(4, true),
    omegaiz: view.getFloat32(8, true),
    accelWeight: view.getFloat32(12, true),
    renormVal: view.getFloat32(16, true),
    errorRp: view.getFloat32(20, true),
    errorYaw: view.getFloat32(24, true),
  };
}