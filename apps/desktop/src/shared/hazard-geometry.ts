import type { LatLon, Hazard } from './hazard-types.js';

type P = [number, number];

const M_PER_DEG = 111_320;

function projector(origin: LatLon) {
  const k = Math.cos((origin.lat * Math.PI) / 180);
  return {
    to: (p: LatLon): P => [(p.lon - origin.lon) * k * M_PER_DEG, (p.lat - origin.lat) * M_PER_DEG],
    from: ([x, y]: P): LatLon => ({ lat: origin.lat + y / M_PER_DEG, lon: origin.lon + x / (k * M_PER_DEG) }),
  };
}

function zoneOrigin(zone: Hazard): LatLon {
  if (zone.shape.kind === 'circle') return zone.shape.center;
  const pts = zone.shape.points;
  return { lat: pts.reduce((s, p) => s + p.lat, 0) / pts.length, lon: pts.reduce((s, p) => s + p.lon, 0) / pts.length };
}

const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
const cross = (a: P, b: P) => a[0] * b[1] - a[1] * b[0];
const dist = (a: P, b: P) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function pointSegDist(p: P, a: P, b: P): number {
  const ab = sub(b, a);
  const len2 = ab[0] * ab[0] + ab[1] * ab[1];
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * ab[0] + (p[1] - a[1]) * ab[1]) / len2));
  return dist(p, [a[0] + t * ab[0], a[1] + t * ab[1]]);
}

function segmentsCross(a: P, b: P, c: P, d: P): boolean {
  const d1 = cross(sub(b, a), sub(c, a));
  const d2 = cross(sub(b, a), sub(d, a));
  const d3 = cross(sub(d, c), sub(a, c));
  const d4 = cross(sub(d, c), sub(b, c));
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segSegDist(a: P, b: P, c: P, d: P): number {
  if (segmentsCross(a, b, c, d)) return 0;
  return Math.min(pointSegDist(a, c, d), pointSegDist(b, c, d), pointSegDist(c, a, b), pointSegDist(d, a, b));
}

function inside(p: P, ring: P[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!;
    const [xj, yj] = ring[j]!;
    if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** True when the straight leg from a to b passes through the zone or within its buffer. */
export function legCrossesZone(a: LatLon, b: LatLon, zone: Hazard): boolean {
  const pr = projector(zoneOrigin(zone));
  const A = pr.to(a);
  const B = pr.to(b);
  if (zone.shape.kind === 'circle') return pointSegDist([0, 0], A, B) < zone.shape.radiusM + zone.bufferM;
  const ring = zone.shape.points.map(pr.to);
  if (inside(A, ring) || inside(B, ring)) return true;
  for (let i = 0; i < ring.length; i++) {
    if (segSegDist(A, B, ring[i]!, ring[(i + 1) % ring.length]!) < zone.bufferM) return true;
  }
  return false;
}

/** Legs of a route (consecutive points) that cross a zone, by the index of the leg's first point. */
export function crossingLegs(route: readonly LatLon[], zones: readonly Hazard[]): Array<{ leg: number; zone: Hazard }> {
  const out: Array<{ leg: number; zone: Hazard }> = [];
  for (let i = 0; i + 1 < route.length; i++) {
    for (const zone of zones) if (legCrossesZone(route[i]!, route[i + 1]!, zone)) out.push({ leg: i, zone });
  }
  return out;
}

function convexHull(points: P[]): P[] {
  const pts = [...points].sort((p, q) => p[0] - q[0] || p[1] - q[1]);
  if (pts.length < 3) return pts;
  const half = (list: P[]) => {
    const h: P[] = [];
    for (const p of list) {
      while (h.length >= 2 && cross(sub(h[h.length - 1]!, h[h.length - 2]!), sub(p, h[h.length - 2]!)) <= 0) h.pop();
      h.push(p);
    }
    h.pop();
    return h;
  };
  return [...half(pts), ...half([...pts].reverse())];
}

/** The zone grown by `clearM` all round, as a convex ring (the Minkowski sum of its hull and a disk). */
function grownHull(zone: Hazard, clearM: number, pr: ReturnType<typeof projector>): P[] {
  const base: P[] = zone.shape.kind === 'circle'
    ? Array.from({ length: 24 }, (_, i): P => {
        const a = (i / 24) * 2 * Math.PI;
        return [Math.cos(a) * (zone.shape as { radiusM: number }).radiusM, Math.sin(a) * (zone.shape as { radiusM: number }).radiusM];
      })
    : zone.shape.points.map(pr.to);
  const grown: P[] = [];
  for (const [x, y] of convexHull(base)) {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 2 * Math.PI;
      grown.push([x + Math.cos(a) * clearM, y + Math.sin(a) * clearM]);
    }
  }
  return convexHull(grown);
}

function visible(from: P, to: P, hull: P[]): boolean {
  for (let i = 0; i < hull.length; i++) {
    if (segmentsCross(from, to, hull[i]!, hull[(i + 1) % hull.length]!)) return false;
  }
  const mid: P = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  return !inside(mid, hull);
}

/** Detour points between a and b around the shorter side of the buffered zone; null when a or b is inside it. */
export function routeAround(a: LatLon, b: LatLon, zone: Hazard, marginM = 10): LatLon[] | null {
  const pr = projector(zoneOrigin(zone));
  const hull = grownHull(zone, zone.bufferM + marginM, pr);
  const A = pr.to(a);
  const B = pr.to(b);
  if (inside(A, hull) || inside(B, hull)) return null;
  if (visible(A, B, hull)) return [];
  const n = hull.length;
  let best: { cost: number; path: P[] } | null = null;
  for (const step of [1, -1]) {
    for (let i = 0; i < n; i++) {
      if (!visible(A, hull[i]!, hull)) continue;
      let cost = dist(A, hull[i]!);
      const path: P[] = [hull[i]!];
      for (let k = 0, j = i; k < n; k++) {
        if (visible(hull[j]!, B, hull)) {
          const total = cost + dist(hull[j]!, B);
          if (!best || total < best.cost) best = { cost: total, path: [...path] };
          break;
        }
        const next = (j + step + n) % n;
        cost += dist(hull[j]!, hull[next]!);
        path.push(hull[next]!);
        j = next;
      }
    }
  }
  return best ? simplify(best.path, 3).map(pr.from) : null;
}

/** Douglas-Peucker on an open polyline, keeping both ends. */
function simplify(points: P[], toleranceM: number): P[] {
  if (points.length <= 2) return points;
  const first = points[0]!;
  const last = points[points.length - 1]!;
  let worst = 0;
  let at = 0;
  for (let i = 1; i < points.length - 1; i++) {
    const d = pointSegDist(points[i]!, first, last);
    if (d > worst) { worst = d; at = i; }
  }
  if (worst <= toleranceM) return [first, last];
  return [...simplify(points.slice(0, at + 1), toleranceM).slice(0, -1), ...simplify(points.slice(at), toleranceM)];
}
