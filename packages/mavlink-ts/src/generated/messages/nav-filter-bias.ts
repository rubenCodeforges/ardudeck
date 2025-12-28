/**
 * Accelerometer and Gyro biases from the navigation filter
 * Message ID: 220
 * CRC Extra: 34
 */
export interface NavFilterBias {
  /** Timestamp (microseconds) */
  usec: bigint;
  /** b_f[0] */
  accel_0: number;
  /** b_f[1] */
  accel_1: number;
  /** b_f[2] */
  accel_2: number;
  /** b_f[0] */
  gyro_0: number;
  /** b_f[1] */
  gyro_1: number;
  /** b_f[2] */
  gyro_2: number;
}

export const NAV_FILTER_BIAS_ID = 220;
export const NAV_FILTER_BIAS_CRC_EXTRA = 34;
export const NAV_FILTER_BIAS_MIN_LENGTH = 32;
export const NAV_FILTER_BIAS_MAX_LENGTH = 32;

export function serializeNavFilterBias(msg: NavFilterBias): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.usec), true);
  view.setFloat32(8, msg.accel_0, true);
  view.setFloat32(12, msg.accel_1, true);
  view.setFloat32(16, msg.accel_2, true);
  view.setFloat32(20, msg.gyro_0, true);
  view.setFloat32(24, msg.gyro_1, true);
  view.setFloat32(28, msg.gyro_2, true);

  return buffer;
}

export function deserializeNavFilterBias(payload: Uint8Array): NavFilterBias {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    usec: view.getBigUint64(0, true),
    accel_0: view.getFloat32(8, true),
    accel_1: view.getFloat32(12, true),
    accel_2: view.getFloat32(16, true),
    gyro_0: view.getFloat32(20, true),
    gyro_1: view.getFloat32(24, true),
    gyro_2: view.getFloat32(28, true),
  };
}