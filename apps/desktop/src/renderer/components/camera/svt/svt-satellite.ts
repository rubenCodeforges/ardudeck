/**
 * Satellite imagery draped over the synthetic-vision terrain: three concentric
 * LOD rings (sharp near field, wider mid, whole patch for the horizon), since
 * one flat texture cannot be both sharp underfoot and cover 50 km. Imagery
 * comes through the app's own tile cache, so it needs no extra key.
 */

import * as THREE from 'three';
import {
  TILE_SIZE,
  latToTileY,
  loadTileImage,
  lonToTileX,
  tileXToLon,
  tileYToLat,
} from './svt-tile-queue';
import { M_PER_DEG_LAT, metersPerDegLon, type ElevationGrid } from './svt-terrain';
import { MAP_LAYERS } from '../../../../shared/map-layers';

/** The map's plain satellite layers, in the map's order, offered as the terrain texture. */
export const SVT_IMAGERY_LAYERS = ['satellite', 'googleSat', 'bingSat'] as const;
export type SvtImagery = (typeof SVT_IMAGERY_LAYERS)[number];
export const DEFAULT_SVT_IMAGERY: SvtImagery = 'googleSat';

/** A stored choice that is no longer offered falls back to the default. */
export function validImagery(v: unknown): SvtImagery {
  return SVT_IMAGERY_LAYERS.includes(v as SvtImagery) ? (v as SvtImagery) : DEFAULT_SVT_IMAGERY;
}

/** Ceiling for any source: past it the mosaics outgrow GPU memory for the same ground. */
const MAX_IMAGERY_ZOOM = 19;

/** Highest zoom this source serves real pixels at; above it the server only upsamples. */
export function imageryMaxZoom(imagery: SvtImagery): number {
  const layer: { maxZoom: number; maxNativeZoom?: number } = MAP_LAYERS[imagery];
  return Math.min(MAX_IMAGERY_ZOOM, layer.maxNativeZoom ?? layer.maxZoom);
}

/**
 * Never reduced by the quality setting: the near field stays sharpest. The
 * ceiling is GPU memory, not bandwidth: each mosaic is an RGBA texture with
 * mipmaps, rebuilt as the vehicle moves, so 16 per side is a 4096 px, ~90 MB
 * texture and 24 would be 200 MB on its own, which is how the renderer ran out
 * before.
 */
export const INNER_RING_TILES = 16;

/** Ceiling for the wider rings, same reason (12 = a 3072 px mosaic). */
export const MAX_OUTER_RING_TILES = 12;

/**
 * Ring extents (metres per side); the last is clamped to the patch.
 *
 * Each ring's budget is per side, so a ring buys a higher zoom the smaller it
 * is. Without the 12 km step, everything past the 3.5 km ring came from one
 * mosaic stretched over the whole 50 km patch, which is the band of hills a
 * cockpit view is mostly looking at.
 */
export const RING_SPANS_M = [1_000, 3_500, 12_000, Infinity];

/** Third-person spans: a chase or orbit camera sits hundreds of metres back,
 * so a nose-sized inner ring leaves the bottom of the frame on coarse imagery.
 * Wider rings trade sharpness for covering what is actually in shot. */
export const WIDE_RING_SPANS_M = [4_000, 12_000, Infinity];

/** Re-fetch the rings once the vehicle is this far from their centre. Derived
 * from the inner span so a tighter (sharper) ring follows more closely; the
 * overlapping tiles are cache hits. */
export function recenterDistanceM(spans: number[] = RING_SPANS_M): number {
  // A fifth, not a quarter: the inner ring is trimmed to native zoom, so it is
  // narrower than the span asked for and the sharp ground ahead runs out sooner.
  return Math.min(1_200, Math.max(120, (spans[0] ?? 1_500) / 5));
}

export interface DrapeRing {
  texture: THREE.Texture;
  /** Local ENU rect the texture covers: x = East, z = -North, metres. */
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}

export interface Bounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Metres across one tile at this zoom and latitude. */
function tileSpanM(z: number, lat: number): number {
  return (metersPerDegLon(lat) * 360) / 2 ** z;
}

/** Widest inner ring that still lands on native-zoom imagery: a span two tiles
 * too wide drops the whole mosaic a zoom and halves near-field resolution. */
export function nativeZoomSpanM(lat: number, tiles: number, maxZoom: number = MAX_IMAGERY_ZOOM): number {
  // One tile of slack: the box is not aligned to the tile grid.
  return Math.max(200, (tiles - 1) * tileSpanM(maxZoom, lat));
}

/** Kilometre-wide inner rings (chase, top-down) are deliberate: leave them. */
function innerSpanM(requested: number, lat: number, tiles: number, maxZoom: number): number {
  if (requested > 2_000) return requested;
  // Clamped to the memory cap: trimming to native zoom must not let a caller
  // with a bigger tile budget build a mosaic past what the GPU can hold.
  return Math.min(requested, nativeZoomSpanM(lat, Math.min(tiles, INNER_RING_TILES), maxZoom));
}

/** Highest zoom whose tile count stays inside the budget for these bounds. */
export function bestZoom(b: Bounds, maxTilesPerSide: number, maxZoom: number = MAX_IMAGERY_ZOOM): number {
  for (let z = maxZoom; z >= 2; z--) {
    const tilesX = Math.floor(lonToTileX(b.east, z)) - Math.floor(lonToTileX(b.west, z)) + 1;
    const tilesY = Math.floor(latToTileY(b.south, z)) - Math.floor(latToTileY(b.north, z)) + 1;
    if (tilesX <= maxTilesPerSide && tilesY <= maxTilesPerSide) return z;
  }
  return 2;
}

