/**
 * Set a safety zone (volume), which is defined by two corners of a cube. This message can be used to tell the MAV which setpoints/waypoints to accept and which to reject. Safety areas are often enforced by national or competition regulations.
 * Message ID: 54
 * CRC Extra: 15
 */
export interface SafetySetAllowedArea {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
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

export const SAFETY_SET_ALLOWED_AREA_ID = 54;
export const SAFETY_SET_ALLOWED_AREA_CRC_EXTRA = 15;
export const SAFETY_SET_ALLOWED_AREA_MIN_LENGTH = 27;
export const SAFETY_SET_ALLOWED_AREA_MAX_LENGTH = 27;

export function serializeSafetySetAllowedArea(msg: SafetySetAllowedArea): Uint8Array {
  const buffer = new Uint8Array(27);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.p1x, true);
  view.setFloat32(4, msg.p1y, true);
  view.setFloat32(8, msg.p1z, true);
  view.setFloat32(12, msg.p2x, true);
  view.setFloat32(16, msg.p2y, true);
  view.setFloat32(20, msg.p2z, true);
  buffer[24] = msg.targetSystem & 0xff;
  buffer[25] = msg.targetComponent & 0xff;
  buffer[26] = msg.frame & 0xff;

  return buffer;
}

export function deserializeSafetySetAllowedArea(payload: Uint8Array): SafetySetAllowedArea {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    p1x: view.getFloat32(0, true),
    p1y: view.getFloat32(4, true),
    p1z: view.getFloat32(8, true),
    p2x: view.getFloat32(12, true),
    p2y: view.getFloat32(16, true),
    p2z: view.getFloat32(20, true),
    targetSystem: payload[24],
    targetComponent: payload[25],
    frame: payload[26],
  };
}