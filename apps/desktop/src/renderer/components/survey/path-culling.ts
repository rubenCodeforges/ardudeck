/**
 * Zoom/viewport-aware culling for dense flight-path polylines.
 *
 * Survey results carry the full-fidelity plan - on large plans tens of
 * thousands of points - and nothing is ever removed from the data. What gets
 * DRAWN is decided here per view change: only the path runs intersecting the
 * padded viewport, each simplified to a tolerance worth about a pixel and a
 * half at the current zoom. Zoomed out, the whole path reads correctly at a
 * few hundred points; zoomed in, every corner in view is drawn exactly.
 */
import type { LatLng } from './survey-types';
import { latLngToLocal } from './geo-math';

export interface ViewBox {
  west: number;
  south: number;
  east: number;
  north: number;
}

/** Fraction of the viewport size kept around it so panning doesn't pop lines in. */
const PAD_FRACTION = 0.25;

/** Simplification tolerance in screen pixels - below this a vertex cannot be seen. */
const PIXEL_TOLERANCE = 1.5;

/** Web-mercator ground resolution at a given zoom and latitude. */
export function metersPerPixel(zoom: number, lat: number): number {
  return (156543.03392 * Math.cos((lat * Math.PI) / 180)) / 2 ** zoom;
}

function padBox(box: ViewBox): ViewBox {
  const padLng = (box.east - box.west) * PAD_FRACTION;
  const padLat = (box.north - box.south) * PAD_FRACTION;
  return {
    west: box.west - padLng,
    south: box.south - padLat,
    east: box.east + padLng,
    north: box.north + padLat,
  };
}

/**
 * Conservative visibility test: bounding-box overlap between the segment and
 * the padded view. May keep a diagonal segment whose line misses the box
 * corner - that only costs a few extra drawn points, never drops a visible one.
 */
function segmentTouches(box: ViewBox, a: LatLng, b: LatLng): boolean {
  return (
    Math.max(a.lng, b.lng) >= box.west &&
    Math.min(a.lng, b.lng) <= box.east &&
    Math.max(a.lat, b.lat) >= box.south &&
    Math.min(a.lat, b.lat) <= box.north
  );
}

/**
 * RDP for open paths. geo-math's simplifyPolygon is a ring simplifier - its
 * never-below-3-vertices fallback would return a straight 5,000-point run
 * unsimplified. A path legitimately collapses to its 2 endpoints.
 */
function simplifyRun(points: LatLng[], toleranceMeters: number): LatLng[] {
  if (points.length <= 2 || toleranceMeters <= 0) return points;
  const origin = points[0]!;
  const local = points.map((p) => latLngToLocal(origin, p));

  const keep = new Array<boolean>(local.length).fill(false);
  keep[0] = true;
  keep[local.length - 1] = true;
  const stack: Array<[number, number]> = [[0, local.length - 1]];
  while (stack.length > 0) {
    const [start, end] = stack.pop()!;
    const a = local[start]!;
    const b = local[end]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    let maxDist = 0;
    let idx = -1;
    for (let i = start + 1; i < end; i++) {
      const p = local[i]!;
      let d: number;
      if (lenSq === 0) {
        d = Math.hypot(p.x - a.x, p.y - a.y);
      } else {
        const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
        d = Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
      }
      if (d > maxDist) {
        maxDist = d;
        idx = i;
      }
    }
    if (maxDist > toleranceMeters && idx !== -1) {
      keep[idx] = true;
      stack.push([start, idx], [idx, end]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

/**
 * Cut a path down to what the current viewport needs: an array of visible
 * runs (the path may leave and re-enter the view), each simplified to the
 * zoom's pixel resolution. Boundary segments keep their off-screen endpoint
 * so lines draw through the view edge instead of stopping at it.
 */
export function cullPathForViewport(points: LatLng[], view: ViewBox, zoom: number): LatLng[][] {
  if (points.length < 2) return [];
  const box = padBox(view);
  const tolerance = metersPerPixel(zoom, (view.north + view.south) / 2) * PIXEL_TOLERANCE;

  const runs: LatLng[][] = [];
  let run: LatLng[] | null = null;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    if (segmentTouches(box, a, b)) {
      if (!run) run = [a];
      run.push(b);
    } else if (run) {
      runs.push(run);
      run = null;
    }
  }
  if (run) runs.push(run);

  return runs.map((r) => simplifyRun(r, tolerance));
}
