/** OSM buildings extruded on the SVT terrain. Missing heights are guessed from levels or type: indicative only. */

import * as THREE from 'three';
import Pbf from 'pbf';
import { PMTiles } from 'pmtiles';
import { VectorTile, type VectorTileFeature } from '@mapbox/vector-tile';
import type { Polygon, MultiPolygon } from 'geojson';
import { type ElevationGrid, lonLatToLocal, sampleElevation, M_PER_DEG_LAT, metersPerDegLon } from './svt-terrain';

import type { SvtBuildings } from './svt-building-sources';
import { buildingExcluded, type ExclusionZone } from '../../../three/scene-model-exclusion';

/** Buildings are drawn this far around the aircraft; past it they are specks. */
export const BUILDINGS_RADIUS_M = 2_500;
/** Reload once the aircraft has moved this far from where the set was loaded. */
export const BUILDINGS_RECENTER_M = 1_000;
const MAX_BUILDINGS = 20_000;
const TILE_ZOOM = 14;
const OVERTURE_FALLBACK_URL = 'https://overturemaps-extras-us-west-2.s3.us-west-2.amazonaws.com/tiles/2026-09-23.1/buildings.pmtiles';
const DEFAULT_FACADE = new THREE.Color(0xd8d2c8);
const DEFAULT_ROOF = new THREE.Color(0xc4beb4);

export interface Building {
  /** [lon, lat] rings: the outline first, then holes (courtyards). */
  rings: Array<Array<[number, number]>>;
  heightM: number;
  /** Height the walls start at: building parts on stilts or over a passage. */
  minHeightM: number;
  /** Facade and roof colours where the data has them (Overture). */
  facade?: string;
  roof?: string;
}

// ─── Heights from OSM tags ───────────────────────────────────────────────────

const LEVEL_M = 3;
const TYPE_HEIGHT_M: Record<string, number> = {
  house: 7, detached: 7, semidetached_house: 7, terrace: 8, bungalow: 4, residential: 10, apartments: 14,
  garage: 3, garages: 3, shed: 3, carport: 3, hut: 3, roof: 4, kiosk: 3, cabin: 4,
  industrial: 10, warehouse: 10, retail: 7, commercial: 12, office: 14, church: 18, cathedral: 30,
  hospital: 18, school: 10, university: 14, hangar: 10, barn: 8, farm_auxiliary: 6, greenhouse: 4,
};

function metres(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const m = /^\s*(-?\d+(?:\.\d+)?)\s*(m|ft|')?/.exec(v);
  if (!m) return undefined;
  const n = Number(m[1]);
  return m[2] === 'ft' || m[2] === "'" ? n * 0.3048 : n;
}

/** Height and base height from OSM tags, with the documented fallbacks. */
export function heightFromTags(tags: Record<string, string>): { heightM: number; minHeightM: number } {
  const levels = Number(tags['building:levels']);
  const roofLevels = Number(tags['roof:levels']);
  const minLevel = Number(tags['building:min_level']);
  const height =
    metres(tags.height) ??
    (levels > 0 ? (levels + (roofLevels > 0 ? roofLevels : 0)) * LEVEL_M + 1 : undefined) ??
    TYPE_HEIGHT_M[tags.building ?? tags['building:part'] ?? ''] ??
    8;
  const min = metres(tags.min_height) ?? (minLevel > 0 ? minLevel * LEVEL_M : 0);
  return { heightM: Math.max(height, min + 1), minHeightM: Math.max(0, min) };
}

// ─── Sources ─────────────────────────────────────────────────────────────────

function bbox(lat: number, lon: number, radiusM: number) {
  const dLat = radiusM / M_PER_DEG_LAT;
  const dLon = radiusM / metersPerDegLon(lat);
  return { south: lat - dLat, north: lat + dLat, west: lon - dLon, east: lon + dLon };
}

const lonToTileX = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * 2 ** z);
const latToTileY = (lat: number, z: number) => {
  const r = (lat * Math.PI) / 180;
  return Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** z);
};

type TileSource = 'openfreemap' | 'overture';
const tileCache = new Map<string, Promise<Building[]>>();

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);
const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v) ? v : undefined);

