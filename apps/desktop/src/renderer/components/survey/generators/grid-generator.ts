/**
 * Boustrophedon (Lawnmower) Grid Pattern Generator
 *
 * Algorithm:
 * 1. Convert polygon to local meters (origin = centroid)
 * 2. Rotate polygon by -gridAngle (so scan lines are axis-aligned)
 * 3. Calculate line/photo spacing from camera + overlap
 * 4. Generate horizontal scan lines across bounding box
 * 5. Clip each line to polygon boundary
 * 6. Add overshoot at each end
 * 7. Connect lines in boustrophedon (alternating direction) pattern
 * 8. Rotate all points back by +gridAngle
 * 9. Convert back to lat/lng
 * 10. Compute photo positions along each line
 * 11. Compute camera footprints at each photo position
 */
import type { LatLng, SurveyConfig, SurveyResult } from '../survey-types';
import { latLngToLocal, localToLatLng, polygonCentroid, rotatePoint, offsetPolygon } from '../geo-math';
import type { ClippedSegment } from '../polygon-clip';
import { clipScanLines, routeScanSegments, routeTransitAroundHoles, legEntersRing } from '../polygon-clip';
import { computeSurveyStats, getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';

/**
 * Generate a camera footprint polygon at a given position and angle.
 */
function computeFootprintRect(
  origin: LatLng,
  position: { x: number; y: number },
  halfW: number,
  halfH: number,
  angleRad: number,
): LatLng[] {
  // 4 corners of the footprint in local coords (unrotated)
  const corners = [
    { x: position.x - halfW, y: position.y - halfH },
    { x: position.x + halfW, y: position.y - halfH },
    { x: position.x + halfW, y: position.y + halfH },
    { x: position.x - halfW, y: position.y + halfH },
  ];
  // Rotate back and convert to lat/lng
  return corners.map(c => {
    const rotated = rotatePoint(c, angleRad, position);
    return localToLatLng(origin, rotated.x, rotated.y);
  });
}

/**
 * Move the start of the route to another corner of the area.
 *
 * The router picks the lowest-leftmost corner, which is rarely where the pilot
 * launches from. `invertPath` enters every line from its other end, `flipLegs`
 * flies the whole route backwards, so the two together with the grid angle
 * reach all four corners. Both keep the serpentine intact: the turns stay
 * between neighbouring line ends.
 */
export function applyStartCorner(
  lines: ClippedSegment[],
  flipLegs?: boolean,
  invertPath?: boolean,
): ClippedSegment[] {
  const swap = (s: ClippedSegment): ClippedSegment => ({ x1: s.x2, x2: s.x1, y: s.y });
  let out = invertPath ? lines.map(swap) : lines;
  if (flipLegs) out = [...out].reverse().map(swap);
  return out;
}

export function generateGrid(config: SurveyConfig): SurveyResult {
  const { polygon, camera, altitude, frontOverlap, sideOverlap, gridAngle, overshoot } = config;

  if (polygon.length < 3) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Ground-vehicle / no-camera mode: skip the camera footprint visualization
  // and the per-line "photo" sampling entirely. Photos and footprint rectangles
  // are camera concepts; a mower or rover only needs the line endpoints as
  // waypoints. Also force overshoot=0 since it's a fixed-wing turn-radius
  // buffer that doesn't apply to skid-steer ground vehicles.
  const isManual = !!(camera.manualCorridorWidth && camera.manualCorridorWidth > 0);
  const effectiveOvershoot = isManual ? 0 : overshoot;

  const origin = polygonCentroid(polygon);
  const angleRad = -gridAngle * (Math.PI / 180); // Negative to align scan lines

  // Convert polygon to local rotated coords
  let localPoly = polygon.map(v => {
    const local = latLngToLocal(origin, v);
    return rotatePoint(local, angleRad);
  });

  // Margin: buffer the polygon before scanning. Positive grows the surveyed
  // area outward, negative shrinks it inward. offsetPolygon's positive distance
  // SHRINKS, so we negate. Guard against an over-shrink that collapses or
  // flips the ring (keep the original polygon if the offset is degenerate).
  const margin = config.margin ?? 0;
  if (margin !== 0) {
    const buffered = offsetPolygon(localPoly, -margin);
    const a0 = Math.abs(signedArea2D(localPoly));
    const a1 = buffered.length >= 3 ? Math.abs(signedArea2D(buffered)) : 0;
    const sameWinding =
      buffered.length >= 3 && Math.sign(signedArea2D(buffered)) === Math.sign(signedArea2D(localPoly));
    // Area must move in the expected direction (grow increases it, shrink
    // decreases it). A wild miter spike from over-shrinking trips this and we
    // keep the original polygon.
    const areaOk = margin > 0 ? a1 > a0 : a1 < a0 && a1 > 1;
    if (sameWinding && areaOk) {
      localPoly = buffered;
    }
  }

  // No-fly holes get the same transform so scan-line clipping can carve them out.
  const localHoles = (config.holes ?? [])
    .filter(ring => ring.length >= 3)
    .map(ring => ring.map(v => rotatePoint(latLngToLocal(origin, v), angleRad)));

  // Camera footprint and spacing (or manual corridor width if camera is in manual mode)
  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing, photoSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );

  if (lineSpacing <= 0 || photoSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Clip scan lines to polygon, then order them into a single coherent path.
  // routeScanSegments groups the spans into connected components (arms) and
  // serpentines within each, so a branching/concave boundary doesn't produce a
  // flight path that deadheads across the empty interior on every row.
  const clippedLines = applyStartCorner(
    routeScanSegments(
      clipScanLines(localPoly, lineSpacing, effectiveOvershoot, localHoles),
      lineSpacing,
    ),
    config.flipLegs,
    config.invertPath,
  );

  // Plane mode: make every turn a clean 180°. Each turn joins one line's exit
  // to the next line's entry (both on the same side); extend whichever is
  // shorter so the two share an offset and the aircraft flies a symmetric
  // racetrack turn instead of cutting a diagonal. Copter/mower turn in place,
  // so leave the geometry untouched.
  if (!isManual && config.gridMode === 'plane') {
    for (let i = 0; i + 1 < clippedLines.length; i++) {
      const a = clippedLines[i]!;
      const b = clippedLines[i + 1]!;
      const outer = a.x2 >= a.x1
        ? Math.max(a.x2, b.x1) // turn on the right — extend to the rightmost
        : Math.min(a.x2, b.x1); // turn on the left — extend to the leftmost
      // The extension sweeps along each row; if either sweep would cut into a
      // no-fly hole (hole-split line ends), keep the corner turn instead.
      const sweepsHole = localHoles.some((h) =>
        legEntersRing({ x: a.x2, y: a.y }, { x: outer, y: a.y }, h) ||
        legEntersRing({ x: b.x1, y: b.y }, { x: outer, y: b.y }, h));
      if (!sweepsHole) {
        a.x2 = outer; b.x1 = outer;
      }
    }
  }

  if (clippedLines.length === 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Build waypoints. routeScanSegments already oriented each segment (x1 =
  // entry, x2 = exit) for the chosen traversal direction, so we follow it
  // directly instead of alternating by index.
  const waypointsLocal: { x: number; y: number }[] = [];
  const legStarts: number[] = [];
  const photoLocal: { x: number; y: number }[] = [];
  const reverseAngleRad = -angleRad;
  const halfW = footprintW / 2;
  const halfH = footprintH / 2;

  for (let i = 0; i < clippedLines.length; i++) {
    const line = clippedLines[i]!;

    const startX = line.x1;
    const endX = line.x2;
    const y = line.y;

    // Transit from the previous line's exit: detour around any no-fly hole
    // the direct hop would cut through (the coverage lines themselves are
    // already hole-clipped; the connecting legs were not).
    if (i > 0 && localHoles.length > 0) {
      const prev = clippedLines[i - 1]!;
      waypointsLocal.push(
        ...routeTransitAroundHoles({ x: prev.x2, y: prev.y }, { x: startX, y }, localHoles),
      );
    }

    // Line start point
    legStarts.push(waypointsLocal.length);
    waypointsLocal.push({ x: startX, y });

    // Photo positions along the line — skipped in manual/ground-vehicle mode
    // since there's no camera and rendering thousands of dots tanks the map.
    if (!isManual) {
      const lineLength = Math.abs(endX - startX);
      const direction = endX > startX ? 1 : -1;
      const numPhotos = Math.max(1, Math.floor(lineLength / photoSpacing));

      // Center photos within the line
      const totalPhotoSpan = (numPhotos - 1) * photoSpacing;
      const photoStart = startX + direction * (lineLength - totalPhotoSpan) / 2;

      for (let p = 0; p < numPhotos; p++) {
        const px = photoStart + direction * p * photoSpacing;
        photoLocal.push({ x: px, y });
      }
    }

    // Line end point
    waypointsLocal.push({ x: endX, y });
  }

  // Rotate back and convert to lat/lng
  const waypoints: LatLng[] = waypointsLocal.map(p => {
    const rotated = rotatePoint(p, reverseAngleRad);
    return localToLatLng(origin, rotated.x, rotated.y);
  });

  const photoPositions: LatLng[] = photoLocal.map(p => {
    const rotated = rotatePoint(p, reverseAngleRad);
    return localToLatLng(origin, rotated.x, rotated.y);
  });

  // Compute footprint rectangles
  const footprints: LatLng[][] = photoLocal.map(p => {
    const rotatedCenter = rotatePoint(p, reverseAngleRad);
    return computeFootprintRect(origin, rotatedCenter, halfW, halfH, reverseAngleRad);
  });

  const stats = computeSurveyStats(config, waypoints, photoPositions, clippedLines.length);

  return { waypoints, photoPositions, footprints, stats, legStarts };
}

/** Shoelace signed area of a local ring; sign indicates winding. */
function signedArea2D(pts: { x: number; y: number }[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i]!;
    const q = pts[(i + 1) % pts.length]!;
    a += p.x * q.y - q.x * p.y;
  }
  return a / 2;
}

function emptyStats(config: SurveyConfig) {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}

/**
 * Detour a lat/lng transit leg around no-fly holes. Used for legs OUTSIDE a
 * single grid pass (e.g. the crosshatch pass1 -> pass2 junction), projected
 * into a local frame around `from`. Returns intermediate points only.
 */
export function routeTransitLatLng(from: LatLng, to: LatLng, holes: LatLng[][]): LatLng[] {
  const rings = (holes ?? []).filter((h) => h.length >= 3);
  if (rings.length === 0) return [];
  const origin = from;
  const a = latLngToLocal(origin, from);
  const b = latLngToLocal(origin, to);
  const localHoles = rings.map((h) => h.map((v) => latLngToLocal(origin, v)));
  return routeTransitAroundHoles(a, b, localHoles).map((p) => localToLatLng(origin, p.x, p.y));
}
