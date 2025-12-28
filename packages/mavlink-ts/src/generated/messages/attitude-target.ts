/**
 * Reports the current commanded attitude of the vehicle as specified by the autopilot. This should match the commands sent in a SET_ATTITUDE_TARGET message if the vehicle is being controlled this way.
 * Message ID: 83
 * CRC Extra: 22
 */
export interface AttitudeTarget {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
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

export const ATTITUDE_TARGET_ID = 83;
export const ATTITUDE_TARGET_CRC_EXTRA = 22;
export const ATTITUDE_TARGET_MIN_LENGTH = 37;
export const ATTITUDE_TARGET_MAX_LENGTH = 37;

export function serializeAttitudeTarget(msg: AttitudeTarget): Uint8Array {
  const buffer = new Uint8Array(37);
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
  buffer[36] = msg.typeMask & 0xff;

  return buffer;
}

export function deserializeAttitudeTarget(payload: Uint8Array): AttitudeTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(4 + i * 4, true)),
    bodyRollRate: view.getFloat32(20, true),
    bodyPitchRate: view.getFloat32(24, true),
    bodyYawRate: view.getFloat32(28, true),
    thrust: view.getFloat32(32, true),
    typeMask: payload[36],
  };
}