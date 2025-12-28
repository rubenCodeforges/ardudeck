/**
 * Odometry message to communicate odometry information with an external interface. Fits ROS REP 147 standard for aerial vehicles (http://www.ros.org/reps/rep-0147.html).
 * Message ID: 331
 * CRC Extra: 147
 */
export interface Odometry {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Coordinate frame of reference for the pose data. */
  frameId: number;
  /** Coordinate frame of reference for the velocity in free space (twist) data. */
  childFrameId: number;
  /** X Position (m) */
  x: number;
  /** Y Position (m) */
  y: number;
  /** Z Position (m) */
  z: number;
  /** Quaternion components, w, x, y, z (1 0 0 0 is the null-rotation) */
  q: number[];
  /** X linear speed (m/s) */
  vx: number;
  /** Y linear speed (m/s) */
  vy: number;
  /** Z linear speed (m/s) */
  vz: number;
  /** Roll angular speed (rad/s) */
  rollspeed: number;
  /** Pitch angular speed (rad/s) */
  pitchspeed: number;
  /** Yaw angular speed (rad/s) */
  yawspeed: number;
  /** Row-major representation of a 6x6 pose cross-covariance matrix upper right triangle (states: x, y, z, roll, pitch, yaw; first six entries are the first ROW, next five entries are the second ROW, etc.). If unknown, assign NaN value to first element in the array. */
  poseCovariance: number[];
  /** Row-major representation of a 6x6 velocity cross-covariance matrix upper right triangle (states: vx, vy, vz, rollspeed, pitchspeed, yawspeed; first six entries are the first ROW, next five entries are the second ROW, etc.). If unknown, assign NaN value to first element in the array. */
  velocityCovariance: number[];
  /** Estimate reset counter. This should be incremented when the estimate resets in any of the dimensions (position, velocity, attitude, angular speed). This is designed to be used when e.g an external SLAM system detects a loop-closure and the estimate jumps. */
  resetCounter: number;
  /** Type of estimator that is providing the odometry. */
  estimatorType: number;
  /** Optional odometry quality metric as a percentage. -1 = odometry has failed, 0 = unknown/unset quality, 1 = worst quality, 100 = best quality (%) */
  quality: number;
}

export const ODOMETRY_ID = 331;
export const ODOMETRY_CRC_EXTRA = 147;
export const ODOMETRY_MIN_LENGTH = 233;
export const ODOMETRY_MAX_LENGTH = 233;

export function serializeOdometry(msg: Odometry): Uint8Array {
  const buffer = new Uint8Array(233);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.x, true);
  view.setFloat32(12, msg.y, true);
  view.setFloat32(16, msg.z, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(20 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(36, msg.vx, true);
  view.setFloat32(40, msg.vy, true);
  view.setFloat32(44, msg.vz, true);
  view.setFloat32(48, msg.rollspeed, true);
  view.setFloat32(52, msg.pitchspeed, true);
  view.setFloat32(56, msg.yawspeed, true);
  // Array: pose_covariance
  for (let i = 0; i < 21; i++) {
    view.setFloat32(60 + i * 4, msg.poseCovariance[i] ?? 0, true);
  }
  // Array: velocity_covariance
  for (let i = 0; i < 21; i++) {
    view.setFloat32(144 + i * 4, msg.velocityCovariance[i] ?? 0, true);
  }
  buffer[228] = msg.frameId & 0xff;
  buffer[229] = msg.childFrameId & 0xff;
  buffer[230] = msg.resetCounter & 0xff;
  buffer[231] = msg.estimatorType & 0xff;
  view.setInt8(232, msg.quality);

  return buffer;
}

export function deserializeOdometry(payload: Uint8Array): Odometry {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    x: view.getFloat32(8, true),
    y: view.getFloat32(12, true),
    z: view.getFloat32(16, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(20 + i * 4, true)),
    vx: view.getFloat32(36, true),
    vy: view.getFloat32(40, true),
    vz: view.getFloat32(44, true),
    rollspeed: view.getFloat32(48, true),
    pitchspeed: view.getFloat32(52, true),
    yawspeed: view.getFloat32(56, true),
    poseCovariance: Array.from({ length: 21 }, (_, i) => view.getFloat32(60 + i * 4, true)),
    velocityCovariance: Array.from({ length: 21 }, (_, i) => view.getFloat32(144 + i * 4, true)),
    frameId: payload[228],
    childFrameId: payload[229],
    resetCounter: payload[230],
    estimatorType: payload[231],
    quality: view.getInt8(232),
  };
}