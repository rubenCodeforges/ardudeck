/**
 * Describe a trajectory using an array of up-to 5 bezier control points in the local frame (MAV_FRAME_LOCAL_NED).
 * Message ID: 333
 * CRC Extra: 231
 */
export interface TrajectoryRepresentationBezier {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Number of valid control points (up-to 5 points are possible) */
  validPoints: number;
  /** X-coordinate of bezier control points. Set to NaN if not being used (m) */
  posX: number[];
  /** Y-coordinate of bezier control points. Set to NaN if not being used (m) */
  posY: number[];
  /** Z-coordinate of bezier control points. Set to NaN if not being used (m) */
  posZ: number[];
  /** Bezier time horizon. Set to NaN if velocity/acceleration should not be incorporated (s) */
  delta: number[];
  /** Yaw. Set to NaN for unchanged (rad) */
  posYaw: number[];
}

export const TRAJECTORY_REPRESENTATION_BEZIER_ID = 333;
export const TRAJECTORY_REPRESENTATION_BEZIER_CRC_EXTRA = 231;
export const TRAJECTORY_REPRESENTATION_BEZIER_MIN_LENGTH = 109;
export const TRAJECTORY_REPRESENTATION_BEZIER_MAX_LENGTH = 109;

export function serializeTrajectoryRepresentationBezier(msg: TrajectoryRepresentationBezier): Uint8Array {
  const buffer = new Uint8Array(109);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: pos_x
  for (let i = 0; i < 5; i++) {
    view.setFloat32(8 + i * 4, msg.posX[i] ?? 0, true);
  }
  // Array: pos_y
  for (let i = 0; i < 5; i++) {
    view.setFloat32(28 + i * 4, msg.posY[i] ?? 0, true);
  }
  // Array: pos_z
  for (let i = 0; i < 5; i++) {
    view.setFloat32(48 + i * 4, msg.posZ[i] ?? 0, true);
  }
  // Array: delta
  for (let i = 0; i < 5; i++) {
    view.setFloat32(68 + i * 4, msg.delta[i] ?? 0, true);
  }
  // Array: pos_yaw
  for (let i = 0; i < 5; i++) {
    view.setFloat32(88 + i * 4, msg.posYaw[i] ?? 0, true);
  }
  buffer[108] = msg.validPoints & 0xff;

  return buffer;
}

export function deserializeTrajectoryRepresentationBezier(payload: Uint8Array): TrajectoryRepresentationBezier {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    posX: Array.from({ length: 5 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    posY: Array.from({ length: 5 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    posZ: Array.from({ length: 5 }, (_, i) => view.getFloat32(48 + i * 4, true)),
    delta: Array.from({ length: 5 }, (_, i) => view.getFloat32(68 + i * 4, true)),
    posYaw: Array.from({ length: 5 }, (_, i) => view.getFloat32(88 + i * 4, true)),
    validPoints: payload[108],
  };
}