function polygonsOf(f: VectorTileFeature, x: number, y: number): Array<Array<Array<[number, number]>>> {
  const geom = f.toGeoJSON(x, y, TILE_ZOOM).geometry as Polygon | MultiPolygon;
  const polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.type === 'MultiPolygon' ? geom.coordinates : [];
  return polys as Array<Array<Array<[number, number]>>>;
}

/** OpenFreeMap: heights already resolved into render_height. */
function fromOpenFreeMap(tile: VectorTile, x: number, y: number): Building[] {
  const layer = tile.layers.building;
  const out: Building[] = [];
  for (let i = 0; layer && i < layer.length; i++) {
    const f = layer.feature(i);
    if (f.properties.hide_3d === true) continue;
    const heightM = num(f.properties.render_height) ?? 8;
    const minHeightM = num(f.properties.render_min_height) ?? 0;
    for (const rings of polygonsOf(f, x, y)) out.push({ rings, heightM, minHeightM });
  }
  return out;
}

/** Overture: a building with parts is drawn as its parts; underground ones are skipped. */
function fromOverture(tile: VectorTile, x: number, y: number): Building[] {
  const out: Building[] = [];
  for (const name of ['building', 'building_part'] as const) {
    const layer = tile.layers[name];
    for (let i = 0; layer && i < layer.length; i++) {
      const p = layer.feature(i).properties;
      if (p.is_underground === true || (name === 'building' && p.has_parts === true)) continue;
      const floors = num(p.num_floors);
      const heightM = num(p.height) ?? (floors ? floors * LEVEL_M + 1 : 8);
      const minHeightM = num(p.min_height) ?? ((num(p.min_floor) ?? 0) * LEVEL_M);
      const facade = hex(p.facade_color);
      const roof = hex(p.roof_color);
      for (const rings of polygonsOf(layer.feature(i), x, y)) {
        out.push({ rings, heightM: Math.max(heightM, minHeightM + 1), minHeightM, facade, roof });
      }
    }
  }
  return out;
}

let ofmTemplate: Promise<string> | null = null;
let overture: PMTiles | null = null;

