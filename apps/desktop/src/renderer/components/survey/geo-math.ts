/**
 * Geographic Math Utilities for Survey Planning
 * Equirectangular projection - accurate enough for survey-scale areas (< 5km)
 */
import type { LatLng } from './survey-types';

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;
const EARTH_RADIUS = 6371000; // meters

/**
 * Convert lat/lng to local XY meters relative to an origin point.
 * Uses equirectangular projection (sufficient for survey-scale distances).
 */
export function latLngToLocal(origin: LatLng, point: LatLng): { x: number; y: number } {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const x = (point.lng - origin.lng) * DEG_TO_RAD * EARTH_RADIUS * cosLat;
  const y = (point.lat - origin.lat) * DEG_TO_RAD * EARTH_RADIUS;
  return { x, y };
}

/**
 * Convert local XY meters back to lat/lng.
 */
export function localToLatLng(origin: LatLng, x: number, y: number): LatLng {
  const cosLat = Math.cos(origin.lat * DEG_TO_RAD);
  const lng = origin.lng + (x / (EARTH_RADIUS * cosLat)) * RAD_TO_DEG;
  const lat = origin.lat + (y / EARTH_RADIUS) * RAD_TO_DEG;
  return { lat, lng };
}

/**
 * Calculate polygon area using the Shoelace formula (in local meters).
 */
