/**
 * Spiral Pattern Generator — polygon-aware concentric offsets.
 *
 * Unlike the circular generator (which emits actual circles regardless of the
 * polygon shape), spiral generates successive *offsets* of the polygon itself.
 * Each ring is a one-line mowing pass that hugs the polygon's outline at a
 * constant distance from the previous ring. Result fits trapezoidal /
 * irregular yards much better than concentric circles.
 *
 * Two modes:
 *  - inward: start at the outermost ring (polygon boundary), spiral toward
 *    the center. Each ring is one line spacing inside the previous.
 *  - outward: emit rings inner-to-outer for surveys that want to start at the
 *    center and finish on the perimeter (rare in mowing but useful for
 *    inspection patterns).
 *
 * Rings are connected by a single bridge segment from the last vertex of ring
 * N to the closest vertex of ring N+1. This keeps the path continuous without
 * back-tracking around the polygon.
 */
import type { LatLng, SurveyConfig, SurveyResult } from '../survey-types';
import {
  latLngToLocal,
  localToLatLng,
  polygonCentroid,
  offsetPolygonRings,
  distance2D,
} from '../geo-math';
import { computeSurveyStats, getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';

function emptyStats(config: SurveyConfig) {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}

export function generateSpiral(config: SurveyConfig): SurveyResult {
  const { polygon, camera, altitude, frontOverlap, sideOverlap } = config;
  const direction = config.spiralDirection ?? 'inward';

  if (polygon.length < 3) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  const origin = polygonCentroid(polygon);
  const localPoly = polygon.map((v) => latLngToLocal(origin, v));

  // Spacing math reuses the same helpers as the grid generator so manual /
  // camera mode behave consistently. lineSpacing drives the ring step.
  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing, photoSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );

  if (lineSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Cap iterations to prevent runaway loops on degenerate polygons. A 200×200 m
  // yard with 1 m lineSpacing → ~100 rings, so 500 is comfortable headroom.
  const maxRings = 500;
  const rings = offsetPolygonRings(localPoly, lineSpacing, maxRings);
  if (rings.length === 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Outer-to-inner order: index 0 is the FIRST offset (just inside the polygon
  // boundary). To start AT the polygon boundary we prepend the original poly.
  const ringsOuterFirst: { x: number; y: number }[][] = [localPoly, ...rings];
  const orderedRings = direction === 'inward' ? ringsOuterFirst : [...ringsOuterFirst].reverse();

  // Walk each ring and emit its vertices. Connect ring N's last vertex to
  // ring N+1's closest-starting vertex via a single bridge segment — that
  // keeps the path continuous without a long traversal around the polygon.
  const waypointsLocal: { x: number; y: number }[] = [];
  for (let r = 0; r < orderedRings.length; r++) {
    const ring = orderedRings[r]!;
    if (r === 0) {
      // First ring: walk all vertices, then close back to start so the loop
      // is complete before bridging to the next ring.
      for (const v of ring) waypointsLocal.push({ x: v.x, y: v.y });
      waypointsLocal.push({ x: ring[0]!.x, y: ring[0]!.y });
    } else {
      // Find the index of this ring's vertex nearest the previous endpoint —
      // that's where we splice into the new ring.
      const prev = waypointsLocal[waypointsLocal.length - 1]!;
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < ring.length; i++) {
        const d = distance2D(prev, ring[i]!);
        if (d < bestDist) { bestDist = d; bestIdx = i; }
      }
      // Walk the ring starting from the closest vertex, then close back.
      for (let i = 0; i < ring.length; i++) {
        const v = ring[(bestIdx + i) % ring.length]!;
        waypointsLocal.push({ x: v.x, y: v.y });
      }
      waypointsLocal.push({ x: ring[bestIdx]!.x, y: ring[bestIdx]!.y });
    }
  }

  // Convert back to lat/lng.
  const waypoints: LatLng[] = waypointsLocal.map((p) => localToLatLng(origin, p.x, p.y));

  // Photo positions / footprints — camera mode only (mower skips both since
  // they're meaningless without optics).
  const isManual = !!(camera.manualCorridorWidth && camera.manualCorridorWidth > 0);
  const photoLocal: { x: number; y: number }[] = [];
  if (!isManual && photoSpacing > 0) {
    // Sample evenly along the path at photoSpacing intervals.
    let accum = 0;
    for (let i = 1; i < waypointsLocal.length; i++) {
      const a = waypointsLocal[i - 1]!;
      const b = waypointsLocal[i]!;
      const segLen = distance2D(a, b);
      if (segLen <= 0) continue;
      const dx = (b.x - a.x) / segLen;
      const dy = (b.y - a.y) / segLen;
      let walked = 0;
      // First photo placement: respect remaining accumulator from previous segment.
      let nextTrigger = photoSpacing - accum;
      while (nextTrigger <= segLen) {
        photoLocal.push({ x: a.x + dx * nextTrigger, y: a.y + dy * nextTrigger });
        walked = nextTrigger;
        nextTrigger += photoSpacing;
      }
      accum = segLen - walked;
    }
  }
  const photoPositions: LatLng[] = photoLocal.map((p) => localToLatLng(origin, p.x, p.y));

  // Footprint rectangles around each photo (axis-aligned in local frame — we
  // don't know the camera yaw for a spiral path, so picking world-aligned is
  // a sensible default that downstream renderers can rotate if desired).
  const halfW = footprintW / 2;
  const halfH = footprintH / 2;
  const footprints: LatLng[][] = isManual
    ? []
    : photoLocal.map((p) => [
        localToLatLng(origin, p.x - halfW, p.y - halfH),
        localToLatLng(origin, p.x + halfW, p.y - halfH),
        localToLatLng(origin, p.x + halfW, p.y + halfH),
        localToLatLng(origin, p.x - halfW, p.y + halfH),
      ]);

  const stats = computeSurveyStats(config, waypoints, photoPositions, orderedRings.length);

  return { waypoints, photoPositions, footprints, stats };
}
