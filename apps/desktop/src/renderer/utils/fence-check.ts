/**
 * GCS-side geofence pre-check for map commands.
 *
 * ArduPilot rejects a guided destination outside the fence with a bare
 * MAV_RESULT_FAILED and no statustext (verified against SITL: FENCE_ENABLE=1,
 * FENCE_RADIUS=100 -> goto beyond radius = silent "GO_TO FAILED"). The
 * operator gets zero feedback about WHY. We know the fence on the GCS side
 * (FENCE_* params + uploaded polygons/circles), so warn BEFORE sending.
 *
 * Advisory only - the FC remains the enforcer. Returns null when the point is
 * fine or when we don't have enough data to judge.
 */

import { useParameterStore } from '../stores/parameter-store';
import { useFenceStore } from '../stores/fence-store';
import { useMissionStore } from '../stores/mission-store';

const FENCE_TYPE_CIRCLE = 2; // bit: circle centered on home
const FENCE_TYPE_POLYGON = 4; // bit: polygon(s)

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const r = Math.PI / 180;
  const dLat = (lat2 - lat1) * r;
  const dLon = (lon2 - lon1) * r;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.sin(dLon / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function pointInPolygon(lat: number, lon: number, vertices: Array<{ lat: number; lon: number }>): boolean {
  let inside = false;
  for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
    const a = vertices[i]!;
    const b = vertices[j]!;
    if ((a.lon > lon) !== (b.lon > lon) && lat < ((b.lat - a.lat) * (lon - a.lon)) / (b.lon - a.lon) + a.lat) {
      inside = !inside;
    }
  }
  return inside;
}

/** Short human reason when (lat, lon) would breach the fence, else null. */
export function fenceWarningForPoint(lat: number, lon: number): string | null {
  const params = useParameterStore.getState().parameters;
  const enable = params.get('FENCE_ENABLE')?.value;
  if (enable !== 1) return null; // fence off (or params not loaded): nothing to judge

  const fenceType = params.get('FENCE_TYPE')?.value ?? 7;

  // Circle around home (FENCE_RADIUS)
  if (fenceType & FENCE_TYPE_CIRCLE) {
    const radius = params.get('FENCE_RADIUS')?.value ?? 300;
    const home = useMissionStore.getState().homePosition;
    if (home && radius > 0) {
      const d = haversine(home.lat, home.lon, lat, lon);
      if (d > radius) return `outside fence: ${Math.round(d)} m from home, FENCE_RADIUS ${Math.round(radius)} m`;
    }
  }

  // Uploaded polygon / circle fence items
  if (fenceType & FENCE_TYPE_POLYGON) {
    const { polygons, circles } = useFenceStore.getState();
    const inclusions = polygons.filter((p) => p.type === 'inclusion' && p.vertices.length >= 3);
    if (inclusions.length > 0 && !inclusions.some((p) => pointInPolygon(lat, lon, p.vertices))) {
      return 'outside fence: not inside any inclusion polygon';
    }
    for (const p of polygons) {
      if (p.type === 'exclusion' && p.vertices.length >= 3 && pointInPolygon(lat, lon, p.vertices)) {
        return 'inside an exclusion zone';
      }
    }
    const circleInclusions = circles.filter((c) => c.type === 'inclusion');
    if (circleInclusions.length > 0 && !circleInclusions.some((c) => haversine(c.center.lat, c.center.lon, lat, lon) <= c.radius)) {
      return 'outside fence: not inside any inclusion circle';
    }
    for (const c of circles) {
      if (c.type === 'exclusion' && haversine(c.center.lat, c.center.lon, lat, lon) <= c.radius) {
        return 'inside an exclusion zone';
      }
    }
  }

  return null;
}
