/**
 * Describe a trajectory using an array of up-to 5 waypoints in the local frame (MAV_FRAME_LOCAL_NED).
 * Message ID: 332
 * CRC Extra: 236
 */
export interface TrajectoryRepresentationWaypoints {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Number of valid points (up-to 5 waypoints are possible) */
  validPoints: number;
  /** X-coordinate of waypoint, set to NaN if not being used (m) */
  posX: number[];
  /** Y-coordinate of waypoint, set to NaN if not being used (m) */
  posY: number[];
  /** Z-coordinate of waypoint, set to NaN if not being used (m) */
  posZ: number[];
  /** X-velocity of waypoint, set to NaN if not being used (m/s) */
  velX: number[];
  /** Y-velocity of waypoint, set to NaN if not being used (m/s) */
  velY: number[];
  /** Z-velocity of waypoint, set to NaN if not being used (m/s) */
  velZ: number[];
  /** X-acceleration of waypoint, set to NaN if not being used (m/s/s) */
  accX: number[];
  /** Y-acceleration of waypoint, set to NaN if not being used (m/s/s) */
  accY: number[];
  /** Z-acceleration of waypoint, set to NaN if not being used (m/s/s) */
  accZ: number[];
  /** Yaw angle, set to NaN if not being used (rad) */
  posYaw: number[];
  /** Yaw rate, set to NaN if not being used (rad/s) */
  velYaw: number[];
  /** MAV_CMD command id of waypoint, set to UINT16_MAX if not being used. */
  command: number[];
}

export const TRAJECTORY_REPRESENTATION_WAYPOINTS_ID = 332;
export const TRAJECTORY_REPRESENTATION_WAYPOINTS_CRC_EXTRA = 236;
export const TRAJECTORY_REPRESENTATION_WAYPOINTS_MIN_LENGTH = 239;
export const TRAJECTORY_REPRESENTATION_WAYPOINTS_MAX_LENGTH = 239;

export function serializeTrajectoryRepresentationWaypoints(msg: TrajectoryRepresentationWaypoints): Uint8Array {
  const buffer = new Uint8Array(239);
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
  // Array: vel_x
  for (let i = 0; i < 5; i++) {
    view.setFloat32(68 + i * 4, msg.velX[i] ?? 0, true);
  }
  // Array: vel_y
  for (let i = 0; i < 5; i++) {
    view.setFloat32(88 + i * 4, msg.velY[i] ?? 0, true);
  }
  // Array: vel_z
  for (let i = 0; i < 5; i++) {
    view.setFloat32(108 + i * 4, msg.velZ[i] ?? 0, true);
  }
  // Array: acc_x
  for (let i = 0; i < 5; i++) {
    view.setFloat32(128 + i * 4, msg.accX[i] ?? 0, true);
  }
  // Array: acc_y
  for (let i = 0; i < 5; i++) {
    view.setFloat32(148 + i * 4, msg.accY[i] ?? 0, true);
  }
  // Array: acc_z
  for (let i = 0; i < 5; i++) {
    view.setFloat32(168 + i * 4, msg.accZ[i] ?? 0, true);
  }
  // Array: pos_yaw
  for (let i = 0; i < 5; i++) {
    view.setFloat32(188 + i * 4, msg.posYaw[i] ?? 0, true);
  }
  // Array: vel_yaw
  for (let i = 0; i < 5; i++) {
    view.setFloat32(208 + i * 4, msg.velYaw[i] ?? 0, true);
  }
  // Array: command
  for (let i = 0; i < 5; i++) {
    view.setUint16(228 + i * 2, msg.command[i] ?? 0, true);
  }
  buffer[238] = msg.validPoints & 0xff;

  return buffer;
}

export function deserializeTrajectoryRepresentationWaypoints(payload: Uint8Array): TrajectoryRepresentationWaypoints {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    posX: Array.from({ length: 5 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    posY: Array.from({ length: 5 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    posZ: Array.from({ length: 5 }, (_, i) => view.getFloat32(48 + i * 4, true)),
    velX: Array.from({ length: 5 }, (_, i) => view.getFloat32(68 + i * 4, true)),
    velY: Array.from({ length: 5 }, (_, i) => view.getFloat32(88 + i * 4, true)),
    velZ: Array.from({ length: 5 }, (_, i) => view.getFloat32(108 + i * 4, true)),
    accX: Array.from({ length: 5 }, (_, i) => view.getFloat32(128 + i * 4, true)),
    accY: Array.from({ length: 5 }, (_, i) => view.getFloat32(148 + i * 4, true)),
    accZ: Array.from({ length: 5 }, (_, i) => view.getFloat32(168 + i * 4, true)),
    posYaw: Array.from({ length: 5 }, (_, i) => view.getFloat32(188 + i * 4, true)),
    velYaw: Array.from({ length: 5 }, (_, i) => view.getFloat32(208 + i * 4, true)),
    command: Array.from({ length: 5 }, (_, i) => view.getUint16(228 + i * 2, true)),
    validPoints: payload[238],
  };
}