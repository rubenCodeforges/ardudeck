import { DEFAULT_MODEL_RADIUS_M, offsetLatLng, type LatLng } from './scene-model-placement';

/** Where procedural buildings give way to a model: its footprint rings, or a circle about its origin. */
export interface ExclusionZone {
  rings: LatLng[][];
  center: LatLng;
  radiusM: number;
}

interface ZoneSource {
  key: string;
  origin: { lat: number; lng: number };
  footprints?: LatLng[][];
}

export function exclusionZonesFor(entries: ZoneSource[], radiusOf: (key: string) => number | undefined): ExclusionZone[] {
  return entries.map((e) => {
    const rings = (e.footprints ?? []).filter((r) => r.length >= 3);
    const r = radiusOf(e.key);
    return { rings, center: { lat: e.origin.lat, lng: e.origin.lng }, radiusM: r != null && r > 0 ? r : DEFAULT_MODEL_RADIUS_M };
  });
}

type Pt = { x: number; y: number };

function project(ref: LatLng, p: LatLng): Pt {
  return { x: (p.lng - ref.lng) * 111_320 * Math.cos((ref.lat * Math.PI) / 180), y: (p.lat - ref.lat) * 111_320 };
}

function pointInRing(p: Pt, ring: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!;
    const b = ring[j]!;
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function cross(o: Pt, a: Pt, b: Pt): number {
  return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
}

function segmentsIntersect(p1: Pt, p2: Pt, q1: Pt, q2: Pt): boolean {
  const d1 = cross(q1, q2, p1);
  const d2 = cross(q1, q2, p2);
  const d3 = cross(p1, p2, q1);
  const d4 = cross(p1, p2, q2);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

export function ringsOverlap(a: Pt[], b: Pt[]): boolean {
  if (a.length < 3 || b.length < 3) return false;
  for (let i = 0; i < a.length; i++) {
    const a1 = a[i]!;
    const a2 = a[(i + 1) % a.length]!;
    for (let j = 0; j < b.length; j++) if (segmentsIntersect(a1, a2, b[j]!, b[(j + 1) % b.length]!)) return true;
  }
  return pointInRing(a[0]!, b) || pointInRing(b[0]!, a);
}

/** True when a building's outer ring ([lon, lat] pairs) touches any zone: crosses or sits inside a footprint (or holds it), or comes within a radius zone. */
export function buildingExcluded(outer: Array<[number, number]>, zones: ExclusionZone[]): boolean {
  if (outer.length < 3 || zones.length === 0) return false;
  for (const z of zones) {
    const ring = outer.map(([lng, lat]) => project(z.center, { lat, lng }));
    if (z.rings.length > 0) {
      for (const fp of z.rings) if (ringsOverlap(ring, fp.map((p) => project(z.center, p)))) return true;
      continue;
    }
    const c = { x: 0, y: 0 };
    if (pointInRing(c, ring)) return true;
    for (let i = 0; i < ring.length; i++) if (segmentDistance(c, ring[i]!, ring[(i + 1) % ring.length]!) <= z.radiusM) return true;
  }
  return false;
}

/** The zones as one GeoJSON collection of polygons, radius zones as circles. */
export function exclusionGeoJson(zones: ExclusionZone[], segments = 32): GeoJSON.FeatureCollection<GeoJSON.Polygon> {
  const features: Array<GeoJSON.Feature<GeoJSON.Polygon>> = [];
  const close = (pts: number[][]) => (pts.length > 0 ? [...pts, pts[0]!] : pts);
  for (const z of zones) {
    const rings = z.rings.length > 0
      ? z.rings.map((r) => r.map((p) => [p.lng, p.lat]))
      : [Array.from({ length: segments }, (_, i) => {
          const a = (i / segments) * 2 * Math.PI;
          const p = offsetLatLng(z.center, Math.cos(a) * z.radiusM, Math.sin(a) * z.radiusM);
          return [p.lng, p.lat];
        })];
    for (const r of rings) features.push({ type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [close(r)] } });
  }
  return { type: 'FeatureCollection', features };
}
