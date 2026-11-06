import proj4 from 'proj4';
import { ShapeUtils, Vector2 } from 'three';
import { t } from '../../i18n/index.js';
import { enuBasis, geodeticToEcef, type Geodetic, type Vec3 } from '../geodesy';
import { builtinProj4, horizontalEpsgFor, isEllipsoidalEpsg, parseEpsgCode } from './crs';
import type { CityJsonMesh } from './types';

type Ring = number[];
type Surface = Ring[];

interface CityGeometry {
  type?: string;
  lod?: string | number;
  boundaries?: unknown;
}

interface CityObject {
  type?: string;
  geometry?: CityGeometry[];
}

interface CityJsonDoc {
  type?: string;
  CityObjects?: Record<string, CityObject>;
  vertices?: number[][];
  transform?: { scale?: number[]; translate?: number[] };
  metadata?: { referenceSystem?: unknown };
}

const DEPTH: Record<string, number> = { MultiSurface: 0, CompositeSurface: 0, Solid: 1, MultiSolid: 2, CompositeSolid: 2 };

function surfacesOf(g: CityGeometry): Surface[] {
  const depth = g.type ? DEPTH[g.type] : undefined;
  if (depth === undefined || !Array.isArray(g.boundaries)) return [];
  let list: unknown[] = g.boundaries;
  for (let i = 0; i < depth; i++) list = list.flatMap((x) => (Array.isArray(x) ? x : []));
  return list.filter((s): s is Surface => Array.isArray(s) && s.every((r) => Array.isArray(r)));
}

function bestGeometries(obj: CityObject): CityGeometry[] {
  const geoms = (obj.geometry ?? []).filter((g) => g && g.type && DEPTH[g.type] !== undefined);
  if (geoms.length === 0) return [];
  const lodOf = (g: CityGeometry): number => {
    const n = typeof g.lod === 'number' ? g.lod : parseFloat(String(g.lod ?? ''));
    return Number.isFinite(n) ? n : -1;
  };
  const top = Math.max(...geoms.map(lodOf));
  return geoms.filter((g) => lodOf(g) === top);
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function newell(pts: Vec3[]): Vec3 {
  const n: Vec3 = [0, 0, 0];
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!, b = pts[(i + 1) % pts.length]!;
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

function cleanRing(ring: Ring): Ring {
  const out: Ring = [];
  for (const v of ring) if (out[out.length - 1] !== v) out.push(v);
  while (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
  return out;
}

export function convexHull(points: Array<[number, number]>): Array<[number, number]> {
  const pts = [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (pts.length < 3) return pts;
  const turn = (o: [number, number], a: [number, number], b: [number, number]): number =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const p of pts) {
    while (lower.length >= 2 && turn(lower[lower.length - 2]!, lower[lower.length - 1]!, p) <= 0) lower.pop();
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]!;
    while (upper.length >= 2 && turn(upper[upper.length - 2]!, upper[upper.length - 1]!, p) <= 0) upper.pop();
    upper.push(p);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

interface MeshPart {
  id: string;
  type: string;
  positions: Float32Array;
  normals: Float32Array;
}

function writeGlb(parts: MeshPart[]): Uint8Array {
  const bufferViews: object[] = [];
  const accessors: object[] = [];
  const meshes: object[] = [];
  const nodes: object[] = [];
  const chunks: Float32Array[] = [];
  let offset = 0;
  const addView = (data: Float32Array): number => {
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: data.byteLength, target: 34962 });
    chunks.push(data);
    offset += data.byteLength;
    return bufferViews.length - 1;
  };
  for (const part of parts) {
    const count = part.positions.length / 3;
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < part.positions.length; i++) {
      const v = part.positions[i]!;
      if (v < min[i % 3]!) min[i % 3] = v;
      if (v > max[i % 3]!) max[i % 3] = v;
    }
    accessors.push({ bufferView: addView(part.positions), componentType: 5126, count, type: 'VEC3', min, max });
    accessors.push({ bufferView: addView(part.normals), componentType: 5126, count, type: 'VEC3' });
    meshes.push({ primitives: [{ attributes: { POSITION: accessors.length - 2, NORMAL: accessors.length - 1 }, material: 0, mode: 4 }] });
    nodes.push({ name: part.id, mesh: meshes.length - 1, extras: { id: part.id, type: part.type } });
  }
  const gltf = {
    asset: { version: '2.0', generator: 'ArduDeck CityJSON' },
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.82, 0.8, 0.76, 1], metallicFactor: 0, roughnessFactor: 0.9 }, doubleSided: true }],
    accessors,
    bufferViews,
    buffers: [{ byteLength: offset }],
  };
  const jsonRaw = new TextEncoder().encode(JSON.stringify(gltf));
  const jsonLen = Math.ceil(jsonRaw.length / 4) * 4;
  const binLen = Math.ceil(offset / 4) * 4;
  const total = 12 + 8 + jsonLen + 8 + binLen;
  const out = new Uint8Array(total);
  const dv = new DataView(out.buffer);
  dv.setUint32(0, 0x46546c67, true);
  dv.setUint32(4, 2, true);
  dv.setUint32(8, total, true);
  dv.setUint32(12, jsonLen, true);
  dv.setUint32(16, 0x4e4f534a, true);
  out.set(jsonRaw, 20);
  out.fill(0x20, 20 + jsonRaw.length, 20 + jsonLen);
  const binStart = 20 + jsonLen;
  dv.setUint32(binStart, binLen, true);
  dv.setUint32(binStart + 4, 0x004e4942, true);
  let p = binStart + 8;
  for (const c of chunks) {
    out.set(new Uint8Array(c.buffer, c.byteOffset, c.byteLength), p);
    p += c.byteLength;
  }
  return out;
}

