/**
 * The filtered local position (e.g. fused computer vision and accelerometers). Coordinate frame is right-handed, Z-axis down (aeronautical frame, NED / north-east-down convention)
 * Message ID: 64
 * CRC Extra: 191
 */
export interface LocalPositionNedCov {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Class id of the estimator this estimate originated from. */
  estimatorType: number;
  /** X Position (m) */
  x: number;
  /** Y Position (m) */
  y: number;
  /** Z Position (m) */
  z: number;
  /** X Speed (m/s) */
  vx: number;
  /** Y Speed (m/s) */
  vy: number;
  /** Z Speed (m/s) */
  vz: number;
  /** X Acceleration (m/s/s) */
  ax: number;
  /** Y Acceleration (m/s/s) */
  ay: number;
  /** Z Acceleration (m/s/s) */
  az: number;
  /** Row-major representation of position, velocity and acceleration 9x9 cross-covariance matrix upper right triangle (states: x, y, z, vx, vy, vz, ax, ay, az; first nine entries are the first ROW, next eight entries are the second row, etc.). If unknown, assign NaN value to first element in the array. */
  covariance: number[];
}

export const LOCAL_POSITION_NED_COV_ID = 64;
export const LOCAL_POSITION_NED_COV_CRC_EXTRA = 191;
export const LOCAL_POSITION_NED_COV_MIN_LENGTH = 225;
export const LOCAL_POSITION_NED_COV_MAX_LENGTH = 225;

export function serializeLocalPositionNedCov(msg: LocalPositionNedCov): Uint8Array {
  const buffer = new Uint8Array(225);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.x, true);
  view.setFloat32(12, msg.y, true);
  view.setFloat32(16, msg.z, true);
  view.setFloat32(20, msg.vx, true);
  view.setFloat32(24, msg.vy, true);
  view.setFloat32(28, msg.vz, true);
  view.setFloat32(32, msg.ax, true);
  view.setFloat32(36, msg.ay, true);
  view.setFloat32(40, msg.az, true);
  // Array: covariance
  for (let i = 0; i < 45; i++) {
    view.setFloat32(44 + i * 4, msg.covariance[i] ?? 0, true);
  }
  buffer[224] = msg.estimatorType & 0xff;

  return buffer;
}

export function deserializeLocalPositionNedCov(payload: Uint8Array): LocalPositionNedCov {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    vx: view.getFloat32(20, true),
    vy: view.getFloat32(24, true),
    vz: view.getFloat32(28, true),
    ax: view.getFloat32(32, true),
    ay: view.getFloat32(36, true),
    az: view.getFloat32(40, true),
    covariance: Array.from({ length: 45 }, (_, i) => view.getFloat32(44 + i * 4, true)),
    estimatorType: payload[224],
  };
}