/**
 * Perimeter + Fill Generator — N edge passes around the polygon boundary,
 * then a standard grid pass to cover the interior.
 *
 * Standard professional lawn-care pattern: 1-2 perimeter passes leave a clean
 * cut edge, then the inside is mowed in straight rows. The perimeter rings
 * also handle the corners that a pure grid pattern would miss.
 *
 * Implementation: offset the input polygon inward by `perimeterPasses ×
 * lineSpacing` to find the inner region that grid should fill, run the
 * existing grid generator on that smaller polygon, then prepend the perimeter
 * rings to its waypoint list.
 */
import type { LatLng, SurveyConfig, SurveyResult } from '../survey-types';
import {
  latLngToLocal,
  localToLatLng,
  polygonCentroid,
  offsetPolygonRings,
} from '../geo-math';
import { computeSurveyStats, getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';
import { generateGrid } from './grid-generator';

function emptyStats(config: SurveyConfig) {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}

export function generatePerimeterFill(config: SurveyConfig): SurveyResult {
  const { polygon, camera, altitude, frontOverlap, sideOverlap } = config;
  const passes = Math.max(1, Math.min(5, config.perimeterPasses ?? 2));

  if (polygon.length < 3) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  const origin = polygonCentroid(polygon);
  const localPoly = polygon.map((v) => latLngToLocal(origin, v));

  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );
  if (lineSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Perimeter rings — start with the polygon boundary (ring 0), then offset
  // inward (passes - 1) more times. We ask for `passes` rings from the
  // helper since it starts at the FIRST offset; ring at index 0 is one step
  // inside the original. Prepending the original polygon gives the full set.
  const innerRings = offsetPolygonRings(localPoly, lineSpacing, passes);
  if (innerRings.length === 0) {
    // The polygon is too small to fit even one offset ring — fall back to a
    // plain grid so the user still gets something useful out of it.
    return generateGrid(config);
  }
  // The set of perimeter rings we walk physically: original + (passes - 1)
  // offsets. If the polygon is so small we couldn't get all `passes` rings,
  // walk what we got.
  const perimeterRings = [localPoly, ...innerRings.slice(0, passes - 1)];

  // The inner polygon for grid fill is the last ring we managed to offset to,
  // shifted one more step inward so the grid lines don't overlap the last
  // perimeter pass.
  const fillBase = perimeterRings[perimeterRings.length - 1]!;
  const fillRings = offsetPolygonRings(fillBase, lineSpacing, 1);
  const fillPoly = fillRings[0];

  // Walk perimeter rings into local waypoints.
  const waypointsLocal: { x: number; y: number }[] = [];
  for (const ring of perimeterRings) {
    for (const v of ring) waypointsLocal.push({ x: v.x, y: v.y });
    // Close the ring so the path is continuous when bridging to the next.
    waypointsLocal.push({ x: ring[0]!.x, y: ring[0]!.y });
  }

  // Convert perimeter portion to lat/lng.
  const perimeterWaypoints: LatLng[] = waypointsLocal.map((p) => localToLatLng(origin, p.x, p.y));

  // Grid-fill the interior. We swap polygon for the inner offset and reuse
  // grid-generator wholesale — that gives us clipping, overshoot handling,
  // and photo-position math without re-implementing it.
  let interiorResult: SurveyResult | null = null;
  if (fillPoly && fillPoly.length >= 3) {
    const fillPolygonLatLng = fillPoly.map((p) => localToLatLng(origin, p.x, p.y));
    interiorResult = generateGrid({ ...config, polygon: fillPolygonLatLng, pattern: 'grid' });
  }

  // Concatenate the two phases' waypoints. Photo positions and footprints only
  // come from the interior grid (perimeter passes don't snap photos in this
  // simplified model — the use case is mowing, not photogrammetry).
  const waypoints: LatLng[] = [
    ...perimeterWaypoints,
    ...(interiorResult?.waypoints ?? []),
  ];
  const photoPositions: LatLng[] = interiorResult?.photoPositions ?? [];
  const footprints: LatLng[][] = interiorResult?.footprints ?? [];

  const lineCount = perimeterRings.length + (interiorResult?.stats.lineCount ?? 0);
  const stats = computeSurveyStats(config, waypoints, photoPositions, lineCount);

  return { waypoints, photoPositions, footprints, stats };
}