/** CityJSON (1.x/2.x) to a GLB, reprojected from metadata.referenceSystem with proj4. Throws a pilot-facing message for an unknown CRS. */
export async function cityJsonToGlb(json: unknown, resolveCrs: (epsg: number) => Promise<string | null>): Promise<CityJsonMesh> {
  const doc = json as CityJsonDoc;
  if (!doc || typeof doc !== 'object' || doc.type !== 'CityJSON' || typeof doc.CityObjects !== 'object' || !Array.isArray(doc.vertices)) {
    throw new Error(t('shared:userModelParsers.notCityJson'));
  }
  const epsg = parseEpsgCode(doc.metadata?.referenceSystem);
  if (epsg === null) throw new Error(t('shared:userModelParsers.noCrs'));
  const horizontal = horizontalEpsgFor(epsg);
  const def = builtinProj4(horizontal) ?? (await resolveCrs(horizontal));
  if (!def) throw new Error(t('shared:userModelParsers.unknownCrs', { epsg }));
  let forward: (xy: [number, number]) => [number, number];
  try {
    const conv = proj4(def, 'WGS84');
    forward = (xy) => conv.forward(xy) as [number, number];
  } catch {
    throw new Error(t('shared:userModelParsers.unknownCrs', { epsg }));
  }

  const scale = doc.transform?.scale ?? [1, 1, 1];
  const translate = doc.transform?.translate ?? [0, 0, 0];
  const vertices = doc.vertices;
  const geo = new Map<number, Geodetic>();
  const geodeticOf = (i: number): Geodetic | null => {
    const hit = geo.get(i);
    if (hit) return hit;
    const v = vertices[i];
    if (!v || v.length < 3) return null;
    const x = v[0]! * scale[0]! + translate[0]!, y = v[1]! * scale[1]! + translate[1]!, z = v[2]! * scale[2]! + translate[2]!;
    const [lng, lat] = forward([x, y]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    const g = { lat, lng, hEll: z };
    geo.set(i, g);
    return g;
  };

  const objects: Array<{ id: string; type: string; surfaces: Surface[] }> = [];
  let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, minH = Infinity, maxH = -Infinity;
  for (const [id, obj] of Object.entries(doc.CityObjects ?? {})) {
    const surfaces = bestGeometries(obj ?? {}).flatMap(surfacesOf).map((s) => s.map(cleanRing));
    if (surfaces.length === 0) continue;
    for (const s of surfaces) for (const r of s) for (const i of r) {
      const g = geodeticOf(i);
      if (!g) continue;
      minLat = Math.min(minLat, g.lat); maxLat = Math.max(maxLat, g.lat);
      minLng = Math.min(minLng, g.lng); maxLng = Math.max(maxLng, g.lng);
      minH = Math.min(minH, g.hEll); maxH = Math.max(maxH, g.hEll);
    }
    objects.push({ id, type: obj?.type ?? '', surfaces });
  }
  if (!Number.isFinite(minLat)) throw new Error(t('shared:userModelParsers.noGeometry'));

  const origin: Geodetic = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2, hEll: (minH + maxH) / 2 };
  const o = geodeticToEcef(origin.lat, origin.lng, origin.hEll);
  const { east, north, up } = enuBasis(origin.lat, origin.lng);
  const local = new Map<number, Vec3>();
  const localOf = (i: number): Vec3 | null => {
    const hit = local.get(i);
    if (hit) return hit;
    const g = geodeticOf(i);
    if (!g) return null;
    const d = sub(geodeticToEcef(g.lat, g.lng, g.hEll), o);
    const p: Vec3 = [dot(d, east), dot(d, up), -dot(d, north)];
    local.set(i, p);
    return p;
  };

  const parts: MeshPart[] = [];
  const footprints: Array<Array<{ lat: number; lng: number }>> = [];
  for (const obj of objects) {
    const pos: number[] = [];
    const nrm: number[] = [];
    const used = new Set<number>();
    for (const surface of obj.surfaces) {
      const valid = (r: Ring): Ring => r.filter((i) => localOf(i) !== null);
      const outer = valid(surface[0] ?? []);
      if (outer.length < 3) continue;
      const rings = [outer, ...surface.slice(1).map(valid).filter((r) => r.length >= 3)];
      const outerPts = outer.map((i) => localOf(i)!);
      const n = newell(outerPts);
      const ax = [Math.abs(n[0]), Math.abs(n[1]), Math.abs(n[2])];
      if (ax[0]! + ax[1]! + ax[2]! < 1e-12) continue;
      const drop = ax[0]! >= ax[1]! && ax[0]! >= ax[2]! ? 0 : ax[1]! >= ax[2]! ? 1 : 2;
      const [u, v] = drop === 0 ? [1, 2] : drop === 1 ? [2, 0] : [0, 1];
      const flat = rings.map((r) => r.map((i) => { const p = localOf(i)!; return new Vector2(p[u]!, p[v]!); }));
      const all = rings.flat();
      let tris: number[][];
      try {
        tris = ShapeUtils.triangulateShape(flat[0]!, flat.slice(1));
      } catch {
        continue;
      }
      for (const tri of tris) {
        let [a, b, c] = tri.map((k) => localOf(all[k]!)!) as [Vec3, Vec3, Vec3];
        let fn = cross(sub(b, a), sub(c, a));
        const len = Math.hypot(...fn);
        if (len < 1e-12) continue;
        if (dot(fn, n) < 0) { [b, c] = [c, b]; fn = [-fn[0], -fn[1], -fn[2]]; }
        for (const p of [a, b, c]) {
          pos.push(p[0], p[1], p[2]);
          nrm.push(fn[0] / len, fn[1] / len, fn[2] / len);
        }
      }
      for (const i of all) used.add(i);
    }
    if (pos.length === 0) continue;
    parts.push({ id: obj.id, type: obj.type, positions: new Float32Array(pos), normals: new Float32Array(nrm) });
    const hull = convexHull([...used].map((i) => { const g = geodeticOf(i)!; return [g.lng, g.lat] as [number, number]; }));
    if (hull.length >= 3) footprints.push(hull.map(([lng, lat]) => ({ lat, lng })));
  }
  if (parts.length === 0) throw new Error(t('shared:userModelParsers.noGeometry'));

  return { glb: writeGlb(parts), origin, ellipsoidal: isEllipsoidalEpsg(epsg), footprints, objectCount: parts.length };
}
