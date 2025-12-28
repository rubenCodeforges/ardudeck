/**
 * Read out the safety zone the MAV currently assumes.
 * Message ID: 55
 * CRC Extra: 3
 */
export interface SafetyAllowedArea {
  /** Coordinate frame. Can be either global, GPS, right-handed with Z axis up or local, right handed, Z axis down. */
  frame: number;
  /** x position 1 / Latitude 1 (m) */
  p1x: number;
  /** y position 1 / Longitude 1 (m) */
  p1y: number;
  /** z position 1 / Altitude 1 (m) */
  p1z: number;
  /** x position 2 / Latitude 2 (m) */
  p2x: number;
  /** y position 2 / Longitude 2 (m) */
  p2y: number;
  /** z position 2 / Altitude 2 (m) */
  p2z: number;
}

export const SAFETY_ALLOWED_AREA_ID = 55;
export const SAFETY_ALLOWED_AREA_CRC_EXTRA = 3;
export const SAFETY_ALLOWED_AREA_MIN_LENGTH = 25;
export const SAFETY_ALLOWED_AREA_MAX_LENGTH = 25;

export function serializeSafetyAllowedArea(msg: SafetyAllowedArea): Uint8Array {
  const buffer = new Uint8Array(25);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.p1x, true);
  view.setFloat32(4, msg.p1y, true);
  view.setFloat32(8, msg.p1z, true);
  view.setFloat32(12, msg.p2x, true);
  view.setFloat32(16, msg.p2y, true);
  view.setFloat32(20, msg.p2z, true);
  buffer[24] = msg.frame & 0xff;

  return buffer;
}

export function deserializeSafetyAllowedArea(payload: Uint8Array): SafetyAllowedArea {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    p1x: view.getFloat32(0, true),
    p1y: view.getFloat32(4, true),
    p1z: view.getFloat32(8, true),
    p2x: view.getFloat32(12, true),
    p2y: view.getFloat32(16, true),
    p2z: view.getFloat32(20, true),
    frame: payload[24],
  };
}