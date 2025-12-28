/**
 * Sets a desired vehicle position in a local north-east-down coordinate frame. Used by an external controller to command the vehicle (manual controller or other system).
 * Message ID: 84
 * CRC Extra: 143
 */
export interface SetPositionTargetLocalNed {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Valid options are: MAV_FRAME_LOCAL_NED = 1, MAV_FRAME_LOCAL_OFFSET_NED = 7, MAV_FRAME_BODY_NED = 8, MAV_FRAME_BODY_OFFSET_NED = 9 */
  coordinateFrame: number;
  /** Bitmap to indicate which dimensions should be ignored by the vehicle. */
  typeMask: number;
  /** X Position in NED frame (m) */
  x: number;
  /** Y Position in NED frame (m) */
  y: number;
  /** Z Position in NED frame (note, altitude is negative in NED) (m) */
  z: number;
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

export const SET_POSITION_TARGET_LOCAL_NED_ID = 84;
export const SET_POSITION_TARGET_LOCAL_NED_CRC_EXTRA = 143;
export const SET_POSITION_TARGET_LOCAL_NED_MIN_LENGTH = 53;
export const SET_POSITION_TARGET_LOCAL_NED_MAX_LENGTH = 53;

export function serializeSetPositionTargetLocalNed(msg: SetPositionTargetLocalNed): Uint8Array {
  const buffer = new Uint8Array(53);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.x, true);
  view.setFloat32(8, msg.y, true);
  view.setFloat32(12, msg.z, true);
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

export function deserializeSetPositionTargetLocalNed(payload: Uint8Array): SetPositionTargetLocalNed {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    x: view.getFloat32(4, true),
    y: view.getFloat32(8, true),
    z: view.getFloat32(12, true),
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