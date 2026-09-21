/**
 * Split a corridor survey into consecutive stretches along the centreline.
 *
 * `splitIntoSorties` walks the generated path and cuts it when the battery
 * budget runs out. On a corridor that path is line-major (fly the whole length,
 * turn, fly back), so every cut lands between lines and each flight gets a few
 * full-length passes covering the entire route. That is what you want with a
 * swarm, where several aircraft work the same stretch side by side.
 *
 * One aircraft wants the opposite: the first few kilometres completely, then
 * the next few. Same coverage, but each battery is one contiguous piece of
 * ground you can drive to, and the pilot moves along the route as they go.
 *
 * So cut on distance along the centreline instead of on elapsed path time,
 * slicing each pass where it crosses a section boundary. Pure and
 * dependency-free so it unit-tests in plain node.
 */

import type { LatLng } from './survey-types';

const EARTH_RADIUS_M = 6_371_000;

interface Metric {
  x: number;
  y: number;
}

/** Local flat projection in metres. Exact enough over a survey. */
function projector(origin: LatLng): (p: LatLng) => Metric {
  const latScale = (Math.PI / 180) * EARTH_RADIUS_M;
  const lngScale = latScale * Math.cos((origin.lat * Math.PI) / 180);
  return (p) => ({ x: (p.lng - origin.lng) * lngScale, y: (p.lat - origin.lat) * latScale });
}

function lerp(a: LatLng, b: LatLng, t: number): LatLng {
  return { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
}

/**
 * Distance along `centreline` of the point on it nearest to `p`, in metres.
 * Off-route points clamp to the nearest end, which is what a lead-in leg
 * should do.
 */
function alongTrack(centreline: Metric[], cumulative: number[], p: Metric): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centreline.length - 1; i++) {
    const a = centreline[i]!;
    const b = centreline[i + 1]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
    const px = a.x + dx * t;
    const py = a.y + dy * t;
    const d = (p.x - px) ** 2 + (p.y - py) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = cumulative[i]! + Math.sqrt(lenSq) * t;
    }
  }
  return best;
}

/** Total centreline length in metres. */
export function centrelineLengthM(centreline: LatLng[]): number {
  if (centreline.length < 2) return 0;
  const toMetric = projector(centreline[0]!);
  let total = 0;
  for (let i = 0; i < centreline.length - 1; i++) {
    const a = toMetric(centreline[i]!);
    const b = toMetric(centreline[i + 1]!);
    total += Math.hypot(b.x - a.x, b.y - a.y);
  }
  return total;
}

/**
 * Cut `waypoints` into `sectionCount` consecutive stretches of the corridor.
 * A pass that crosses a boundary is split there, so nothing is left uncovered
 * and no section starts mid-air at a point the previous one never reached.
 */
export function splitCorridorIntoSections(
  waypoints: LatLng[],
  centreline: LatLng[],
  sectionCount: number,
): LatLng[][] {
  const sections = Math.max(1, Math.floor(sectionCount));
  if (sections === 1 || waypoints.length < 2 || centreline.length < 2) {
    return waypoints.length > 0 ? [waypoints] : [];
  }

  const toMetric = projector(centreline[0]!);
  const line = centreline.map(toMetric);
  const cumulative: number[] = [0];
  for (let i = 0; i < line.length - 1; i++) {
    cumulative.push(cumulative[i]! + Math.hypot(line[i + 1]!.x - line[i]!.x, line[i + 1]!.y - line[i]!.y));
  }
  const total = cumulative[cumulative.length - 1]!;
  if (total <= 0) return [waypoints];

  const band = total / sections;
  const bandOf = (s: number) => Math.max(0, Math.min(sections - 1, Math.floor(s / band)));

  const out: LatLng[][] = Array.from({ length: sections }, () => []);
  const push = (i: number, p: LatLng) => {
    const list = out[i]!;
    const last = list[list.length - 1];
    // A boundary point is the end of one piece and the start of the next, so
    // the same coordinate arrives twice. Keep it once.
    if (last && last.lat === p.lat && last.lng === p.lng) return;
    list.push(p);
  };

  let prev = waypoints[0]!;
  let prevS = alongTrack(line, cumulative, toMetric(prev));
  let prevBand = bandOf(prevS);
  push(prevBand, prev);

  for (let i = 1; i < waypoints.length; i++) {
    const cur = waypoints[i]!;
    const curS = alongTrack(line, cumulative, toMetric(cur));
    let curBand = bandOf(curS);

    while (curBand !== prevBand) {
      const goingUp = curBand > prevBand;
      const boundary = (goingUp ? prevBand + 1 : prevBand) * band;
      const span = curS - prevS;
      const t = span === 0 ? 1 : Math.max(0, Math.min(1, (boundary - prevS) / span));
      const cut = lerp(prev, cur, t);
      push(prevBand, cut);
      prevBand = goingUp ? prevBand + 1 : prevBand - 1;
      push(prevBand, cut);
    }

    push(curBand, cur);
    prev = cur;
    prevS = curS;
    curBand = bandOf(curS);
    prevBand = curBand;
  }

  return out.filter((s) => s.length >= 2);
}

/**
 * How many sections a fixed stretch length gives. Rounds up, so the last
 * section is the short one rather than the route being cut off.
 */
export function sectionCountForLength(centreline: LatLng[], sectionLengthM: number): number {
  const total = centrelineLengthM(centreline);
  if (!(sectionLengthM > 0) || total <= 0) return 1;
  return Math.max(1, Math.ceil(total / sectionLengthM));
}

/**
 * How many sections this corridor needs so each fits one battery. Uses the
 * generated path's own length, so it already accounts for the turns.
 */
export function sectionCountForEndurance(
  waypoints: LatLng[],
  speedMps: number,
  enduranceMinutes: number,
): number {
  if (waypoints.length < 2) return 1;
  const speed = speedMps > 0 ? speedMps : 1;
  const toMetric = projector(waypoints[0]!);
  let metres = 0;
  for (let i = 0; i < waypoints.length - 1; i++) {
    const a = toMetric(waypoints[i]!);
    const b = toMetric(waypoints[i + 1]!);
    metres += Math.hypot(b.x - a.x, b.y - a.y);
  }
  const budget = Math.max(1, enduranceMinutes) * 60;
  return Math.max(1, Math.ceil(metres / speed / budget));
}
