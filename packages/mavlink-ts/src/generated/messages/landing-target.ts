/**
 * The location of a landing target. See: https://mavlink.io/en/services/landing_target.html
 * Message ID: 149
 * CRC Extra: 48
 */
export interface LandingTarget {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** The ID of the target if multiple targets are present */
  targetNum: number;
  /** Coordinate frame used for following fields. */
  frame: number;
  /** X-axis angular offset of the target from the center of the image (rad) */
  angleX: number;
  /** Y-axis angular offset of the target from the center of the image (rad) */
  angleY: number;
  /** Distance to the target from the vehicle (m) */
  distance: number;
  /** Size of target along x-axis (rad) */
  sizeX: number;
  /** Size of target along y-axis (rad) */
  sizeY: number;
  /** X Position of the landing target in MAV_FRAME (m) */
  x: number;
  /** Y Position of the landing target in MAV_FRAME (m) */
  y: number;
  /** Z Position of the landing target in MAV_FRAME (m) */
  z: number;
  /** Quaternion of landing target orientation (w, x, y, z order, zero-rotation is 1, 0, 0, 0) */
  q: number[];
  /** Type of landing target */
  type: number;
  /** Position fields (x, y, z, q, type) contain valid target position information (MAV_BOOL_FALSE: invalid values). Values not equal to 0 or 1 are invalid. */
  positionValid: number;
}

export const LANDING_TARGET_ID = 149;
export const LANDING_TARGET_CRC_EXTRA = 48;
export const LANDING_TARGET_MIN_LENGTH = 60;
export const LANDING_TARGET_MAX_LENGTH = 60;

export function serializeLandingTarget(msg: LandingTarget): Uint8Array {
  const buffer = new Uint8Array(60);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.angleX, true);
  view.setFloat32(12, msg.angleY, true);
  view.setFloat32(16, msg.distance, true);
  view.setFloat32(20, msg.sizeX, true);
  view.setFloat32(24, msg.sizeY, true);
  view.setFloat32(28, msg.x, true);
  view.setFloat32(32, msg.y, true);
  view.setFloat32(36, msg.z, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(40 + i * 4, msg.q[i] ?? 0, true);
  }
  buffer[56] = msg.targetNum & 0xff;
  buffer[57] = msg.frame & 0xff;
  buffer[58] = msg.type & 0xff;
  buffer[59] = msg.positionValid & 0xff;

  return buffer;
}

export function deserializeLandingTarget(payload: Uint8Array): LandingTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    angleX: view.getFloat32(8, true),
    angleY: view.getFloat32(12, true),
    distance: view.getFloat32(16, true),
    sizeX: view.getFloat32(20, true),
    sizeY: view.getFloat32(24, true),
    x: view.getFloat32(28, true),
    y: view.getFloat32(32, true),
    z: view.getFloat32(36, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(40 + i * 4, true)),
    targetNum: payload[56],
    frame: payload[57],
    type: payload[58],
    positionValid: payload[59],
  };
}