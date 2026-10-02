import { t } from '../../shared/i18n/index.js';
/**
 * Minimal, dependency-free ESRI Shapefile (.shp) -> GeoJSON converter.
 *
 * Surveyors and GIS teams hand off boundaries as Shapefiles far more often than
 * KML, but pulling in a shapefile npm package (and a projection library) drags a
 * large dependency tree into a security-sensitive desktop app. The .shp binary
 * format and the handful of projections drone boundaries actually ship in are
 * well-specified, so we parse them directly.
 *
 * Scope: Polygon and PolyLine geometry (incl. their Z/M variants), which is what
 * a survey boundary or corridor is. Points/MultiPoints are ignored. Coordinates
 * are reprojected to WGS84 lon/lat using the sibling .prj when it names a
 * geographic CRS, Web Mercator, or a Transverse Mercator / UTM grid; other
 * projected CRSs are passed through and will be rejected downstream if they fall
 * outside lat/lon range (callers surface a friendly "no boundary found").
 *
 * Output is a GeoJSON FeatureCollection string, so it flows through the existing
 * GeoJSON import path (parseGisArea) with zero downstream changes.
 */

// ESRI shape type codes we care about (XY, plus Z and M variants share layout
// for the leading XY block, which is all we read).
const SHP_POLYLINE = 3;
const SHP_POLYGON = 5;
const SHP_POLYLINE_Z = 13;
const SHP_POLYGON_Z = 15;
const SHP_POLYLINE_M = 23;
const SHP_POLYGON_M = 25;

type Ring = Array<[number, number]>; // [x, y] in source CRS

interface GeoJsonGeometry {
  type: 'Polygon' | 'MultiPolygon' | 'LineString' | 'MultiLineString';
  coordinates: unknown;
}

/** Reproject a source (x, y) into WGS84 [lon, lat] degrees. */
type Reproject = (x: number, y: number) => [number, number];

// ── Projection inverses (source easting/northing -> lon/lat) ──────────────────

const WEB_MERCATOR_R = 6378137;

function webMercatorInverse(x: number, y: number): [number, number] {
  const lon = (x / WEB_MERCATOR_R) * (180 / Math.PI);
  const lat = (2 * Math.atan(Math.exp(y / WEB_MERCATOR_R)) - Math.PI / 2) * (180 / Math.PI);
  return [lon, lat];
}

interface TmParams {
  a: number;       // semi-major axis
  e2: number;      // eccentricity squared
  lat0: number;    // latitude of origin (rad)
  lon0: number;    // central meridian (rad)
  k0: number;      // scale factor
  fe: number;      // false easting
  fn: number;      // false northing
}

