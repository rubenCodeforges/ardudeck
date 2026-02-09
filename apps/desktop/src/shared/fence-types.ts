/**
 * Geofencing Types
 *
 * Defines fence items for ArduPilot geofencing.
 * Uses MAVLink mission protocol with mission_type = MAV_MISSION_TYPE_FENCE (1)
 */

// MAV_CMD fence commands
export const FENCE_CMD = {
  NAV_FENCE_RETURN_POINT: 5000,
  NAV_FENCE_POLYGON_VERTEX_INCLUSION: 5001,
  NAV_FENCE_POLYGON_VERTEX_EXCLUSION: 5002,
  NAV_FENCE_CIRCLE_INCLUSION: 5003,
  NAV_FENCE_CIRCLE_EXCLUSION: 5004,
} as const;

export type FenceCommand = (typeof FENCE_CMD)[keyof typeof FENCE_CMD];

/**
 * Raw fence item as received from/sent to flight controller
 */
export interface FenceItem {
  seq: number;
  command: number;
  frame: number;
  param1: number; // vertex count (for first vertex of polygon) or radius (for circles)
  param2: number;
  param3: number;
  param4: number;
  latitude: number;
  longitude: number;
  altitude: number;
}

/**
 * Parsed polygon fence (inclusion or exclusion)
 */
export interface PolygonFence {
  id: string;
  type: 'inclusion' | 'exclusion';
  vertices: Array<{ seq: number; lat: number; lon: number }>;
}

/**
 * Parsed circle fence (inclusion or exclusion)
 */
export interface CircleFence {
  id: string;
  type: 'inclusion' | 'exclusion';
  center: { lat: number; lon: number };
  radius: number; // meters
  seq: number;
}

/**
 * Return point - where vehicle goes on fence breach
 */
export interface FenceReturnPoint {
  lat: number;
  lon: number;
  altitude: number;
  seq: number;
}

/**
 * Live fence status from FENCE_STATUS message (ID 162)
 */
export interface FenceStatus {
  breachStatus: number; // 0 = OK (inside), 1 = breached
  breachCount: number; // Number of breaches since boot
  breachType: number; // FENCE_BREACH enum
  breachTime: number; // Time of last breach (ms since boot)
}

// FENCE_BREACH enum values
export const FENCE_BREACH = {
  NONE: 0,
  MINALT: 1,
  MAXALT: 2,
  BOUNDARY: 3,
} as const;

/**
 * Helper to get command ID from fence type
 */
export function getFenceCommand(
  shape: 'polygon' | 'circle',
  type: 'inclusion' | 'exclusion'
): FenceCommand {
  if (shape === 'polygon') {
    return type === 'inclusion'
      ? FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_INCLUSION
      : FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_EXCLUSION;
  }
  return type === 'inclusion'
    ? FENCE_CMD.NAV_FENCE_CIRCLE_INCLUSION
    : FENCE_CMD.NAV_FENCE_CIRCLE_EXCLUSION;
}

/**
 * Helper to determine fence type from command
 */
export function getFenceTypeFromCommand(command: number): {
  shape: 'polygon' | 'circle' | 'return';
  type: 'inclusion' | 'exclusion' | 'return';
} | null {
  switch (command) {
    case FENCE_CMD.NAV_FENCE_RETURN_POINT:
      return { shape: 'return', type: 'return' };
    case FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_INCLUSION:
      return { shape: 'polygon', type: 'inclusion' };
    case FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_EXCLUSION:
      return { shape: 'polygon', type: 'exclusion' };
    case FENCE_CMD.NAV_FENCE_CIRCLE_INCLUSION:
      return { shape: 'circle', type: 'inclusion' };
    case FENCE_CMD.NAV_FENCE_CIRCLE_EXCLUSION:
      return { shape: 'circle', type: 'exclusion' };
    default:
      return null;
  }
}

/**
 * Convert raw fence items to structured fences
 */
