const A = 6378137;
const F = 1 / 298.257223563;
const E2 = F * (2 - F);
const B = A * (1 - F);
const EP2 = (A * A - B * B) / (B * B);
const RAD = Math.PI / 180;

export type Vec3 = [number, number, number];

export interface Geodetic {
  lat: number;
  lng: number;
  /** Height above the WGS84 ellipsoid, metres. */
  hEll: number;
}

export function geodeticToEcef(lat: number, lng: number, hEll: number): Vec3 {
  const sl = Math.sin(lat * RAD), cl = Math.cos(lat * RAD);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  return [(n + hEll) * cl * Math.cos(lng * RAD), (n + hEll) * cl * Math.sin(lng * RAD), (n * (1 - E2) + hEll) * sl];
}

/** Bowring's closed form: sub-millimetre for any point near the Earth's surface. */
export function ecefToGeodetic([x, y, z]: Vec3): Geodetic {
  const p = Math.hypot(x, y);
  const th = Math.atan2(z * A, p * B);
  const lat = Math.atan2(z + EP2 * B * Math.sin(th) ** 3, p - E2 * A * Math.cos(th) ** 3);
  const sl = Math.sin(lat);
  const n = A / Math.sqrt(1 - E2 * sl * sl);
  const hEll = Math.abs(Math.cos(lat)) > 1e-10 ? p / Math.cos(lat) - n : Math.abs(z) - B;
  return { lat: lat / RAD, lng: Math.atan2(y, x) / RAD, hEll };
}

/** East, north and up unit vectors of the local tangent plane, in ECEF. */
export function enuBasis(lat: number, lng: number): { east: Vec3; north: Vec3; up: Vec3 } {
  const sl = Math.sin(lat * RAD), cl = Math.cos(lat * RAD), so = Math.sin(lng * RAD), co = Math.cos(lng * RAD);
  return { east: [-so, co, 0], north: [-sl * co, -sl * so, cl], up: [cl * co, cl * so, sl] };
}

/** A 3D Tiles transform (column-major 4x4) applied to a point. */
export function applyTransform(m: readonly number[], [x, y, z]: Vec3): Vec3 {
  return [m[0]! * x + m[4]! * y + m[8]! * z + m[12]!, m[1]! * x + m[5]! * y + m[9]! * z + m[13]!, m[2]! * x + m[6]! * y + m[10]! * z + m[14]!];
}

interface TilesetJson {
  root?: {
    transform?: number[];
    boundingVolume?: { box?: number[]; region?: number[]; sphere?: number[] };
  };
}

/** A tileset's centre: root bounding volume (region is radians + ellipsoid m; box/sphere go through the root transform). */
export function tilesetCentre(tileset: TilesetJson): Geodetic {
  const root = tileset.root;
  if (!root) throw new Error('tileset has no root'); // i18n-exempt
  const m = root.transform && root.transform.length === 16 ? root.transform : null;
  const bv = root.boundingVolume ?? {};
  if (bv.region && bv.region.length === 6) {
    const [w, s, e, n, minH, maxH] = bv.region as [number, number, number, number, number, number];
    return { lat: ((s + n) / 2) / RAD, lng: ((w + e) / 2) / RAD, hEll: (minH + maxH) / 2 };
  }
  const local: Vec3 | null = bv.box && bv.box.length === 12
    ? [bv.box[0]!, bv.box[1]!, bv.box[2]!]
    : bv.sphere && bv.sphere.length === 4 ? [bv.sphere[0]!, bv.sphere[1]!, bv.sphere[2]!] : null;
  if (m) return ecefToGeodetic(applyTransform(m, local ?? [0, 0, 0]));
  if (local) return ecefToGeodetic(local);
  throw new Error('tileset has neither a root transform nor a usable bounding volume'); // i18n-exempt
}
