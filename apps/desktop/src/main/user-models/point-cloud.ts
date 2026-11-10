import proj4 from 'proj4';
import { builtinProj4, horizontalEpsgFor } from '../../shared/scene-models/parsers/index.js';
import { convexHull } from '../../shared/scene-models/parsers/cityjson.js';
import { enuBasis, geodeticToEcef, type Geodetic } from '../../shared/scene-models/geodesy.js';
import { t } from '../../shared/i18n/index.js';
import { LasFormatError, rgbOffset, type LasCrs } from './las.js';
import { openLasSource } from './las-source.js';
import type { CrsResolver } from './crs.js';

/** Most points a cloud keeps; larger files are thinned with a fixed stride. */
export const POINT_BUDGET = 3_000_000;

export class PointCloudError extends Error {}

export interface PointCloud {
  /** glTF axes about `origin`: x east, y up, z south, metres. */
  positions: Float32Array;
  colors: Uint8Array | null;
  count: number;
  sourceCount: number;
  /** Centre of the geodetic bounding box; hEll is the file's own height (MSL unless `ellipsoidal`). */
  origin: Geodetic;
  ellipsoidal: boolean;
  footprint: Array<{ lat: number; lng: number }>;
}

export function decimationStride(total: number, budget = POINT_BUDGET): number {
  return Math.max(1, Math.ceil(total / Math.max(1, budget)));
}

type Forward = (x: number, y: number) => [number, number];

function converter(def: string): Forward | null {
  try {
    const conv = proj4(def, 'WGS84');
    return (x, y) => conv.forward([x, y]) as [number, number];
  } catch {
    return null;
  }
}

export async function forwardForCrs(crs: LasCrs, resolveCrs: CrsResolver): Promise<Forward> {
  const fromEpsg = async (code: number): Promise<Forward> => {
    const h = horizontalEpsgFor(code);
    const def = builtinProj4(h) ?? (await resolveCrs(h));
    const f = def ? converter(def) : null;
    if (!f) throw new PointCloudError(t('main:userModels.pointCloudUnknownCrs', { crs: `EPSG:${code}` }));
    return f;
  };
  if (crs.epsg != null) return fromEpsg(crs.epsg);
  if (crs.wkt) {
    const f = converter(crs.wkt);
    if (f) return f;
    if (crs.wktEpsg != null) return fromEpsg(crs.wktEpsg);
    throw new PointCloudError(t('main:userModels.pointCloudUnknownCrs', { crs: 'WKT' }));
  }
  throw new PointCloudError(t('main:userModels.pointCloudNoCrs'));
}

function formatMessage(err: LasFormatError): string {
  if (err.code === 'notLas') return t('main:userModels.pointCloudNotLas');
  if (err.code === 'unsupportedVersion') return t('main:userModels.pointCloudVersion');
  if (err.code === 'truncated') return t('main:userModels.pointCloudTruncated');
  return t('main:userModels.pointCloudFormat');
}

/** Lon/lat hull of the points, from the lowest and highest latitude in each of `buckets` longitude bands. */
export function pointsFootprint(lng: Float64Array, lat: Float64Array, count: number, buckets = 256): Array<{ lat: number; lng: number }> {
  let minLng = Infinity;
  let maxLng = -Infinity;
  for (let i = 0; i < count; i++) {
    if (lng[i]! < minLng) minLng = lng[i]!;
    if (lng[i]! > maxLng) maxLng = lng[i]!;
  }
  if (!(maxLng >= minLng)) return [];
  const span = maxLng - minLng || 1;
  const lo = new Int32Array(buckets).fill(-1);
  const hi = new Int32Array(buckets).fill(-1);
  for (let i = 0; i < count; i++) {
    const b = Math.min(buckets - 1, Math.floor(((lng[i]! - minLng) / span) * buckets));
    if (lo[b]! < 0 || lat[i]! < lat[lo[b]!]!) lo[b] = i;
    if (hi[b]! < 0 || lat[i]! > lat[hi[b]!]!) hi[b] = i;
  }
  const pts: Array<[number, number]> = [];
  for (let b = 0; b < buckets; b++) {
    if (lo[b]! >= 0) pts.push([lng[lo[b]!]!, lat[lo[b]!]!]);
    if (hi[b]! >= 0 && hi[b] !== lo[b]) pts.push([lng[hi[b]!]!, lat[hi[b]!]!]);
  }
  return convexHull(pts).map(([x, y]) => ({ lat: y, lng: x }));
}