/** Shrink bounds to a square of `spanM` metres about `at` (default: the centre). */
export function capSpan(
  b: Bounds,
  spanM: number,
  centerLat: number,
  at?: { lat: number; lon: number },
): Bounds {
  if (!Number.isFinite(spanM)) return b;
  const cLat = at?.lat ?? (b.south + b.north) / 2;
  const cLon = at?.lon ?? (b.west + b.east) / 2;
  const halfLat = spanM / 2 / M_PER_DEG_LAT;
  const halfLon = spanM / 2 / Math.max(1, metersPerDegLon(centerLat));
  // Clamped to the patch, then nudged back to full span if the clamp bit, so a
  // ring near the patch edge keeps its resolution instead of shrinking.
  const south = Math.max(b.south, Math.min(cLat - halfLat, b.north - 2 * halfLat));
  const west = Math.max(b.west, Math.min(cLon - halfLon, b.east - 2 * halfLon));
  return {
    south,
    north: Math.min(b.north, south + 2 * halfLat),
    west,
    east: Math.min(b.east, west + 2 * halfLon),
  };
}

/** Local ENU rect (x = East, z = -North, metres) covered by imagery bounds. */
export function ringRect(grid: ElevationGrid, b: Bounds): Omit<DrapeRing, 'texture'> {
  return {
    minX: (b.west - grid.centerLon) * grid.mPerDegLon,
    maxX: (b.east - grid.centerLon) * grid.mPerDegLon,
    // z = -north, so the northern edge is the smaller z.
    minZ: -(b.north - grid.centerLat) * M_PER_DEG_LAT,
    maxZ: -(b.south - grid.centerLat) * M_PER_DEG_LAT,
  };
}

/**
 * Fetch and stitch imagery for one ring. Returns null when nothing loaded, so
 * the caller can fall back to the elevation ramp instead of a blank drape.
 */
async function loadRing(b: Bounds, maxTilesPerSide: number, imagery: SvtImagery): Promise<{ canvas: HTMLCanvasElement } & Bounds | null> {
  const z = bestZoom(b, maxTilesPerSide, imageryMaxZoom(imagery));
  const n = 2 ** z;
  const clamp = (v: number) => Math.max(0, Math.min(n - 1, v));
  const x0 = clamp(Math.floor(lonToTileX(b.west, z)));
  const x1 = clamp(Math.floor(lonToTileX(b.east, z)));
  const y0 = clamp(Math.floor(latToTileY(b.north, z)));
  const y1 = clamp(Math.floor(latToTileY(b.south, z)));
  const tilesX = x1 - x0 + 1;
  const tilesY = y1 - y0 + 1;

  const canvas = document.createElement('canvas');
  canvas.width = tilesX * TILE_SIZE;
  canvas.height = tilesY * TILE_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let loaded = 0;
  await Promise.all(
    Array.from({ length: tilesX * tilesY }, (_unused, idx) => {
      const cx = idx % tilesX;
      const cy = Math.floor(idx / tilesX);
      const url = `tile-cache://${imagery}/{z}/{x}/{y}.png`
        .replace('{z}', String(z))
        .replace('{x}', String(x0 + cx))
        .replace('{y}', String(y0 + cy));
      return loadTileImage(url).then((img) => {
        if (!img) return;
        loaded++;
        ctx.drawImage(img, cx * TILE_SIZE, cy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
      });
    }),
  );
  if (loaded === 0) return null;

  // Tile edges, not the requested box: the mosaic overshoots the request, and
  // UVs must be computed against what the pixels actually cover.
  return {
    canvas,
    west: tileXToLon(x0, z),
    east: tileXToLon(x1 + 1, z),
    north: tileYToLat(y0, z),
    south: tileYToLat(y1 + 1, z),
  };
}

/**
 * Build the drape rings for a terrain grid. `outerTiles` is the per-side tile
 * budget for the wider rings (the quality setting); the innermost ring always
 * gets the full budget so the near field is as sharp as the imagery allows.
 */
export async function loadDrapeRings(
  grid: ElevationGrid,
  outerTiles: number,
  at?: { lat: number; lon: number },
  spans: number[] = RING_SPANS_M,
  innerTiles: number = INNER_RING_TILES,
  imagery: SvtImagery = DEFAULT_SVT_IMAGERY,
): Promise<DrapeRing[]> {
  const maxZoom = imageryMaxZoom(imagery);
  const dLat = grid.halfSizeM / M_PER_DEG_LAT;
  const dLon = grid.halfSizeM / grid.mPerDegLon;
  const patch: Bounds = {
    south: grid.centerLat - dLat,
    north: grid.centerLat + dLat,
    west: grid.centerLon - dLon,
    east: grid.centerLon + dLon,
  };

  const rings: DrapeRing[] = [];
  for (let i = 0; i < spans.length; i++) {
    const budget = i === 0 ? innerTiles : Math.min(outerTiles, MAX_OUTER_RING_TILES);
    const span = i === 0 ? innerSpanM(spans[i]!, grid.centerLat, budget, maxZoom) : spans[i]!;
    const mosaic = await loadRing(capSpan(patch, span, grid.centerLat, at), budget, imagery);
    if (!mosaic) continue;
    const texture = new THREE.CanvasTexture(mosaic.canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter;
    // Raised to the driver max by the scene, which owns the renderer: at the
    // grazing angles terrain is viewed at, anisotropy is what keeps the ground
    // ahead of the aircraft from smearing into mush.
    texture.anisotropy = 16;
    texture.wrapS = THREE.ClampToEdgeWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    rings.push({ texture, ...ringRect(grid, mosaic) });
  }
  return rings;
}
