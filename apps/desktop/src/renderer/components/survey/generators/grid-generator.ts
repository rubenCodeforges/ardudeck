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
import { latLngToLocal, localToLatLng, polygonCentroid, rotatePoint } from '../geo-math';
import { clipScanLines } from '../polygon-clip';
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
  const localPoly = polygon.map(v => {
    const local = latLngToLocal(origin, v);
    return rotatePoint(local, angleRad);
  });

  // Camera footprint and spacing (or manual corridor width if camera is in manual mode)
  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing, photoSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );

  if (lineSpacing <= 0 || photoSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Clip scan lines to polygon
  const clippedLines = clipScanLines(localPoly, lineSpacing, effectiveOvershoot);

  if (clippedLines.length === 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats(config) };
  }

  // Build boustrophedon (alternating direction) waypoints
  const waypointsLocal: { x: number; y: number }[] = [];
  const photoLocal: { x: number; y: number }[] = [];
  const reverseAngleRad = -angleRad;
  const halfW = footprintW / 2;
  const halfH = footprintH / 2;

  for (let i = 0; i < clippedLines.length; i++) {
    const line = clippedLines[i]!;
    const reverse = i % 2 === 1;

    const startX = reverse ? line.x2 : line.x1;
    const endX = reverse ? line.x1 : line.x2;
    const y = line.y;

    // Line start point
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

  return { waypoints, photoPositions, footprints, stats };
}

function emptyStats(config: SurveyConfig) {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}
