import type { TileSourceEntry } from '../../shared/tile-source-types';
import { decodeTerrarium } from './terrain-colors';
import { subscribeTerrainChanged, tileVersionSuffix } from '../stores/tile-source-store';

const TILE = 256;
const tileCache = new Map<string, Promise<Float32Array | null>>();
subscribeTerrainChanged(() => tileCache.clear());

export function clearSourceTileCache(): void {
  tileCache.clear();
}

export function terrainTileUrl(z: number, x: number, y: number): string {
  return `tile-cache://dem/${z}/${x}/${y}.png${tileVersionSuffix()}`;
}

function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** One DEM tile as heights; NaN where the pixel is transparent. */
function loadTileHeights(z: number, x: number, y: number): Promise<Float32Array | null> {
  const key = `${z}/${x}/${y}`;
  const cached = tileCache.get(key);
  if (cached) return cached;
  const p = new Promise<Float32Array | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const timer = setTimeout(() => resolve(null), 8000);
    img.onload = () => {
      clearTimeout(timer);
      const c = document.createElement('canvas');
      c.width = TILE;
      c.height = TILE;
      const ctx = c.getContext('2d');
      if (!ctx) return resolve(null);
      ctx.drawImage(img, 0, 0, TILE, TILE);
      const d = ctx.getImageData(0, 0, TILE, TILE).data;
      const out = new Float32Array(TILE * TILE);
      for (let i = 0; i < TILE * TILE; i++) {
        out[i] = d[i * 4 + 3] === 0 ? NaN : decodeTerrarium(d[i * 4]!, d[i * 4 + 1]!, d[i * 4 + 2]!);
      }
      resolve(out);
    };
    img.onerror = () => {
      clearTimeout(timer);
      resolve(null);
    };
    img.src = terrainTileUrl(z, x, y);
  });
  if (tileCache.size > 256) tileCache.delete(tileCache.keys().next().value!);
  tileCache.set(key, p);
  return p;
}

export function sampleTile(elev: Float32Array, px: number, py: number): number {
  const fx = Math.max(0, Math.min(TILE - 1, px - 0.5)), fy = Math.max(0, Math.min(TILE - 1, py - 0.5));
  const x0 = Math.floor(fx), y0 = Math.floor(fy), x1 = Math.min(TILE - 1, x0 + 1), y1 = Math.min(TILE - 1, y0 + 1);
  const ax = fx - x0, ay = fy - y0;
  const a = elev[y0 * TILE + x0]!, b = elev[y0 * TILE + x1]!, c = elev[y1 * TILE + x0]!, d = elev[y1 * TILE + x1]!;
  if (Number.isNaN(a) || Number.isNaN(b) || Number.isNaN(c) || Number.isNaN(d)) return NaN;
  return (1 - ay) * ((1 - ax) * a + ax * b) + ay * ((1 - ax) * c + ax * d);
}

/** Height from the source's own tiles at its max zoom; null outside its data. */
export async function sourceElevation(
  entry: TileSourceEntry,
  lat: number,
  lon: number,
  loadTile: (z: number, x: number, y: number) => Promise<Float32Array | null> = loadTileHeights,
): Promise<number | null> {
  const z = entry.maxZoom;
  const tx = lonToTileX(lon, z), ty = latToTileY(lat, z);
  const x = Math.floor(tx), y = Math.floor(ty);
  const tile = await loadTile(z, x, y);
  if (!tile) return null;
  const h = sampleTile(tile, (tx - x) * TILE, (ty - y) * TILE);
  return Number.isNaN(h) ? null : h;
}

const TERRAIN_MAX_ZOOM = 12;
const TERRAIN_MIN_ZOOM = 6;
/** A long leg drops zoom until its points fit in this many tiles. */
export const TERRAIN_MAX_TILES = 48;

/** The deepest zoom whose tiles covering every point stay within maxTiles. */
export function terrainZoomFor(points: Array<{ lat: number; lon: number }>, maxTiles = TERRAIN_MAX_TILES): number {
  for (let z = TERRAIN_MAX_ZOOM; z > TERRAIN_MIN_ZOOM; z--) {
    const tiles = new Set<string>();
    for (const p of points) {
      tiles.add(`${Math.floor(lonToTileX(p.lon, z))}/${Math.floor(latToTileY(p.lat, z))}`);
      if (tiles.size > maxTiles) break;
    }
    if (tiles.size <= maxTiles) return z;
  }
  return TERRAIN_MIN_ZOOM;
}

/**
 * Heights from the app's own terrain tiles (tile-cache://dem, cached on disk), so most
 * lookups never reach a rate-limited elevation API. null where a tile is missing.
 */
export async function terrainTileElevations(
  points: Array<{ lat: number; lon: number }>,
  loadTile: (z: number, x: number, y: number) => Promise<Float32Array | null> = loadTileHeights,
): Promise<Array<number | null>> {
  if (points.length === 0) return [];
  if (loadTile === loadTileHeights && (typeof Image === 'undefined' || typeof document === 'undefined')) {
    return points.map(() => null);
  }
  const z = terrainZoomFor(points);
  return Promise.all(points.map(async (p) => {
    const tx = lonToTileX(p.lon, z), ty = latToTileY(p.lat, z);
    const x = Math.floor(tx), y = Math.floor(ty);
    const tile = await loadTile(z, x, y);
    if (!tile) return null;
    const h = sampleTile(tile, (tx - x) * TILE, (ty - y) * TILE);
    return Number.isNaN(h) ? null : h;
  }));
}
