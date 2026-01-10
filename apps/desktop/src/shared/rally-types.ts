/**
 * Rally Points Types
 *
 * Defines rally points for ArduPilot emergency landing locations.
 * Uses MAVLink mission protocol with mission_type = MAV_MISSION_TYPE_RALLY (2)
 */

// MAV_CMD rally command
export const RALLY_CMD = {
  NAV_RALLY_POINT: 5100,
} as const;

/**
 * Rally point - emergency landing location
 *
 * Rally points are alternative landing locations the vehicle can use
 * during Return-to-Launch (RTL) if they're closer than home.
 */
export interface RallyPoint {
  seq: number;
  latitude: number;
  longitude: number;
  altitude: number; // Altitude in meters (relative or absolute based on frame)
  breakAltitude: number; // param1: Altitude to break from loiter (m)
  landDirection: number; // param2: Heading for landing approach (degrees, 0=any)
  flags: number; // param3: Rally flags bitmask
}

// Rally flags bitmask values
export const RALLY_FLAGS = {
  FAVORABLE_WIND: 1, // Land into wind
  LAND_IMMEDIATELY: 2, // Don't loiter, land immediately
} as const;

/**
 * Rally item as stored in MAVLink mission format
 */
export interface RallyItem {
  seq: number;
  command: number; // NAV_RALLY_POINT (5100)
  frame: number;
  param1: number; // Break altitude
  param2: number; // Land direction (heading)
  param3: number; // Flags
  param4: number; // Reserved
  latitude: number;
  longitude: number;
  altitude: number;
}

/**
 * Convert raw rally items to RallyPoint array
 */
export function parseRallyItems(items: RallyItem[]): RallyPoint[] {
  return items
    .filter((item) => item.command === RALLY_CMD.NAV_RALLY_POINT)
    .map((item) => ({
      seq: item.seq,
      latitude: item.latitude,
      longitude: item.longitude,
      altitude: item.altitude,
      breakAltitude: item.param1,
      landDirection: item.param2,
      flags: item.param3,
    }));
}

/**
 * Convert RallyPoint array to raw items for upload
 */
export function buildRallyItems(points: RallyPoint[]): RallyItem[] {
  return points.map((point, index) => ({
    seq: index,
    command: RALLY_CMD.NAV_RALLY_POINT,
    frame: 0, // MAV_FRAME_GLOBAL
    param1: point.breakAltitude,
    param2: point.landDirection,
    param3: point.flags,
    param4: 0,
    latitude: point.latitude,
    longitude: point.longitude,
    altitude: point.altitude,
  }));
}

/**
 * Create a new rally point with defaults
 */
export function createRallyPoint(
  seq: number,
  lat: number,
  lon: number,
  altitude: number = 100
): RallyPoint {
  return {
    seq,
    latitude: lat,
    longitude: lon,
    altitude,
    breakAltitude: altitude - 10, // Default: 10m below rally alt
    landDirection: 0, // Any direction
    flags: 0,
  };
}

/**
 * Get human-readable flag description
 */
export function getRallyFlagsDescription(flags: number): string {
  const descriptions: string[] = [];
  if (flags & RALLY_FLAGS.FAVORABLE_WIND) {
    descriptions.push('Land into wind');
  }
  if (flags & RALLY_FLAGS.LAND_IMMEDIATELY) {
    descriptions.push('Land immediately');
  }
  return descriptions.length > 0 ? descriptions.join(', ') : 'None';
}