export function polygonArea(vertices: LatLng[]): number {
  if (vertices.length < 3) return 0;
  const origin = vertices[0]!;
  const local = vertices.map(v => latLngToLocal(origin, v));

  let area = 0;
  for (let i = 0; i < local.length; i++) {
    const j = (i + 1) % local.length;
    const a = local[i]!;
    const b = local[j]!;
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Calculate polygon centroid.
 */
export function polygonCentroid(vertices: LatLng[]): LatLng {
  let latSum = 0;
  let lngSum = 0;
  for (const v of vertices) {
    latSum += v.lat;
    lngSum += v.lng;
  }
  return { lat: latSum / vertices.length, lng: lngSum / vertices.length };
}

/**
 * Rotate a 2D point around an origin by angle (radians).
 */
export function rotatePoint(
  point: { x: number; y: number },
  angle: number,
  origin: { x: number; y: number } = { x: 0, y: 0 },
): { x: number; y: number } {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = point.x - origin.x;
  const dy = point.y - origin.y;
  return {
    x: origin.x + dx * cos - dy * sin,
    y: origin.y + dx * sin + dy * cos,
  };
}

/**
 * Distance between two lat/lng points (Haversine).
 */
export function distanceLatLng(a: LatLng, b: LatLng): number {
  const dLat = (b.lat - a.lat) * DEG_TO_RAD;
  const dLng = (b.lng - a.lng) * DEG_TO_RAD;
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h = sinLat * sinLat + Math.cos(a.lat * DEG_TO_RAD) * Math.cos(b.lat * DEG_TO_RAD) * sinLng * sinLng;
  return 2 * EARTH_RADIUS * Math.asin(Math.sqrt(h));
}

/**
 * Distance between two 2D points.
 */
export function distance2D(a: { x: number; y: number }, b: { x: number; y: number }): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Compute the bounding box of a set of 2D points.
 */
export function boundingBox(points: { x: number; y: number }[]): {
  minX: number; maxX: number; minY: number; maxY: number;
} {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/**
 * Signed polygon area using the Shoelace formula on local XY points.
 * Positive for counter-clockwise winding, negative for clockwise. Useful for
 * detecting orientation flips after polygon offset operations (a flip indicates
 * the polygon has collapsed inward past itself).
 */
export function polygonSignedArea2D(points: { x: number; y: number }[]): number {
  if (points.length < 3) return 0;
  let area = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    const a = points[i]!;
    const b = points[j]!;
    area += a.x * b.y - b.x * a.y;
  }
  return area / 2;
}

/** True when the polygon is wound counter-clockwise (signed area > 0). */
export function isPolygonCCW(points: { x: number; y: number }[]): boolean {
  return polygonSignedArea2D(points) > 0;
}

/**
 * Offset a 2D polygon inward (positive distance) or outward (negative) by
 * `distance` meters using a miter join at each vertex.
 *
 * Algorithm: for each vertex, walk along the angle bisector of its two adjacent
 * edge-normals. The bisector points into the polygon for a CCW winding; we
 * flip the sign for CW polygons so the caller can pass a positive distance
 * regardless of winding direction.
 *
 * Caveats:
 *  - Sharp reflex angles produce long miter spikes; we cap the bisector
 *    distance at 10× the offset to prevent overshoots that would balloon the
 *    polygon and trigger NaN downstream.
 *  - Self-intersecting offsets (when the offset exceeds the polygon's
 *    inscribed radius) aren't detected here — callers should check whether
 *    the result is still a valid simple polygon (e.g. via signed-area sign
 *    matching the input) and stop iterating if it isn't.
 *  - Concave polygons may produce inverted segments if `distance` is large.
 *    For the spiral / perimeter use case we offset by small steps
 *    (lineSpacing, typically 1-5 m), so this rarely bites in practice.
 */
export function offsetPolygon(
  points: { x: number; y: number }[],
  distance: number,
): { x: number; y: number }[] {
  const n = points.length;
  if (n < 3) return [];

  const ccw = isPolygonCCW(points);
  // For a CW polygon we just flip the sign so the caller's positive distance
  // always means "shrink the polygon".
  const signedDist = ccw ? distance : -distance;

  const result: { x: number; y: number }[] = [];
  for (let i = 0; i < n; i++) {
    const prev = points[(i - 1 + n) % n]!;
    const curr = points[i]!;
    const next = points[(i + 1) % n]!;

    // Edge directions (unit vectors).
    const d1x = curr.x - prev.x;
    const d1y = curr.y - prev.y;
    const d1len = Math.hypot(d1x, d1y) || 1;
    const u1x = d1x / d1len;
    const u1y = d1y / d1len;

    const d2x = next.x - curr.x;
    const d2y = next.y - curr.y;
    const d2len = Math.hypot(d2x, d2y) || 1;
    const u2x = d2x / d2len;
    const u2y = d2y / d2len;

    // Inward normals (90° CCW rotation of the edge direction for CCW polygon).
    const n1x = -u1y;
    const n1y = u1x;
    const n2x = -u2y;
    const n2y = u2x;

    // Bisector = normalized sum of the two normals.
    const bx = n1x + n2x;
    const by = n1y + n2y;
    const blen = Math.hypot(bx, by);

    let stepX: number;
    let stepY: number;
    if (blen < 1e-6) {
      // Edges anti-parallel (180° corner) — use the perpendicular of either edge.
      stepX = n1x * signedDist;
      stepY = n1y * signedDist;
    } else {
      const ubx = bx / blen;
      const uby = by / blen;
      // The miter length = offset / cos(half-angle); cos(half-angle) = n1·bisector.
      const cosHalf = n1x * ubx + n1y * uby;
      // Clamp the miter ratio so a near-spike (very sharp corner) doesn't
      // explode into a huge spike that wraps around past adjacent vertices.
      const miterRatio = Math.max(Math.abs(cosHalf), 0.1);
      const miter = signedDist / miterRatio * (cosHalf >= 0 ? 1 : -1);
      stepX = ubx * miter;
      stepY = uby * miter;
    }

    result.push({ x: curr.x + stepX, y: curr.y + stepY });
  }
  return result;
}

/**
 * Iteratively offset a polygon inward, producing a sequence of nested rings.
 * Stops when the polygon collapses (orientation flips, area shrinks below
 * `minArea`, or the requested ring count is reached). Useful for spiral and
 * perimeter-fill mower patterns where each ring is one mowing pass at
 * `lineSpacing` distance inside the previous ring.
 */
export function offsetPolygonRings(
  points: { x: number; y: number }[],
  step: number,
  maxRings: number,
  minArea = 0.5,
): { x: number; y: number }[][] {
  if (points.length < 3 || step <= 0 || maxRings <= 0) return [];

  const rings: { x: number; y: number }[][] = [];
  const initialSign = Math.sign(polygonSignedArea2D(points));
  if (initialSign === 0) return [];

  let current = points;
  for (let i = 0; i < maxRings; i++) {
    const offset = offsetPolygon(current, step);
    if (offset.length < 3) break;
    const area = polygonSignedArea2D(offset);
    // Stop on collapse: orientation flipped (offset went past the center) or
    // the polygon became effectively a point.
    if (Math.sign(area) !== initialSign || Math.abs(area) < minArea) break;
    rings.push(offset);
    current = offset;
  }
  return rings;
}

/**
 * Calculate camera ground footprint dimensions at a given altitude.
 */
export function cameraFootprint(
  sensorWidth: number,  // mm
  sensorHeight: number, // mm
  focalLength: number,  // mm
  altitude: number,     // meters
): { width: number; height: number; gsd: number } {
  const width = (sensorWidth * altitude) / focalLength;
  const height = (sensorHeight * altitude) / focalLength;
  // GSD = (sensorWidth * altitude) / (focalLength * imageWidth) * 100 cm/px
  // But we return it per-pixel here, caller needs imageWidth
  const gsd = (sensorWidth * altitude) / focalLength; // meters per sensor width, need to divide by imageWidth
  return { width, height, gsd };
}