export function parseFenceItems(items: FenceItem[]): {
  polygons: PolygonFence[];
  circles: CircleFence[];
  returnPoint: FenceReturnPoint | null;
} {
  const polygons: PolygonFence[] = [];
  const circles: CircleFence[] = [];
  let returnPoint: FenceReturnPoint | null = null;

  let currentPolygon: PolygonFence | null = null;
  let expectedVertices = 0;

  for (const item of items) {
    const fenceType = getFenceTypeFromCommand(item.command);
    if (!fenceType) continue;

    if (fenceType.shape === 'return') {
      returnPoint = {
        lat: item.latitude,
        lon: item.longitude,
        altitude: item.altitude,
        seq: item.seq,
      };
    } else if (fenceType.shape === 'circle') {
      circles.push({
        id: `circle-${item.seq}`,
        type: fenceType.type as 'inclusion' | 'exclusion',
        center: { lat: item.latitude, lon: item.longitude },
        radius: item.param1, // radius in param1
        seq: item.seq,
      });
    } else if (fenceType.shape === 'polygon') {
      // First vertex of polygon has vertex count in param1
      if (item.param1 > 0 && item.param1 <= 100) {
        // Start new polygon
        if (currentPolygon && currentPolygon.vertices.length >= 3) {
          polygons.push(currentPolygon);
        }
        currentPolygon = {
          id: `polygon-${item.seq}`,
          type: fenceType.type as 'inclusion' | 'exclusion',
          vertices: [{ seq: item.seq, lat: item.latitude, lon: item.longitude }],
        };
        expectedVertices = item.param1;
      } else if (currentPolygon) {
        // Continue existing polygon
        currentPolygon.vertices.push({
          seq: item.seq,
          lat: item.latitude,
          lon: item.longitude,
        });
        // Check if polygon is complete
        if (currentPolygon.vertices.length >= expectedVertices) {
          polygons.push(currentPolygon);
          currentPolygon = null;
          expectedVertices = 0;
        }
      }
    }
  }

  // Add any remaining polygon
  if (currentPolygon && currentPolygon.vertices.length >= 3) {
    polygons.push(currentPolygon);
  }

  return { polygons, circles, returnPoint };
}

/**
 * Convert structured fences back to raw fence items for upload
 */
export function buildFenceItems(
  polygons: PolygonFence[],
  circles: CircleFence[],
  returnPoint: FenceReturnPoint | null
): FenceItem[] {
  const items: FenceItem[] = [];
  let seq = 0;

  // Return point first (if exists)
  if (returnPoint) {
    items.push({
      seq: seq++,
      command: FENCE_CMD.NAV_FENCE_RETURN_POINT,
      frame: 0, // MAV_FRAME_GLOBAL
      param1: 0,
      param2: 0,
      param3: 0,
      param4: 0,
      latitude: returnPoint.lat,
      longitude: returnPoint.lon,
      altitude: returnPoint.altitude,
    });
  }

  // Polygons
  for (const polygon of polygons) {
    const command =
      polygon.type === 'inclusion'
        ? FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_INCLUSION
        : FENCE_CMD.NAV_FENCE_POLYGON_VERTEX_EXCLUSION;

    for (let i = 0; i < polygon.vertices.length; i++) {
      const vertex = polygon.vertices[i];
      items.push({
        seq: seq++,
        command,
        frame: 0, // MAV_FRAME_GLOBAL
        param1: i === 0 ? polygon.vertices.length : 0, // vertex count on first vertex
        param2: 0,
        param3: 0,
        param4: 0,
        latitude: vertex!.lat,
        longitude: vertex!.lon,
        altitude: 0,
      });
    }
  }

  // Circles
  for (const circle of circles) {
    const command =
      circle.type === 'inclusion'
        ? FENCE_CMD.NAV_FENCE_CIRCLE_INCLUSION
        : FENCE_CMD.NAV_FENCE_CIRCLE_EXCLUSION;

    items.push({
      seq: seq++,
      command,
      frame: 0, // MAV_FRAME_GLOBAL
      param1: circle.radius,
      param2: 0,
      param3: 0,
      param4: 0,
      latitude: circle.center.lat,
      longitude: circle.center.lon,
      altitude: 0,
    });
  }

  return items;
}
