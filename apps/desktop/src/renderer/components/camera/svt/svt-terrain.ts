/**
 * Synthetic-vision terrain: turn a patch of the world around the vehicle into a
 * vertex-colored 3D mesh.
 *
 * Elevation comes from the same free Open-Meteo DEM the rest of the app uses
 * (utils/elevation-api), cached so re-entering an area is instant. The grid is a
 * square of `res × res` samples spanning ±`halfSizeM` metres about a centre
 * lat/lon, laid out in a local ENU tangent plane:
 *
 *   three.x =  East
 *   three.y =  elevation (MSL metres)
 *   three.z = -North
 *
 * which matches the simulator/vehicle three layers, so the synthetic camera can
 * reuse their heading/pitch/roll euler convention.
 */

import * as THREE from 'three';
import { getElevations } from '../../../utils/elevation-api';
import { svtTerrainColor } from './svt-colors';
import { loadHeightfield, pickZoom, sampleHeightfield } from './svt-dem-tiles';

/** Metres per degree of latitude (spherical-earth approximation). */
export const M_PER_DEG_LAT = 111_320;

/**
 * Default synthetic-vision terrain extent and density.
 *
 * The patch is large enough to reach a natural, distant horizon (it is sampled
 * from stitched DEM tiles, so density is cheap). It re-centres on the vehicle
 * every SVT_REBUILD_DISTANCE_M; light haze near the far edge reads as
 * atmosphere rather than a wall.
 */
export const SVT_HALF_SIZE_M = 25_000;
/** Vertices per side (mesh density). Tile sampling is in-memory, so this is free. */
export const SVT_GRID_RES = 96;
/** Rebuild the grid once the vehicle drifts this far from its centre. */
export const SVT_REBUILD_DISTANCE_M = 6_000;

export interface ElevationGrid {
  centerLat: number;
  centerLon: number;
  /** Half-extent of the square patch, metres. */
  halfSizeM: number;
  /** Vertices per side. */
  res: number;
  /** Row-major elevations (MSL m), length res*res. Row 0 = north edge. */
  elev: Float32Array;
  /** Metres per degree of longitude at the centre latitude. */
  mPerDegLon: number;
}

/** Metres per degree of longitude at a given latitude. */
export function metersPerDegLon(lat: number): number {
  return M_PER_DEG_LAT * Math.cos((lat * Math.PI) / 180);
}

/** Great-ish-circle distance in metres (equirectangular, fine at these scales). */
export function approxDistanceM(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * M_PER_DEG_LAT;
  const dLon = (lon2 - lon1) * metersPerDegLon((lat1 + lat2) / 2);
  return Math.hypot(dLat, dLon);
}

/** Local ENU metres (x = East, z = -North) of a lat/lon relative to the grid centre. */
export function lonLatToLocal(grid: ElevationGrid, lat: number, lon: number): { x: number; z: number } {
  const east = (lon - grid.centerLon) * grid.mPerDegLon;
  const north = (lat - grid.centerLat) * M_PER_DEG_LAT;
  return { x: east, z: -north };
}

/** East/North (metres from centre) of grid vertex (col i, row j). Row 0 = north. */
function vertexEastNorth(halfSizeM: number, res: number, i: number, j: number): { east: number; north: number } {
  const t = res > 1 ? res - 1 : 1;
  return {
    east: -halfSizeM + (i / t) * 2 * halfSizeM,
    north: halfSizeM - (j / t) * 2 * halfSizeM,
  };
}

/**
 * Build the elevation grid for a patch centred on (centerLat, centerLon).
 * Samples stitched DEM tiles; if no tiles are available (offline / nothing
 * cached) it falls back to the per-point elevation API so the view still works.
 */
export async function loadElevationGrid(
  centerLat: number,
  centerLon: number,
  halfSizeM = SVT_HALF_SIZE_M,
  res = SVT_GRID_RES,
): Promise<ElevationGrid> {
  const mPerDegLon = metersPerDegLon(centerLat);
  const dLat = halfSizeM / M_PER_DEG_LAT;
  const dLon = halfSizeM / mPerDegLon;
  const zoom = pickZoom(halfSizeM, centerLat);

  const hf = await loadHeightfield(centerLat - dLat, centerLon - dLon, centerLat + dLat, centerLon + dLon, zoom);
  if (hf.loadedTiles === 0) {
    return loadElevationGridPointwise(centerLat, centerLon, halfSizeM, mPerDegLon, res);
  }

  const elev = new Float32Array(res * res);
  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const { east, north } = vertexEastNorth(halfSizeM, res, i, j);
      const lat = centerLat + north / M_PER_DEG_LAT;
      const lon = centerLon + east / mPerDegLon;
      elev[j * res + i] = sampleHeightfield(hf, lat, lon);
    }
  }
  return { centerLat, centerLon, halfSizeM, res, elev, mPerDegLon };
}

/**
 * A reference grid of line segments draped ON the terrain surface (same vertices
 * as the mesh, lifted `yOffset` m so it rides the elevation instead of hovering
 * as a flat plane). `stride` picks every Nth grid vertex as a grid line, so the
 * cell size is roughly `stride * 2*halfSizeM/(res-1)` metres. Gives the pilot a
 * topographic reference that keeps spatial perception over a degraded feed and
 * converges to the horizon (depth cue). Returns line-segment positions to feed a
 * THREE.LineSegments.
 */
