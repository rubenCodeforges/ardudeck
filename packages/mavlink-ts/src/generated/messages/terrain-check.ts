/**
 * Request that the vehicle report terrain height at the given location (expected response is a TERRAIN_REPORT). Used by GCS to check if vehicle has all terrain data needed for a mission.
 * Message ID: 135
 * CRC Extra: 203
 */
export interface TerrainCheck {
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
}

export const TERRAIN_CHECK_ID = 135;
export const TERRAIN_CHECK_CRC_EXTRA = 203;
export const TERRAIN_CHECK_MIN_LENGTH = 8;
export const TERRAIN_CHECK_MAX_LENGTH = 8;

export function serializeTerrainCheck(msg: TerrainCheck): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.lat, true);
  view.setInt32(4, msg.lon, true);

  return buffer;
}

export function deserializeTerrainCheck(payload: Uint8Array): TerrainCheck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lat: view.getInt32(0, true),
    lon: view.getInt32(4, true),
  };
}