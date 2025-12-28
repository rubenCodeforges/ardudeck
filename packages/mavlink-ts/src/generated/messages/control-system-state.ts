/**
 * The smoothed, monotonic system state used to feed the control loops of the system.
 * Message ID: 146
 * CRC Extra: 103
 */
export interface ControlSystemState {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** X acceleration in body frame (m/s/s) */
  xAcc: number;
  /** Y acceleration in body frame (m/s/s) */
  yAcc: number;
  /** Z acceleration in body frame (m/s/s) */
  zAcc: number;
  /** X velocity in body frame (m/s) */
  xVel: number;
  /** Y velocity in body frame (m/s) */
  yVel: number;
  /** Z velocity in body frame (m/s) */
  zVel: number;
  /** X position in local frame (m) */
  xPos: number;
  /** Y position in local frame (m) */
  yPos: number;
  /** Z position in local frame (m) */
  zPos: number;
  /** Airspeed, set to -1 if unknown (m/s) */
  airspeed: number;
  /** Variance of body velocity estimate */
  velVariance: number[];
  /** Variance in local position */
  posVariance: number[];
  /** The attitude, represented as Quaternion */
  q: number[];
  /** Angular rate in roll axis (rad/s) */
  rollRate: number;
  /** Angular rate in pitch axis (rad/s) */
  pitchRate: number;
  /** Angular rate in yaw axis (rad/s) */
  yawRate: number;
}

export const CONTROL_SYSTEM_STATE_ID = 146;
export const CONTROL_SYSTEM_STATE_CRC_EXTRA = 103;
export const CONTROL_SYSTEM_STATE_MIN_LENGTH = 100;
export const CONTROL_SYSTEM_STATE_MAX_LENGTH = 100;

export function serializeControlSystemState(msg: ControlSystemState): Uint8Array {
  const buffer = new Uint8Array(100);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.xAcc, true);
  view.setFloat32(12, msg.yAcc, true);
  view.setFloat32(16, msg.zAcc, true);
  view.setFloat32(20, msg.xVel, true);
  view.setFloat32(24, msg.yVel, true);
  view.setFloat32(28, msg.zVel, true);
  view.setFloat32(32, msg.xPos, true);
  view.setFloat32(36, msg.yPos, true);
  view.setFloat32(40, msg.zPos, true);
  view.setFloat32(44, msg.airspeed, true);
  // Array: vel_variance
  for (let i = 0; i < 3; i++) {
    view.setFloat32(48 + i * 4, msg.velVariance[i] ?? 0, true);
  }
  // Array: pos_variance
  for (let i = 0; i < 3; i++) {
    view.setFloat32(60 + i * 4, msg.posVariance[i] ?? 0, true);
  }
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(72 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(88, msg.rollRate, true);
  view.setFloat32(92, msg.pitchRate, true);
  view.setFloat32(96, msg.yawRate, true);

  return buffer;
}

export function deserializeControlSystemState(payload: Uint8Array): ControlSystemState {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    xAcc: view.getFloat32(8, true),
    yAcc: view.getFloat32(12, true),
    zAcc: view.getFloat32(16, true),
    xVel: view.getFloat32(20, true),
    yVel: view.getFloat32(24, true),
    zVel: view.getFloat32(28, true),
    xPos: view.getFloat32(32, true),
    yPos: view.getFloat32(36, true),
    zPos: view.getFloat32(40, true),
    airspeed: view.getFloat32(44, true),
    velVariance: Array.from({ length: 3 }, (_, i) => view.getFloat32(48 + i * 4, true)),
    posVariance: Array.from({ length: 3 }, (_, i) => view.getFloat32(60 + i * 4, true)),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(72 + i * 4, true)),
    rollRate: view.getFloat32(88, true),
    pitchRate: view.getFloat32(92, true),
    yawRate: view.getFloat32(96, true),
  };
}