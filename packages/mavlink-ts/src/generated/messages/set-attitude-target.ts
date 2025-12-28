/**
 * Sets a desired vehicle attitude. Used by an external controller to command the vehicle (manual controller or other system).
 * Message ID: 82
 * CRC Extra: 49
 */
export interface SetAttitudeTarget {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Bitmap to indicate which dimensions should be ignored by the vehicle. */
  typeMask: number;
  /** Attitude quaternion (w, x, y, z order, zero-rotation is 1, 0, 0, 0) */
  q: number[];
  /** Body roll rate (rad/s) */
  bodyRollRate: number;
  /** Body pitch rate (rad/s) */
  bodyPitchRate: number;
  /** Body yaw rate (rad/s) */
  bodyYawRate: number;
  /** Collective thrust, normalized to 0 .. 1 (-1 .. 1 for vehicles capable of reverse trust) */
  thrust: number;
}

export const SET_ATTITUDE_TARGET_ID = 82;
export const SET_ATTITUDE_TARGET_CRC_EXTRA = 49;
export const SET_ATTITUDE_TARGET_MIN_LENGTH = 39;
export const SET_ATTITUDE_TARGET_MAX_LENGTH = 39;

export function serializeSetAttitudeTarget(msg: SetAttitudeTarget): Uint8Array {
  const buffer = new Uint8Array(39);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(4 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(20, msg.bodyRollRate, true);
  view.setFloat32(24, msg.bodyPitchRate, true);
  view.setFloat32(28, msg.bodyYawRate, true);
  view.setFloat32(32, msg.thrust, true);
  buffer[36] = msg.targetSystem & 0xff;
  buffer[37] = msg.targetComponent & 0xff;
  buffer[38] = msg.typeMask & 0xff;

  return buffer;
}

export function deserializeSetAttitudeTarget(payload: Uint8Array): SetAttitudeTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(4 + i * 4, true)),
    bodyRollRate: view.getFloat32(20, true),
    bodyPitchRate: view.getFloat32(24, true),
    bodyYawRate: view.getFloat32(28, true),
    thrust: view.getFloat32(32, true),
    targetSystem: payload[36],
    targetComponent: payload[37],
    typeMask: payload[38],
  };
}