export function buildTerrainGridGeometry(grid: ElevationGrid, stride = 2, yOffset = 2): THREE.BufferGeometry {
  const { res, halfSizeM, elev } = grid;
  const yAt = (i: number, j: number): number => (elev[j * res + i] ?? 0) + yOffset;
  const pos: number[] = [];
  // Lines running east (constant row j).
  for (let j = 0; j < res; j += stride) {
    for (let i = 0; i + stride < res; i += stride) {
      const a = vertexEastNorth(halfSizeM, res, i, j);
      const b = vertexEastNorth(halfSizeM, res, i + stride, j);
      pos.push(a.east, yAt(i, j), -a.north, b.east, yAt(i + stride, j), -b.north);
    }
  }
  // Lines running north (constant col i).
  for (let i = 0; i < res; i += stride) {
    for (let j = 0; j + stride < res; j += stride) {
      const a = vertexEastNorth(halfSizeM, res, i, j);
      const b = vertexEastNorth(halfSizeM, res, i, j + stride);
      pos.push(a.east, yAt(i, j), -a.north, a.east, yAt(i, j + stride), -b.north);
    }
  }
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return geom;
}

/** Offline fallback: sample the per-point elevation API on a coarse grid. */
async function loadElevationGridPointwise(
  centerLat: number,
  centerLon: number,
  halfSizeM: number,
  mPerDegLon: number,
  res: number,
): Promise<ElevationGrid> {
  // Cap density so the fallback stays within a handful of batched requests.
  const fallbackRes = Math.min(res, 40);
  const points: Array<{ lat: number; lon: number }> = [];
  for (let j = 0; j < fallbackRes; j++) {
    for (let i = 0; i < fallbackRes; i++) {
      const { east, north } = vertexEastNorth(halfSizeM, fallbackRes, i, j);
      points.push({ lat: centerLat + north / M_PER_DEG_LAT, lon: centerLon + east / mPerDegLon });
    }
  }
  const sampled = await getElevations(points);
  const elev = new Float32Array(fallbackRes * fallbackRes);
  for (let k = 0; k < elev.length; k++) elev[k] = sampled[k] ?? 0;
  return { centerLat, centerLon, halfSizeM, res: fallbackRes, elev, mPerDegLon };
}

/**
 * Build a vertex-colored, normal-shaded BufferGeometry from an elevation grid.
 * Caller owns disposal.
 */
export function buildTerrainGeometry(grid: ElevationGrid): THREE.BufferGeometry {
  const { res, halfSizeM, elev } = grid;
  const positions = new Float32Array(res * res * 3);
  const colors = new Float32Array(res * res * 3);

  for (let j = 0; j < res; j++) {
    for (let i = 0; i < res; i++) {
      const k = j * res + i;
      const { east, north } = vertexEastNorth(halfSizeM, res, i, j);
      const e = elev[k]!;
      positions[k * 3] = east;
      positions[k * 3 + 1] = e;
      positions[k * 3 + 2] = -north;
      const [r, g, b] = svtTerrainColor(e);
      colors[k * 3] = r;
      colors[k * 3 + 1] = g;
      colors[k * 3 + 2] = b;
    }
  }

  // Two triangles per cell, wound CCW so computed normals face up (+Y).
  const indices: number[] = [];
  for (let j = 0; j < res - 1; j++) {
    for (let i = 0; i < res - 1; i++) {
      const a = j * res + i;
      const b = j * res + i + 1;
      const c = (j + 1) * res + i;
      const d = (j + 1) * res + i + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Bilinearly sample terrain elevation (MSL m) at a lat/lon. Positions outside
 * the grid clamp to the nearest edge sample rather than returning 0, so the
 * synthetic camera height never plunges as the vehicle nears a boundary.
 */
export function sampleElevation(grid: ElevationGrid, lat: number, lon: number): number {
  const { x, z } = lonLatToLocal(grid, lat, lon);
  const east = x;
  const north = -z;
  const t = grid.res - 1;
  const fi = Math.min(t, Math.max(0, ((east + grid.halfSizeM) / (2 * grid.halfSizeM)) * t));
  const fj = Math.min(t, Math.max(0, ((grid.halfSizeM - north) / (2 * grid.halfSizeM)) * t));

  const i0 = Math.floor(fi);
  const j0 = Math.floor(fj);
  const i1 = Math.min(i0 + 1, t);
  const j1 = Math.min(j0 + 1, t);
  const ti = fi - i0;
  const tj = fj - j0;

  const e00 = grid.elev[j0 * grid.res + i0]!;
  const e10 = grid.elev[j0 * grid.res + i1]!;
  const e01 = grid.elev[j1 * grid.res + i0]!;
  const e11 = grid.elev[j1 * grid.res + i1]!;
  const e0 = e00 + (e10 - e00) * ti;
  const e1 = e01 + (e11 - e01) * ti;
  return e0 + (e1 - e0) * tj;
}
