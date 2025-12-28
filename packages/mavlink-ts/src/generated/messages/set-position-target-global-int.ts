/**
 * Sets a desired vehicle position, velocity, and/or acceleration in a global coordinate system (WGS84). Used by an external controller to command the vehicle (manual controller or other system).
 * Message ID: 86
 * CRC Extra: 5
 */
export interface SetPositionTargetGlobalInt {
  /** Timestamp (time since system boot). The rationale for the timestamp in the setpoint is to allow the system to compensate for the transport delay of the setpoint. This allows the system to compensate processing latency. (ms) */
  timeBootMs: number;
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Valid options are: MAV_FRAME_GLOBAL = 0, MAV_FRAME_GLOBAL_RELATIVE_ALT = 3, MAV_FRAME_GLOBAL_TERRAIN_ALT = 10 (MAV_FRAME_GLOBAL_INT, MAV_FRAME_GLOBAL_RELATIVE_ALT_INT, MAV_FRAME_GLOBAL_TERRAIN_ALT_INT are allowed synonyms, but have been deprecated) */
  coordinateFrame: number;
  /** Bitmap to indicate which dimensions should be ignored by the vehicle. */
  typeMask: number;
  /** Latitude in WGS84 frame (degE7) */
  latInt: number;
  /** Longitude in WGS84 frame (degE7) */
  lonInt: number;
  /** Altitude (MSL, Relative to home, or AGL - depending on frame) (m) */
  alt: number;
  /** X velocity in NED frame (m/s) */
  vx: number;
  /** Y velocity in NED frame (m/s) */
  vy: number;
  /** Z velocity in NED frame (m/s) */
  vz: number;
  /** X acceleration or force (if bit 10 of type_mask is set) in NED frame in meter / s^2 or N (m/s/s) */
  afx: number;
  /** Y acceleration or force (if bit 10 of type_mask is set) in NED frame in meter / s^2 or N (m/s/s) */
  afy: number;
  /** Z acceleration or force (if bit 10 of type_mask is set) in NED frame in meter / s^2 or N (m/s/s) */
  afz: number;
  /** yaw setpoint (rad) */
  yaw: number;
  /** yaw rate setpoint (rad/s) */
  yawRate: number;
}

export const SET_POSITION_TARGET_GLOBAL_INT_ID = 86;
export const SET_POSITION_TARGET_GLOBAL_INT_CRC_EXTRA = 5;
export const SET_POSITION_TARGET_GLOBAL_INT_MIN_LENGTH = 53;
export const SET_POSITION_TARGET_GLOBAL_INT_MAX_LENGTH = 53;

export function serializeSetPositionTargetGlobalInt(msg: SetPositionTargetGlobalInt): Uint8Array {
  const buffer = new Uint8Array(53);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setInt32(4, msg.latInt, true);
  view.setInt32(8, msg.lonInt, true);
  view.setFloat32(12, msg.alt, true);
  view.setFloat32(16, msg.vx, true);
  view.setFloat32(20, msg.vy, true);
  view.setFloat32(24, msg.vz, true);
  view.setFloat32(28, msg.afx, true);
  view.setFloat32(32, msg.afy, true);
  view.setFloat32(36, msg.afz, true);
  view.setFloat32(40, msg.yaw, true);
  view.setFloat32(44, msg.yawRate, true);
  view.setUint16(48, msg.typeMask, true);
  buffer[50] = msg.targetSystem & 0xff;
  buffer[51] = msg.targetComponent & 0xff;
  buffer[52] = msg.coordinateFrame & 0xff;

  return buffer;
}

export function deserializeSetPositionTargetGlobalInt(payload: Uint8Array): SetPositionTargetGlobalInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    latInt: view.getInt32(4, true),
    lonInt: view.getInt32(8, true),
    alt: view.getFloat32(12, true),
    vx: view.getFloat32(16, true),
    vy: view.getFloat32(20, true),
    vz: view.getFloat32(24, true),
    afx: view.getFloat32(28, true),
    afy: view.getFloat32(32, true),
    afz: view.getFloat32(36, true),
    yaw: view.getFloat32(40, true),
    yawRate: view.getFloat32(44, true),
    typeMask: view.getUint16(48, true),
    targetSystem: payload[50],
    targetComponent: payload[51],
    coordinateFrame: payload[52],
  };
}