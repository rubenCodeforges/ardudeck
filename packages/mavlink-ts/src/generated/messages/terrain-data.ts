/**
 * Terrain data sent from GCS. The lat/lon and grid_spacing must be the same as a lat/lon from a TERRAIN_REQUEST. See terrain protocol docs: https://mavlink.io/en/services/terrain.html
 * Message ID: 134
 * CRC Extra: 229
 */
export interface TerrainData {
  /** Latitude of SW corner of first grid (degE7) */
  lat: number;
  /** Longitude of SW corner of first grid (degE7) */
  lon: number;
  /** Grid spacing (m) */
  gridSpacing: number;
  /** bit within the terrain request mask */
  gridbit: number;
  /** Terrain data MSL (m) */
  data: number[];
}

export const TERRAIN_DATA_ID = 134;
export const TERRAIN_DATA_CRC_EXTRA = 229;
export const TERRAIN_DATA_MIN_LENGTH = 43;
export const TERRAIN_DATA_MAX_LENGTH = 43;

export function serializeTerrainData(msg: TerrainData): Uint8Array {
  const buffer = new Uint8Array(43);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.lat, true);
  view.setInt32(4, msg.lon, true);
  view.setUint16(8, msg.gridSpacing, true);
  // Array: data
  for (let i = 0; i < 16; i++) {
    view.setInt16(10 + i * 2, msg.data[i] ?? 0, true);
  }
  buffer[42] = msg.gridbit & 0xff;

  return buffer;
}

export function deserializeTerrainData(payload: Uint8Array): TerrainData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lat: view.getInt32(0, true),
    lon: view.getInt32(4, true),
    gridSpacing: view.getUint16(8, true),
    data: Array.from({ length: 16 }, (_, i) => view.getInt16(10 + i * 2, true)),
    gridbit: payload[42],
  };
}