/** 16-bit LAS colours to 8 bits; files that store 0..255 in the 16-bit fields pass through. */
export function colorsTo8Bit(raw: Uint16Array, count: number): Uint8Array {
  let max = 0;
  for (let i = 0; i < count * 3; i++) if (raw[i]! > max) max = raw[i]!;
  const shift = max > 255 ? 8 : 0;
  const out = new Uint8Array(count * 3);
  for (let i = 0; i < count * 3; i++) out[i] = raw[i]! >> shift;
  return out;
}

/** Reads a LAS or LAZ file, thinned to `budget` points, into local metres about its centre. */
export async function readLasPointCloud(path: string, resolveCrs: CrsResolver, budget = POINT_BUDGET): Promise<PointCloud> {
  let src: Awaited<ReturnType<typeof openLasSource>>;
  try {
    src = await openLasSource(path);
  } catch (err) {
    if (err instanceof LasFormatError) throw new PointCloudError(formatMessage(err));
    throw err;
  }
  try {
    const h = src.header;
    if (h.pointCount <= 0) throw new PointCloudError(t('main:userModels.pointCloudEmpty'));
    const forward = await forwardForCrs(src.crs, resolveCrs);
    const stride = decimationStride(h.pointCount, budget);
    const cap = Math.ceil(h.pointCount / stride);
    const lng = new Float64Array(cap);
    const lat = new Float64Array(cap);
    const hgt = new Float64Array(cap);
    const rgbAt = rgbOffset(h.pointFormat);
    const raw = rgbAt != null ? new Uint16Array(cap * 3) : null;
    const [sx, sy, sz] = h.scale;
    const [ox, oy, oz] = h.offset;
    const zf = src.crs.zToMetres;
    const len = h.pointLength;
    let n = 0;
    try {
      for await (const batch of src.batches(stride)) {
        const dv = new DataView(batch.records.buffer, batch.records.byteOffset, batch.records.byteLength);
        for (let i = 0; i < batch.count && n < cap; i++) {
          const at = i * len;
          const [x, y] = forward(dv.getInt32(at, true) * sx + ox, dv.getInt32(at + 4, true) * sy + oy);
          if (!Number.isFinite(x) || !Number.isFinite(y) || Math.abs(y) > 90) continue;
          lng[n] = x;
          lat[n] = y;
          hgt[n] = (dv.getInt32(at + 8, true) * sz + oz) * zf;
          if (raw && rgbAt != null) {
            raw[n * 3] = dv.getUint16(at + rgbAt, true);
            raw[n * 3 + 1] = dv.getUint16(at + rgbAt + 2, true);
            raw[n * 3 + 2] = dv.getUint16(at + rgbAt + 4, true);
          }
          n++;
        }
      }
    } catch (err) {
      if (err instanceof LasFormatError) throw new PointCloudError(formatMessage(err));
      throw err;
    }
    if (n === 0) throw new PointCloudError(t('main:userModels.pointCloudEmpty'));

    let minLat = Infinity, maxLat = -Infinity, minLng = Infinity, maxLng = -Infinity, minH = Infinity, maxH = -Infinity;
    for (let i = 0; i < n; i++) {
      if (lat[i]! < minLat) minLat = lat[i]!;
      if (lat[i]! > maxLat) maxLat = lat[i]!;
      if (lng[i]! < minLng) minLng = lng[i]!;
      if (lng[i]! > maxLng) maxLng = lng[i]!;
      if (hgt[i]! < minH) minH = hgt[i]!;
      if (hgt[i]! > maxH) maxH = hgt[i]!;
    }
    const origin: Geodetic = { lat: (minLat + maxLat) / 2, lng: (minLng + maxLng) / 2, hEll: (minH + maxH) / 2 };
    const o = geodeticToEcef(origin.lat, origin.lng, origin.hEll);
    const { east, north, up } = enuBasis(origin.lat, origin.lng);
    const positions = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const p = geodeticToEcef(lat[i]!, lng[i]!, hgt[i]!);
      const dx = p[0] - o[0], dy = p[1] - o[1], dz = p[2] - o[2];
      positions[i * 3] = dx * east[0] + dy * east[1] + dz * east[2];
      positions[i * 3 + 1] = dx * up[0] + dy * up[1] + dz * up[2];
      positions[i * 3 + 2] = -(dx * north[0] + dy * north[1] + dz * north[2]);
    }
    return {
      positions,
      colors: raw ? colorsTo8Bit(raw, n) : null,
      count: n,
      sourceCount: h.pointCount,
      origin,
      ellipsoidal: src.crs.ellipsoidal,
      footprint: pointsFootprint(lng, lat, n),
    };
  } finally {
    await src.close();
  }
}
