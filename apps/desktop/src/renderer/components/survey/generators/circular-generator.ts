/**
 * Circular/Orbital Pattern Generator
 * Concentric rings from polygon centroid outward.
 * Useful for structure inspection where camera always points toward center.
 */
import type { LatLng, SurveyConfig, SurveyResult } from '../survey-types';
import {
  latLngToLocal,
  localToLatLng,
  polygonCentroid,
  distance2D,
  boundingBox,
} from '../geo-math';
import { computeSurveyStats, getEffectiveFootprint, getEffectiveSpacing } from '../survey-stats';

/**
 * Check if a point is inside a polygon (ray casting).
 */
function pointInPolygon(point: { x: number; y: number }, polygon: { x: number; y: number }[]): boolean {
  let inside = false;
  const n = polygon.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = polygon[i]!;
    const b = polygon[j]!;
    if ((a.y > point.y) !== (b.y > point.y) &&
        point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

export function generateCircular(config: SurveyConfig): SurveyResult {
  const { polygon, camera, altitude, frontOverlap, sideOverlap } = config;

  if (polygon.length < 3) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats() };
  }

  const origin = polygonCentroid(polygon);
  const localPoly = polygon.map(v => latLngToLocal(origin, v));

  // Camera footprint and spacing (or manual corridor width if camera is in manual mode)
  const { width: footprintW, height: footprintH } = getEffectiveFootprint(camera, altitude);
  const { lineSpacing, photoSpacing } = getEffectiveSpacing(
    camera, footprintW, footprintH, frontOverlap, sideOverlap,
  );

  if (lineSpacing <= 0 || photoSpacing <= 0) {
    return { waypoints: [], photoPositions: [], footprints: [], stats: emptyStats() };
  }

  // Determine max radius from centroid to polygon boundary
  const bbox = boundingBox(localPoly);
  const center = { x: 0, y: 0 }; // centroid is our origin
  const maxRadius = Math.max(
    distance2D(center, { x: bbox.minX, y: bbox.minY }),
    distance2D(center, { x: bbox.maxX, y: bbox.minY }),
    distance2D(center, { x: bbox.minX, y: bbox.maxY }),
    distance2D(center, { x: bbox.maxX, y: bbox.maxY }),
  );

  // Generate concentric rings (spiraling outward)
  const waypointsLocal: { x: number; y: number }[] = [];
  const photoLocal: { x: number; y: number }[] = [];
  let ringCount = 0;

  for (let r = lineSpacing; r <= maxRadius; r += lineSpacing) {
    // Angular spacing based on circumference at this radius
    const circumference = 2 * Math.PI * r;
    const numPoints = Math.max(8, Math.ceil(circumference / photoSpacing));
    const angleStep = (2 * Math.PI) / numPoints;

    let hasPointInPoly = false;

    for (let i = 0; i <= numPoints; i++) {
      const angle = i * angleStep;
      const px = r * Math.cos(angle);
      const py = r * Math.sin(angle);
      const point = { x: px, y: py };

      // Only include points inside the polygon
      if (pointInPolygon(point, localPoly)) {
        waypointsLocal.push(point);
        photoLocal.push(point);
        hasPointInPoly = true;
      }
    }

    if (hasPointInPoly) ringCount++;
  }

  // Convert to lat/lng
  const waypoints: LatLng[] = waypointsLocal.map(p => localToLatLng(origin, p.x, p.y));
  // Manual mode: skip photo / footprint outputs — they're camera concepts.
  const isManual = !!(camera.manualCorridorWidth && camera.manualCorridorWidth > 0);
  const photoPositions: LatLng[] = isManual
    ? []
    : photoLocal.map(p => localToLatLng(origin, p.x, p.y));

  // Footprints for circular are squares (camera points down)
  const halfW = footprintW / 2;
  const halfH = footprintH / 2;
  const footprints: LatLng[][] = isManual ? [] : photoLocal.map(p => {
    return [
      localToLatLng(origin, p.x - halfW, p.y - halfH),
      localToLatLng(origin, p.x + halfW, p.y - halfH),
      localToLatLng(origin, p.x + halfW, p.y + halfH),
      localToLatLng(origin, p.x - halfW, p.y + halfH),
    ];
  });

  const stats = computeSurveyStats(config, waypoints, photoPositions, ringCount);

  return { waypoints, photoPositions, footprints, stats };
}

function emptyStats() {
  return {
    gsd: 0, flightDistance: 0, flightTime: 0, photoCount: 0,
    lineCount: 0, areaCovered: 0, footprintWidth: 0, footprintHeight: 0,
    lineSpacing: 0, photoSpacing: 0,
  };
}
