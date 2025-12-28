/**
 * Camera tracking status, sent while in active tracking. Use MAV_CMD_SET_MESSAGE_INTERVAL to define message interval.
 * Message ID: 276
 * CRC Extra: 18
 */
export interface CameraTrackingGeoStatus {
  /** Current tracking status */
  trackingStatus: number;
  /** Latitude of tracked object (degE7) */
  lat: number;
  /** Longitude of tracked object (degE7) */
  lon: number;
  /** Altitude of tracked object(AMSL, WGS84) (m) */
  alt: number;
  /** Horizontal accuracy. NAN if unknown (m) */
  hAcc: number;
  /** Vertical accuracy. NAN if unknown (m) */
  vAcc: number;
  /** North velocity of tracked object. NAN if unknown (m/s) */
  velN: number;
  /** East velocity of tracked object. NAN if unknown (m/s) */
  velE: number;
  /** Down velocity of tracked object. NAN if unknown (m/s) */
  velD: number;
  /** Velocity accuracy. NAN if unknown (m/s) */
  velAcc: number;
  /** Distance between camera and tracked object. NAN if unknown (m) */
  dist: number;
  /** Heading in radians, in NED. NAN if unknown (rad) */
  hdg: number;
  /** Accuracy of heading, in NED. NAN if unknown (rad) */
  hdgAcc: number;
}

export const CAMERA_TRACKING_GEO_STATUS_ID = 276;
export const CAMERA_TRACKING_GEO_STATUS_CRC_EXTRA = 18;
export const CAMERA_TRACKING_GEO_STATUS_MIN_LENGTH = 49;
export const CAMERA_TRACKING_GEO_STATUS_MAX_LENGTH = 49;

export function serializeCameraTrackingGeoStatus(msg: CameraTrackingGeoStatus): Uint8Array {
  const buffer = new Uint8Array(49);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.lat, true);
  view.setInt32(4, msg.lon, true);
  view.setFloat32(8, msg.alt, true);
  view.setFloat32(12, msg.hAcc, true);
  view.setFloat32(16, msg.vAcc, true);
  view.setFloat32(20, msg.velN, true);
  view.setFloat32(24, msg.velE, true);
  view.setFloat32(28, msg.velD, true);
  view.setFloat32(32, msg.velAcc, true);
  view.setFloat32(36, msg.dist, true);
  view.setFloat32(40, msg.hdg, true);
  view.setFloat32(44, msg.hdgAcc, true);
  buffer[48] = msg.trackingStatus & 0xff;

  return buffer;
}

export function deserializeCameraTrackingGeoStatus(payload: Uint8Array): CameraTrackingGeoStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lat: view.getInt32(0, true),
    lon: view.getInt32(4, true),
    alt: view.getFloat32(8, true),
    hAcc: view.getFloat32(12, true),
    vAcc: view.getFloat32(16, true),
    velN: view.getFloat32(20, true),
    velE: view.getFloat32(24, true),
    velD: view.getFloat32(28, true),
    velAcc: view.getFloat32(32, true),
    dist: view.getFloat32(36, true),
    hdg: view.getFloat32(40, true),
    hdgAcc: view.getFloat32(44, true),
    trackingStatus: payload[48],
  };
}