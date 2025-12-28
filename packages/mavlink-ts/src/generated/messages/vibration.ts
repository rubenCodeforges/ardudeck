/**
 * Vibration levels and accelerometer clipping
 * Message ID: 241
 * CRC Extra: 90
 */
export interface Vibration {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Vibration levels on X-axis */
  vibrationX: number;
  /** Vibration levels on Y-axis */
  vibrationY: number;
  /** Vibration levels on Z-axis */
  vibrationZ: number;
  /** first accelerometer clipping count */
  clipping_0: number;
  /** second accelerometer clipping count */
  clipping_1: number;
  /** third accelerometer clipping count */
  clipping_2: number;
}

export const VIBRATION_ID = 241;
export const VIBRATION_CRC_EXTRA = 90;
export const VIBRATION_MIN_LENGTH = 32;
export const VIBRATION_MAX_LENGTH = 32;

export function serializeVibration(msg: Vibration): Uint8Array {
  const buffer = new Uint8Array(32);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.vibrationX, true);
  view.setFloat32(12, msg.vibrationY, true);
  view.setFloat32(16, msg.vibrationZ, true);
  view.setUint32(20, msg.clipping_0, true);
  view.setUint32(24, msg.clipping_1, true);
  view.setUint32(28, msg.clipping_2, true);

  return buffer;
}

export function deserializeVibration(payload: Uint8Array): Vibration {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    vibrationX: view.getFloat32(8, true),
    vibrationY: view.getFloat32(12, true),
    vibrationZ: view.getFloat32(16, true),
    clipping_0: view.getUint32(20, true),
    clipping_1: view.getUint32(24, true),
    clipping_2: view.getUint32(28, true),
  };
}