/** Ellipsoidal Transverse Mercator inverse (Snyder), covers UTM and TM grids. */
function makeTransverseMercatorInverse(p: TmParams): Reproject {
  const { a, e2, lat0, lon0, k0, fe, fn } = p;
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));
  const ep2 = e2 / (1 - e2);
  const m0 =
    a *
    ((1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256) * lat0 -
      ((3 * e2) / 8 + (3 * e2 * e2) / 32 + (45 * e2 * e2 * e2) / 1024) * Math.sin(2 * lat0) +
      ((15 * e2 * e2) / 256 + (45 * e2 * e2 * e2) / 1024) * Math.sin(4 * lat0) -
      ((35 * e2 * e2 * e2) / 3072) * Math.sin(6 * lat0));

  return (easting: number, northing: number): [number, number] => {
    const x = easting - fe;
    const y = northing - fn;
    const m = m0 + y / k0;
    const mu = m / (a * (1 - e2 / 4 - (3 * e2 * e2) / 64 - (5 * e2 * e2 * e2) / 256));
    const phi1 =
      mu +
      ((3 * e1) / 2 - (27 * e1 * e1 * e1) / 32) * Math.sin(2 * mu) +
      ((21 * e1 * e1) / 16 - (55 * e1 * e1 * e1 * e1) / 32) * Math.sin(4 * mu) +
      ((151 * e1 * e1 * e1) / 96) * Math.sin(6 * mu) +
      ((1097 * e1 * e1 * e1 * e1) / 512) * Math.sin(8 * mu);

    const sinPhi1 = Math.sin(phi1);
    const cosPhi1 = Math.cos(phi1);
    const tanPhi1 = Math.tan(phi1);
    const c1 = ep2 * cosPhi1 * cosPhi1;
    const t1 = tanPhi1 * tanPhi1;
    const n1 = a / Math.sqrt(1 - e2 * sinPhi1 * sinPhi1);
    const r1 = (a * (1 - e2)) / Math.pow(1 - e2 * sinPhi1 * sinPhi1, 1.5);
    const d = x / (n1 * k0);

    const lat =
      phi1 -
      ((n1 * tanPhi1) / r1) *
        ((d * d) / 2 -
          ((5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * Math.pow(d, 4)) / 24 +
          ((61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * Math.pow(d, 6)) / 720);
    const lon =
      lon0 +
      (d -
        ((1 + 2 * t1 + c1) * Math.pow(d, 3)) / 6 +
        ((5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * Math.pow(d, 5)) / 120) /
        cosPhi1;

    return [(lon * 180) / Math.PI, (lat * 180) / Math.PI];
  };
}

function wktNumber(wkt: string, paramName: string): number | null {
  // PARAMETER["central_meridian",-123] (case-insensitive on the name)
  const re = new RegExp(`PARAMETER\\s*\\[\\s*"${paramName}"\\s*,\\s*(-?[0-9.]+)`, 'i');
  const m = re.exec(wkt);
  return m && m[1] !== undefined ? Number(m[1]) : null;
}

/** Build a reprojection from a .prj WKT string. Defaults to lon/lat passthrough. */
export function reprojectionFromPrj(prj: string | undefined): Reproject {
  const passthrough: Reproject = (x, y) => [x, y];
  if (!prj) return passthrough;
  const wkt = prj.trim();

  // Geographic CRS already in degrees: X is lon, Y is lat.
  if (/^GEOGCS/i.test(wkt) || !/PROJCS/i.test(wkt)) return passthrough;

  // Web Mercator (EPSG:3857 / "Auxiliary_Sphere" / Pseudo-Mercator).
  if (/Mercator_Auxiliary_Sphere/i.test(wkt) || /Popular_Visualisation_Pseudo_Mercator/i.test(wkt) || /"WGS_1984_Web_Mercator/i.test(wkt)) {
    return webMercatorInverse;
  }

  // Transverse Mercator (covers UTM zones and national TM grids).
  if (/Transverse_Mercator/i.test(wkt)) {
    // Spheroid a + inverse flattening: SPHEROID["WGS_1984",6378137,298.257223563]
    const sph = /SPHEROID\s*\[\s*"[^"]*"\s*,\s*([0-9.]+)\s*,\s*([0-9.]+)/i.exec(wkt);
    const a = sph && sph[1] ? Number(sph[1]) : 6378137;
    const invF = sph && sph[2] ? Number(sph[2]) : 298.257223563;
    const f = invF !== 0 ? 1 / invF : 0;
    const e2 = 2 * f - f * f;
    const d2r = Math.PI / 180;
    return makeTransverseMercatorInverse({
      a,
      e2,
      lat0: (wktNumber(wkt, 'latitude_of_origin') ?? 0) * d2r,
      lon0: (wktNumber(wkt, 'central_meridian') ?? 0) * d2r,
      k0: wktNumber(wkt, 'scale_factor') ?? 0.9996,
      fe: wktNumber(wkt, 'false_easting') ?? 0,
      fn: wktNumber(wkt, 'false_northing') ?? 0,
    });
  }

  // Unknown projected CRS: pass through. If it isn't already lon/lat, the
  // coordinates fall outside valid range and are dropped downstream.
  return passthrough;
}

// ── Binary .shp reader ────────────────────────────────────────────────────────

/** Signed area (shoelace) of a ring; > 0 = CCW (hole), < 0 = CW (outer) per ESRI. */
function ringSignedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]!;
    const b = ring[(i + 1) % ring.length]!;
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

interface ShpRecordParts {
  parts: Ring[];
  isPolygon: boolean;
}

/**
 * Parse one Polygon/PolyLine record body (a sequence of parts/rings) starting at
 * `offset` in the DataView. Returns the rings in source CRS and the next offset.
 */
function readPartsRecord(
  view: DataView,
  offset: number,
  isPolygon: boolean,
): ShpRecordParts {
  // layout: box[4 doubles], numParts(int32 LE), numPoints(int32 LE),
  // parts[numParts int32 LE], points[numPoints * 2 doubles LE]
  let p = offset + 32; // skip bounding box
  const numParts = view.getInt32(p, true); p += 4;
  const numPoints = view.getInt32(p, true); p += 4;
  const partStarts: number[] = [];
  for (let i = 0; i < numParts; i++) { partStarts.push(view.getInt32(p, true)); p += 4; }
  const points: Array<[number, number]> = [];
  for (let i = 0; i < numPoints; i++) {
    const x = view.getFloat64(p, true); p += 8;
    const y = view.getFloat64(p, true); p += 8;
    points.push([x, y]);
  }
  const parts: Ring[] = [];
  for (let i = 0; i < numParts; i++) {
    const start = partStarts[i]!;
    const end = i + 1 < numParts ? partStarts[i + 1]! : numPoints;
    parts.push(points.slice(start, end));
  }
  return { parts, isPolygon };
}

/**
 * Group a polygon record's rings into GeoJSON polygons. ESRI orders an outer
 * ring (clockwise) followed by its holes (counter-clockwise); a new clockwise
 * ring starts a new polygon.
 */
function ringsToPolygons(parts: Ring[], reproject: Reproject): number[][][][] {
  const polygons: number[][][][] = [];
  for (const ring of parts) {
    const projected = ring.map(([x, y]) => {
      const [lon, lat] = reproject(x, y);
      return [lon, lat];
    });
    if (ringSignedArea(ring) < 0) {
      // Outer ring (CW) -> new polygon.
      polygons.push([projected]);
    } else if (polygons.length > 0) {
      // Hole (CCW) -> attach to current polygon.
      polygons[polygons.length - 1]!.push(projected);
    } else {
      // Hole with no preceding outer (degenerate) -> treat as its own outer.
      polygons.push([projected]);
    }
  }
  return polygons;
}

export interface ShapefileToGeoJsonResult {
  /** GeoJSON FeatureCollection (serializable). */
  geojson: { type: 'FeatureCollection'; features: Array<{ type: 'Feature'; properties: Record<string, never>; geometry: GeoJsonGeometry }> };
  /** Number of geometry records read. */
  featureCount: number;
}

/**
 * Convert a Shapefile .shp buffer (with optional .prj text) into GeoJSON.
 * Throws on a non-shapefile / corrupt header.
 */
export function shapefileToGeoJson(shp: Uint8Array, prj?: string): ShapefileToGeoJsonResult {
  const view = new DataView(shp.buffer, shp.byteOffset, shp.byteLength);
  if (view.byteLength < 100) throw new Error(t('main:shapefile.tooSmall'));
  const fileCode = view.getInt32(0, false); // big-endian
  if (fileCode !== 9994) throw new Error(t('main:shapefile.badFileCode'));

  const reproject = reprojectionFromPrj(prj);
  const features: ShapefileToGeoJsonResult['geojson']['features'] = [];

  // Records begin at byte 100. Each: recNumber(int32 BE), contentLen(int32 BE,
  // in 16-bit words), then content starting with shapeType(int32 LE).
  let offset = 100;
  while (offset + 8 <= view.byteLength) {
    // record header
    offset += 4; // record number (unused)
    const contentLenWords = view.getInt32(offset, false); offset += 4;
    const contentStart = offset;
    const contentBytes = contentLenWords * 2;
    if (contentBytes <= 0 || contentStart + contentBytes > view.byteLength) break;

    const shapeType = view.getInt32(contentStart, true);
    if (
      shapeType === SHP_POLYGON || shapeType === SHP_POLYGON_Z || shapeType === SHP_POLYGON_M ||
      shapeType === SHP_POLYLINE || shapeType === SHP_POLYLINE_Z || shapeType === SHP_POLYLINE_M
    ) {
      const isPolygon = shapeType === SHP_POLYGON || shapeType === SHP_POLYGON_Z || shapeType === SHP_POLYGON_M;
      const { parts } = readPartsRecord(view, contentStart + 4, isPolygon);
      if (parts.length > 0) {
        if (isPolygon) {
          const polys = ringsToPolygons(parts, reproject);
          if (polys.length === 1) {
            features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: polys[0]! } });
          } else if (polys.length > 1) {
            features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiPolygon', coordinates: polys } });
          }
        } else {
          const lines = parts.map((ring) => ring.map(([x, y]) => { const [lon, lat] = reproject(x, y); return [lon, lat]; }));
          if (lines.length === 1) {
            features.push({ type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: lines[0]! } });
          } else {
            features.push({ type: 'Feature', properties: {}, geometry: { type: 'MultiLineString', coordinates: lines } });
          }
        }
      }
    }
    // skip to next record
    offset = contentStart + contentBytes;
  }

  return { geojson: { type: 'FeatureCollection', features }, featureCount: features.length };
}
