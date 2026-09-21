/**
 * Shared load limiter for synthetic-vision tiles (DEM and imagery).
 *
 * With a swarm many views load terrain at once; uncapped they starve the
 * connection pool and some Image loads never fire onload/onerror, which hangs
 * a whole terrain load forever.
 */

const MAX_CONCURRENT_TILES = 8;
let activeTileLoads = 0;
const tileQueue: Array<() => void> = [];

export function acquireTileSlot(): Promise<void> {
  if (activeTileLoads < MAX_CONCURRENT_TILES) {
    activeTileLoads++;
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => tileQueue.push(resolve));
}

export function releaseTileSlot(): void {
  // The slot passes straight to the next waiter. Freeing it first and letting
  // the waiter re-take it in a microtask left a window a synchronous caller
  // could claim, putting more loads in flight than the cap allows.
  const next = tileQueue.shift();
  if (next) next();
  else activeTileLoads--;
}

/** Abandon a tile that hasn't loaded in this long (treat as missing). */
export const TILE_TIMEOUT_MS = 12_000;
export const TILE_SIZE = 256;

/** Load one tile image, or null on error/timeout. Slot-limited. */
export async function loadTileImage(url: string): Promise<HTMLImageElement | null> {
  await acquireTileSlot();
  return new Promise<HTMLImageElement | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      img.onload = null;
      img.onerror = null;
      releaseTileSlot();
      resolve(value);
    };
    // A stalled custom-protocol request can fire neither onload nor onerror.
    const timer = setTimeout(() => finish(null), TILE_TIMEOUT_MS);
    img.onload = () => finish(img);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/** Web-Mercator fractional tile X for a longitude. */
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

/** Web-Mercator fractional tile Y for a latitude. */
export function latToTileY(lat: number, z: number): number {
  const r = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z;
}

/** Longitude of a tile's western edge. */
export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

/** Latitude of a tile's northern edge. */
export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}
