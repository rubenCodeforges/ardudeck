/**
 * The offset in X, Y, Z and yaw between the LOCAL_POSITION_NED messages of MAV X and the global coordinate frame in NED coordinates. Coordinate frame is right-handed, Z-axis down (aeronautical frame, NED / north-east-down convention)
 * Message ID: 89
 * CRC Extra: 231
 */
export interface LocalPositionNedSystemGlobalOffset {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** X Position (m) */
  x: number;
  /** Y Position (m) */
  y: number;
  /** Z Position (m) */
  z: number;
  /** Roll (rad) */
  roll: number;
  /** Pitch (rad) */
  pitch: number;
  /** Yaw (rad) */
  yaw: number;
}

export const LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET_ID = 89;
export const LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET_CRC_EXTRA = 231;
export const LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET_MIN_LENGTH = 28;
export const LOCAL_POSITION_NED_SYSTEM_GLOBAL_OFFSET_MAX_LENGTH = 28;

export function serializeLocalPositionNedSystemGlobalOffset(msg: LocalPositionNedSystemGlobalOffset): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.x, true);
  view.setFloat32(8, msg.y, true);
  view.setFloat32(12, msg.z, true);
  view.setFloat32(16, msg.roll, true);
  view.setFloat32(20, msg.pitch, true);
  view.setFloat32(24, msg.yaw, true);

  return buffer;
}

export function deserializeLocalPositionNedSystemGlobalOffset(payload: Uint8Array): LocalPositionNedSystemGlobalOffset {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    x: view.getFloat32(4, true),
    y: view.getFloat32(8, true),
    z: view.getFloat32(12, true),
    roll: view.getFloat32(16, true),
    pitch: view.getFloat32(20, true),
    yaw: view.getFloat32(24, true),
  };
}