/**
 * Request for terrain data and terrain status. See terrain protocol docs: https://mavlink.io/en/services/terrain.html
 * Message ID: 133
 * CRC Extra: 6
 */
export interface TerrainRequest {
  /** Latitude of SW corner of first grid (degE7) */
  lat: number;
  /** Longitude of SW corner of first grid (degE7) */
  lon: number;
  /** Grid spacing (m) */
  gridSpacing: number;
  /** Bitmask of requested 4x4 grids (row major 8x7 array of grids, 56 bits) */
  mask: bigint;
}

export const TERRAIN_REQUEST_ID = 133;
export const TERRAIN_REQUEST_CRC_EXTRA = 6;
export const TERRAIN_REQUEST_MIN_LENGTH = 18;
export const TERRAIN_REQUEST_MAX_LENGTH = 18;

export function serializeTerrainRequest(msg: TerrainRequest): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.mask), true);
  view.setInt32(8, msg.lat, true);
  view.setInt32(12, msg.lon, true);
  view.setUint16(16, msg.gridSpacing, true);

  return buffer;
}

export function deserializeTerrainRequest(payload: Uint8Array): TerrainRequest {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mask: view.getBigUint64(0, true),
    lat: view.getInt32(8, true),
    lon: view.getInt32(12, true),
    gridSpacing: view.getUint16(16, true),
  };
}