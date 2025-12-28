/**
 * The position the system will return to and land on. The position is set automatically by the system during the takeoff in case it was not explicitly set by the operator before or after. The global and local positions encode the position in the respective coordinate frames, while the q parameter encodes the orientation of the surface. Under normal conditions it describes the heading and terrain slope, which can be used by the aircraft to adjust the approach. The approach 3D vector describes the point to which the system should fly in normal flight mode and then perform a landing sequence along the vector.
 * Message ID: 243
 * CRC Extra: 57
 */
export interface SetHomePosition {
  /** System ID. */
  targetSystem: number;
  /** Latitude (WGS84) (degE7) */
  latitude: number;
  /** Longitude (WGS84) (degE7) */
  longitude: number;
  /** Altitude (MSL). Positive for up. (mm) */
  altitude: number;
  /** Local X position of this position in the local coordinate frame (m) */
  x: number;
  /** Local Y position of this position in the local coordinate frame (m) */
  y: number;
  /** Local Z position of this position in the local coordinate frame (m) */
  z: number;
  /** World to surface normal and heading transformation of the takeoff position. Used to indicate the heading and slope of the ground */
  q: number[];
  /** Local X position of the end of the approach vector. Multicopters should set this position based on their takeoff path. Grass-landing fixed wing aircraft should set it the same way as multicopters. Runway-landing fixed wing aircraft should set it to the opposite direction of the takeoff, assuming the takeoff happened from the threshold / touchdown zone. (m) */
  approachX: number;
  /** Local Y position of the end of the approach vector. Multicopters should set this position based on their takeoff path. Grass-landing fixed wing aircraft should set it the same way as multicopters. Runway-landing fixed wing aircraft should set it to the opposite direction of the takeoff, assuming the takeoff happened from the threshold / touchdown zone. (m) */
  approachY: number;
  /** Local Z position of the end of the approach vector. Multicopters should set this position based on their takeoff path. Grass-landing fixed wing aircraft should set it the same way as multicopters. Runway-landing fixed wing aircraft should set it to the opposite direction of the takeoff, assuming the takeoff happened from the threshold / touchdown zone. (m) */
  approachZ: number;
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
}

export const SET_HOME_POSITION_ID = 243;
export const SET_HOME_POSITION_CRC_EXTRA = 57;
export const SET_HOME_POSITION_MIN_LENGTH = 61;
export const SET_HOME_POSITION_MAX_LENGTH = 61;

export function serializeSetHomePosition(msg: SetHomePosition): Uint8Array {
  const buffer = new Uint8Array(61);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt32(8, msg.latitude, true);
  view.setInt32(12, msg.longitude, true);
  view.setInt32(16, msg.altitude, true);
  view.setFloat32(20, msg.x, true);
  view.setFloat32(24, msg.y, true);
  view.setFloat32(28, msg.z, true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(32 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setFloat32(48, msg.approachX, true);
  view.setFloat32(52, msg.approachY, true);
  view.setFloat32(56, msg.approachZ, true);
  buffer[60] = msg.targetSystem & 0xff;

  return buffer;
}

export function deserializeSetHomePosition(payload: Uint8Array): SetHomePosition {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    latitude: view.getInt32(8, true),
    longitude: view.getInt32(12, true),
    altitude: view.getInt32(16, true),
    x: view.getFloat32(20, true),
    y: view.getFloat32(24, true),
    z: view.getFloat32(28, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(32 + i * 4, true)),
    approachX: view.getFloat32(48, true),
    approachY: view.getFloat32(52, true),
    approachZ: view.getFloat32(56, true),
    targetSystem: payload[60],
  };
}