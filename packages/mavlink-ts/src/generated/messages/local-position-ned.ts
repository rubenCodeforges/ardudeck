/**
 * The filtered local position (e.g. fused computer vision and accelerometers). Coordinate frame is right-handed, Z-axis down (aeronautical frame, NED / north-east-down convention)
 * Message ID: 32
 * CRC Extra: 185
 */
export interface LocalPositionNed {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
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
}

export const LOCAL_POSITION_NED_ID = 32;
export const LOCAL_POSITION_NED_CRC_EXTRA = 185;
export const LOCAL_POSITION_NED_MIN_LENGTH = 28;
export const LOCAL_POSITION_NED_MAX_LENGTH = 28;

export function serializeLocalPositionNed(msg: LocalPositionNed): Uint8Array {
  const buffer = new Uint8Array(28);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.x, true);
  view.setFloat32(8, msg.y, true);
  view.setFloat32(12, msg.z, true);
  view.setFloat32(16, msg.vx, true);
  view.setFloat32(20, msg.vy, true);
  view.setFloat32(24, msg.vz, true);

  return buffer;
}

export function deserializeLocalPositionNed(payload: Uint8Array): LocalPositionNed {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    x: view.getFloat32(4, true),
    y: view.getFloat32(8, true),
    z: view.getFloat32(12, true),
    vx: view.getFloat32(16, true),
    vy: view.getFloat32(20, true),
    vz: view.getFloat32(24, true),
  };
}