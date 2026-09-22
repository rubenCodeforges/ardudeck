/**
 * A straight run onto the first line, before the survey starts.
 *
 * The aircraft reaches a survey from wherever it was: the takeoff, or the end
 * of the survey before it in a connected flight. It arrives at an arbitrary
 * angle and is still turning as it crosses the first waypoint, so the start of
 * the first line is photographed in a bank, or missed. A lead-in places one
 * waypoint back along the first leg so the aircraft is straight and aligned by
 * the time the line begins.
 *
 * The counterpart of the overshoot at the other end, and the same thing
 * Mission Planner's grid tool calls leadin.
 */

import type { LatLng } from './survey-types';

const M_PER_DEG_LAT = 110_540;
const mPerDegLon = (lat: number): number => 111_320 * Math.cos((lat * Math.PI) / 180);

/**
 * Prepend the lead-in point. Returns the list unchanged when there is nothing
 * to align to, or no lead-in asked for.
 */
export function withLeadIn(waypoints: readonly LatLng[], leadInM: number): LatLng[] {
  if (leadInM <= 0 || waypoints.length < 2) return [...waypoints];
  const first = waypoints[0]!;
  const second = waypoints[1]!;

  const kx = mPerDegLon(first.lat);
  const dx = (second.lng - first.lng) * kx;
  const dy = (second.lat - first.lat) * M_PER_DEG_LAT;
  const len = Math.hypot(dx, dy);
  // Two waypoints in the same place give no heading to line up with.
  if (len < 1e-6) return [...waypoints];

  return [
    {
      lat: first.lat - (dy / len) * leadInM / M_PER_DEG_LAT,
      lng: first.lng - (dx / len) * leadInM / kx,
    },
    ...waypoints,
  ];
}
