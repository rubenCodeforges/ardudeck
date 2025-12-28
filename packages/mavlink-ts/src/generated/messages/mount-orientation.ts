/**
 * Orientation of a mount
 * Message ID: 265
 * CRC Extra: 77
 */
export interface MountOrientation {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Roll in global frame (set to NaN for invalid). (deg) */
  roll: number;
  /** Pitch in global frame (set to NaN for invalid). (deg) */
  pitch: number;
  /** Yaw relative to vehicle (set to NaN for invalid). (deg) */
  yaw: number;
  /** Yaw in absolute frame relative to Earth's North, north is 0 (set to NaN for invalid). (deg) */
  yawAbsolute: number;
}

export const MOUNT_ORIENTATION_ID = 265;
export const MOUNT_ORIENTATION_CRC_EXTRA = 77;
export const MOUNT_ORIENTATION_MIN_LENGTH = 20;
export const MOUNT_ORIENTATION_MAX_LENGTH = 20;

export function serializeMountOrientation(msg: MountOrientation): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.roll, true);
  view.setFloat32(8, msg.pitch, true);
  view.setFloat32(12, msg.yaw, true);
  view.setFloat32(16, msg.yawAbsolute, true);

  return buffer;
}

export function deserializeMountOrientation(payload: Uint8Array): MountOrientation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    roll: view.getFloat32(4, true),
    pitch: view.getFloat32(8, true),
    yaw: view.getFloat32(12, true),
    yawAbsolute: view.getFloat32(16, true),
  };
}