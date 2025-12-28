/**
 * Streamed from drone to report progress of terrain map download (initiated by TERRAIN_REQUEST), or sent as a response to a TERRAIN_CHECK request. See terrain protocol docs: https://mavlink.io/en/services/terrain.html
 * Message ID: 136
 * CRC Extra: 1
 */
export interface TerrainReport {
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
  /** grid spacing (zero if terrain at this location unavailable) */
  spacing: number;
  /** Terrain height MSL (m) */
  terrainHeight: number;
  /** Current vehicle height above lat/lon terrain height (m) */
  currentHeight: number;
  /** Number of 4x4 terrain blocks waiting to be received or read from disk */
  pending: number;
  /** Number of 4x4 terrain blocks in memory */
  loaded: number;
}

export const TERRAIN_REPORT_ID = 136;
export const TERRAIN_REPORT_CRC_EXTRA = 1;
export const TERRAIN_REPORT_MIN_LENGTH = 22;
export const TERRAIN_REPORT_MAX_LENGTH = 22;

export function serializeTerrainReport(msg: TerrainReport): Uint8Array {
  const buffer = new Uint8Array(22);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.lat, true);
  view.setInt32(4, msg.lon, true);
  view.setFloat32(8, msg.terrainHeight, true);
  view.setFloat32(12, msg.currentHeight, true);
  view.setUint16(16, msg.spacing, true);
  view.setUint16(18, msg.pending, true);
  view.setUint16(20, msg.loaded, true);

  return buffer;
}

export function deserializeTerrainReport(payload: Uint8Array): TerrainReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lat: view.getInt32(0, true),
    lon: view.getInt32(4, true),
    terrainHeight: view.getFloat32(8, true),
    currentHeight: view.getFloat32(12, true),
    spacing: view.getUint16(16, true),
    pending: view.getUint16(18, true),
    loaded: view.getUint16(20, true),
  };
}