/** Without the main-process cache (an app not restarted since it was added), fetch uncached. */
async function fetchTileDirect(source: TileSource, x: number, y: number): Promise<Uint8Array | null> {
  if (source === 'overture') {
    overture ??= new PMTiles(OVERTURE_FALLBACK_URL);
    const tile = await overture.getZxy(TILE_ZOOM, x, y);
    return tile ? new Uint8Array(tile.data) : null;
  }
  ofmTemplate ??= fetch('https://tiles.openfreemap.org/planet')
    .then((r) => r.json() as Promise<{ tiles: string[] }>)
    .then((j) => j.tiles[0]!)
    .catch((err) => { ofmTemplate = null; throw err; });
  const res = await fetch((await ofmTemplate).replace('{z}', String(TILE_ZOOM)).replace('{x}', String(x)).replace('{y}', String(y)));
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

/** Buildings in one z14 vector tile from either tile source. */
export function parseBuildingTile(source: TileSource, bytes: Uint8Array, x: number, y: number): Building[] {
  const tile = new VectorTile(new Pbf(bytes));
  return source === 'overture' ? fromOverture(tile, x, y) : fromOpenFreeMap(tile, x, y);
}

function tileBuildings(source: TileSource, x: number, y: number): Promise<Building[]> {
  const key = `${source}/${x}/${y}`;
  let p = tileCache.get(key);
  if (!p) {
    p = (async () => {
      // through the main process: it keeps a disk cache, so flown and baked areas work offline
      const bytes = window.electronAPI?.buildingsGetTile
        ? await window.electronAPI.buildingsGetTile(source, x, y)
        : await fetchTileDirect(source, x, y);
      // null is a failed or cancelled fetch: thrown so it is not remembered as an empty tile
      if (!bytes) throw new Error('tile unavailable'); // i18n-exempt: internal
      if (bytes.byteLength === 0) return [];
      return parseBuildingTile(source, bytes, x, y);
    })().catch(() => {
      tileCache.delete(key);
      return [];
    });
    tileCache.set(key, p);
    if (tileCache.size > 400) tileCache.delete(tileCache.keys().next().value!);
  }
  return p;
}

/** OpenFreeMap or Overture vector tiles around a point, from the disk cache or the network. */
export async function loadTileBuildings(source: TileSource, lat: number, lon: number, radiusM = BUILDINGS_RADIUS_M): Promise<Building[]> {
  const b = bbox(lat, lon, radiusM);
  const jobs: Promise<Building[]>[] = [];
  for (let x = lonToTileX(b.west, TILE_ZOOM); x <= lonToTileX(b.east, TILE_ZOOM); x++) {
    for (let y = latToTileY(b.north, TILE_ZOOM); y <= latToTileY(b.south, TILE_ZOOM); y++) jobs.push(tileBuildings(source, x, y));
  }
  return (await Promise.all(jobs)).flat();
}

const OVERPASS = ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter'];
const overpassCache = new Map<string, Promise<Building[]>>();

interface OverpassWay { type: string; tags?: Record<string, string>; geometry?: Array<{ lat: number; lon: number }> }

/** Live OpenStreetMap through Overpass: always current, but a shared service, so asked sparingly and cached. */
export function loadOverpassBuildings(lat: number, lon: number, radiusM = BUILDINGS_RADIUS_M): Promise<Building[]> {
  // one query per ~1 km cell keeps a circling aircraft from hammering the servers
  const key = `${Math.round(lat * 100)}:${Math.round(lon * 100)}`;
  let p = overpassCache.get(key);
  if (p) return p;
  const b = bbox(lat, lon, radiusM);
  const query = `[out:json][timeout:25];(way["building"](${b.south},${b.west},${b.north},${b.east});way["building:part"](${b.south},${b.west},${b.north},${b.east}););out tags geom;`;
  p = (async () => {
    let lastError: unknown = null;
    for (const url of OVERPASS) {
      try {
        const res = await fetch(url, { method: 'POST', body: new URLSearchParams({ data: query }), headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(30_000) });
        if (!res.ok) { lastError = new Error(`Overpass ${res.status}`); continue; } // i18n-exempt: internal, the view shows its own text
        const json = (await res.json()) as { elements: OverpassWay[] };
        return json.elements
          .filter((e) => e.type === 'way' && e.geometry && e.geometry.length >= 4)
          .map((e) => ({ rings: [e.geometry!.map((g) => [g.lon, g.lat] as [number, number])], ...heightFromTags(e.tags ?? {}) }));
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError ?? new Error('Overpass unavailable'); // i18n-exempt: internal, the view shows its own text
  })().catch((err) => {
    overpassCache.delete(key);
    throw err;
  });
  overpassCache.set(key, p);
  if (overpassCache.size > 50) overpassCache.delete(overpassCache.keys().next().value!);
  return p;
}

/** Stop the tile downloads the view started (buildings switched off or to another source). */
export function cancelBuildingLoads(): void {
  void window.electronAPI?.buildingsCancelView?.();
}

export function loadBuildings(source: SvtBuildings, lat: number, lon: number): Promise<Building[]> {
  if (source === 'openfreemap' || source === 'overture') return loadTileBuildings(source, lat, lon);
  if (source === 'overpass') return loadOverpassBuildings(lat, lon);
  return Promise.resolve([]);
}

// ─── Geometry ────────────────────────────────────────────────────────────────

/** One mesh for all buildings, each standing on the lowest terrain under its footprint so no corner floats. */
export function buildBuildingsGeometry(
  buildings: Building[],
  grid: ElevationGrid,
  center: { lat: number; lon: number },
  radiusM = BUILDINGS_RADIUS_M,
  exclusions: ExclusionZone[] = [],
): THREE.BufferGeometry | null {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  // per vertex: 1 on roofs; on walls, metres along the wall and above the ground (for the window pattern)
  const roof: number[] = [];
  const wallUv: number[] = [];
  const colourCache = new Map<string, THREE.Color>();
  const colour = (css: string | undefined, fallback: THREE.Color) => {
    if (!css) return fallback;
    let c = colourCache.get(css);
    if (!c) colourCache.set(css, (c = new THREE.Color(css)));
    return c;
  };
  let wallColour = DEFAULT_FACADE;
  let groundY = 0;
  let along = 0;
  const wall = (ax: number, az: number, bx: number, bz: number, y0: number, y1: number) => {
    const nx = bz - az;
    const nz = -(bx - ax);
    const len = Math.hypot(nx, nz) || 1;
    pos.push(ax, y0, az, bx, y0, bz, bx, y1, bz, ax, y0, az, bx, y1, bz, ax, y1, az);
    const u0 = along;
    const u1 = along + len;
    const v0 = y0 - groundY;
    const v1 = y1 - groundY;
    wallUv.push(u0, v0, u1, v0, u1, v1, u0, v0, u1, v1, u0, v1);
    along = u1;
    for (let k = 0; k < 6; k++) {
      nrm.push(nx / len, 0, nz / len);
      col.push(wallColour.r, wallColour.g, wallColour.b);
      roof.push(0);
    }
  };
  const center2 = lonLatToLocal(grid, center.lat, center.lon);
  let count = 0;
  for (const b of buildings) {
    if (count >= MAX_BUILDINGS) break;
    const rings = b.rings
      .map((ring) => {
        const pts = ring.map(([lon, lat]) => lonLatToLocal(grid, lat, lon));
        // drop the closing duplicate; triangulation wants an open ring
        const last = pts[pts.length - 1];
        if (pts.length > 1 && last && last.x === pts[0]!.x && last.z === pts[0]!.z) pts.pop();
        return pts;
      })
      .filter((r) => r.length >= 3);
    const outer = rings[0];
    if (!outer) continue;
    const c = outer[0]!;
    if (Math.hypot(c.x - center2.x, c.z - center2.z) > radiusM) continue;
    if (Math.abs(c.x) > grid.halfSizeM || Math.abs(c.z) > grid.halfSizeM) continue;
    if (exclusions.length > 0 && buildingExcluded(b.rings[0]!, exclusions)) continue;

    let ground = Infinity;
    for (const [lon, lat] of b.rings[0]!) ground = Math.min(ground, sampleElevation(grid, lat, lon));
    if (!Number.isFinite(ground)) continue;
    const top = ground + b.heightM;
    // sunk a little so a slope never shows a gap under the wall
    const bottom = b.minHeightM > 0 ? ground + b.minHeightM : ground - 2;

    // no colour in the data: vary the shade a little so a street is not one flat block
    wallColour = b.facade ? colour(b.facade, DEFAULT_FACADE) : DEFAULT_FACADE.clone().multiplyScalar(0.9 + ((count * 7919) % 100) / 500);
    const roofColour = colour(b.roof, b.facade ? wallColour : DEFAULT_ROOF);
    groundY = ground;
    for (const ring of rings) {
      along = 0;
      for (let i = 0; i < ring.length; i++) {
        const a = ring[i]!;
        const n = ring[(i + 1) % ring.length]!;
        wall(a.x, a.z, n.x, n.z, bottom, top);
      }
    }
    const contour = outer.map((p) => new THREE.Vector2(p.x, p.z));
    const holes = rings.slice(1).map((r) => r.map((p) => new THREE.Vector2(p.x, p.z)));
    const flat = [...contour, ...holes.flat()];
    for (const tri of THREE.ShapeUtils.triangulateShape(contour, holes)) {
      for (const idx of tri) {
        const p = flat[idx]!;
        pos.push(p.x, top, p.y);
        nrm.push(0, 1, 0);
        col.push(roofColour.r, roofColour.g, roofColour.b);
        roof.push(1);
        wallUv.push(0, 0);
      }
    }
    count++;
  }
  if (pos.length === 0) return null;
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geometry.setAttribute('aRoof', new THREE.Float32BufferAttribute(roof, 1));
  geometry.setAttribute('aWall', new THREE.Float32BufferAttribute(wallUv, 2));
  geometry.computeBoundingSphere();
  return geometry;
}
