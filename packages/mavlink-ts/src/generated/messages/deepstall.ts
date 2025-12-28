/**
 * Deepstall path planning.
 * Message ID: 195
 * CRC Extra: 120
 */
export interface Deepstall {
  /** Landing latitude. (degE7) */
  landingLat: number;
  /** Landing longitude. (degE7) */
  landingLon: number;
  /** Final heading start point, latitude. (degE7) */
  pathLat: number;
  /** Final heading start point, longitude. (degE7) */
  pathLon: number;
  /** Arc entry point, latitude. (degE7) */
  arcEntryLat: number;
  /** Arc entry point, longitude. (degE7) */
  arcEntryLon: number;
  /** Altitude. (m) */
  altitude: number;
  /** Distance the aircraft expects to travel during the deepstall. (m) */
  expectedTravelDistance: number;
  /** Deepstall cross track error (only valid when in DEEPSTALL_STAGE_LAND). (m) */
  crossTrackError: number;
  /** Deepstall stage. */
  stage: number;
}

export const DEEPSTALL_ID = 195;
export const DEEPSTALL_CRC_EXTRA = 120;
export const DEEPSTALL_MIN_LENGTH = 37;
export const DEEPSTALL_MAX_LENGTH = 37;

export function serializeDeepstall(msg: Deepstall): Uint8Array {
  const buffer = new Uint8Array(37);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.landingLat, true);
  view.setInt32(4, msg.landingLon, true);
  view.setInt32(8, msg.pathLat, true);
  view.setInt32(12, msg.pathLon, true);
  view.setInt32(16, msg.arcEntryLat, true);
  view.setInt32(20, msg.arcEntryLon, true);
  view.setFloat32(24, msg.altitude, true);
  view.setFloat32(28, msg.expectedTravelDistance, true);
  view.setFloat32(32, msg.crossTrackError, true);
  buffer[36] = msg.stage & 0xff;

  return buffer;
}

export function deserializeDeepstall(payload: Uint8Array): Deepstall {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    landingLat: view.getInt32(0, true),
    landingLon: view.getInt32(4, true),
    pathLat: view.getInt32(8, true),
    pathLon: view.getInt32(12, true),
    arcEntryLat: view.getInt32(16, true),
    arcEntryLon: view.getInt32(20, true),
    altitude: view.getFloat32(24, true),
    expectedTravelDistance: view.getFloat32(28, true),
    crossTrackError: view.getFloat32(32, true),
    stage: payload[36],
  };
}