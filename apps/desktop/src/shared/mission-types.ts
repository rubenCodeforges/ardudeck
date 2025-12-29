/**
 * Mission Planning Types
 * Types and constants for mission waypoint management
 */

// MAV_FRAME constants for coordinate reference
export const MAV_FRAME = {
  GLOBAL: 0,                    // Absolute altitude (MSL)
  GLOBAL_RELATIVE_ALT: 3,       // Altitude relative to home (most common)
  GLOBAL_INT: 4,                // Absolute altitude with int32 coords
  GLOBAL_RELATIVE_ALT_INT: 5,   // Relative altitude with int32 coords
  GLOBAL_TERRAIN_ALT: 10,       // Altitude relative to terrain
} as const;

export type MavFrame = typeof MAV_FRAME[keyof typeof MAV_FRAME];

// MAV_CMD constants (most common mission commands)
export const MAV_CMD = {
  NAV_WAYPOINT: 16,
  NAV_LOITER_UNLIM: 17,
  NAV_LOITER_TURNS: 18,
  NAV_LOITER_TIME: 19,
  NAV_RETURN_TO_LAUNCH: 20,
  NAV_LAND: 21,
  NAV_TAKEOFF: 22,
  NAV_LAND_LOCAL: 23,
  NAV_TAKEOFF_LOCAL: 24,
  NAV_CONTINUE_AND_CHANGE_ALT: 30,
  NAV_LOITER_TO_ALT: 31,
  NAV_SPLINE_WAYPOINT: 82,
  NAV_VTOL_TAKEOFF: 84,
  NAV_VTOL_LAND: 85,
  NAV_DELAY: 93,
  NAV_PAYLOAD_PLACE: 94,
  DO_CHANGE_SPEED: 178,
  DO_SET_HOME: 179,
  DO_SET_RELAY: 181,
  DO_REPEAT_RELAY: 182,
  DO_SET_SERVO: 183,
  DO_REPEAT_SERVO: 184,
  DO_SET_CAM_TRIGG_DIST: 206,
  DO_SET_ROI: 201,
  DO_DIGICAM_CONTROL: 203,
  DO_MOUNT_CONTROL: 205,
  DO_VTOL_TRANSITION: 3000,
} as const;

export type MavCmd = typeof MAV_CMD[keyof typeof MAV_CMD];

// Human-readable command names
export const COMMAND_NAMES: Record<number, string> = {
  [MAV_CMD.NAV_WAYPOINT]: 'Waypoint',
  [MAV_CMD.NAV_LOITER_UNLIM]: 'Loiter Unlim',
  [MAV_CMD.NAV_LOITER_TURNS]: 'Loiter Turns',
  [MAV_CMD.NAV_LOITER_TIME]: 'Loiter Time',
  [MAV_CMD.NAV_RETURN_TO_LAUNCH]: 'RTL',
  [MAV_CMD.NAV_LAND]: 'Land',
  [MAV_CMD.NAV_TAKEOFF]: 'Takeoff',
  [MAV_CMD.NAV_SPLINE_WAYPOINT]: 'Spline WP',
  [MAV_CMD.NAV_DELAY]: 'Delay',
  [MAV_CMD.NAV_LOITER_TO_ALT]: 'Loiter to Alt',
  [MAV_CMD.NAV_VTOL_TAKEOFF]: 'VTOL Takeoff',
  [MAV_CMD.NAV_VTOL_LAND]: 'VTOL Land',
  [MAV_CMD.DO_CHANGE_SPEED]: 'Change Speed',
  [MAV_CMD.DO_SET_HOME]: 'Set Home',
  [MAV_CMD.DO_SET_CAM_TRIGG_DIST]: 'Camera Trigger',
  [MAV_CMD.DO_SET_ROI]: 'Set ROI',
  [MAV_CMD.DO_SET_SERVO]: 'Set Servo',
  [MAV_CMD.DO_SET_RELAY]: 'Set Relay',
};

// Command descriptions for tooltips
export const COMMAND_DESCRIPTIONS: Record<number, string> = {
  [MAV_CMD.NAV_WAYPOINT]: 'Navigate to waypoint with optional loiter time',
  [MAV_CMD.NAV_LOITER_UNLIM]: 'Loiter at location indefinitely',
  [MAV_CMD.NAV_LOITER_TURNS]: 'Loiter N turns around location',
  [MAV_CMD.NAV_LOITER_TIME]: 'Loiter at location for X seconds',
  [MAV_CMD.NAV_RETURN_TO_LAUNCH]: 'Return to launch/home location',
  [MAV_CMD.NAV_LAND]: 'Land at specified location',
  [MAV_CMD.NAV_TAKEOFF]: 'Takeoff to specified altitude',
  [MAV_CMD.NAV_SPLINE_WAYPOINT]: 'Spline waypoint for smooth curves',
  [MAV_CMD.NAV_DELAY]: 'Wait for specified time',
  [MAV_CMD.DO_CHANGE_SPEED]: 'Change target speed',
  [MAV_CMD.DO_SET_HOME]: 'Set new home position',
  [MAV_CMD.DO_SET_CAM_TRIGG_DIST]: 'Set camera trigger distance',
};

// Commands that have location (lat/lon/alt)
export const COMMANDS_WITH_LOCATION = new Set([
  MAV_CMD.NAV_WAYPOINT,
  MAV_CMD.NAV_LOITER_UNLIM,
  MAV_CMD.NAV_LOITER_TURNS,
  MAV_CMD.NAV_LOITER_TIME,
  MAV_CMD.NAV_LAND,
  MAV_CMD.NAV_TAKEOFF,
  MAV_CMD.NAV_SPLINE_WAYPOINT,
  MAV_CMD.NAV_LOITER_TO_ALT,
  MAV_CMD.NAV_VTOL_TAKEOFF,
  MAV_CMD.NAV_VTOL_LAND,
  MAV_CMD.DO_SET_ROI,
  MAV_CMD.DO_SET_HOME,
]);

/**
 * Mission item (waypoint) structure
 * Matches MAVLink MISSION_ITEM_INT message format
 */
export interface MissionItem {
  seq: number;              // Sequence number (0-based)
  frame: MavFrame;          // Coordinate frame (default: GLOBAL_RELATIVE_ALT)
  command: number;          // MAV_CMD value
  current: boolean;         // Is current active waypoint
  autocontinue: boolean;    // Auto-advance to next waypoint
  param1: number;           // Command-specific param1 (e.g., hold time for WP)
  param2: number;           // Command-specific param2 (e.g., acceptance radius)
  param3: number;           // Command-specific param3 (e.g., pass-through radius)
  param4: number;           // Command-specific param4 (e.g., yaw angle)
  latitude: number;         // Latitude in degrees
  longitude: number;        // Longitude in degrees
  altitude: number;         // Altitude in meters (relative to frame)
}

/**
 * Mission download/upload progress
 */
export interface MissionProgress {
  total: number;
  transferred: number;
  operation: 'download' | 'upload';
}

/**
 * MAV_MISSION_RESULT codes
 */
export const MAV_MISSION_RESULT = {
  ACCEPTED: 0,
  ERROR: 1,
  UNSUPPORTED_FRAME: 2,
  UNSUPPORTED: 3,
  NO_SPACE: 4,
  INVALID: 5,
  INVALID_PARAM1: 6,
  INVALID_PARAM2: 7,
  INVALID_PARAM3: 8,
  INVALID_PARAM4: 9,
  INVALID_PARAM5_X: 10,
  INVALID_PARAM6_Y: 11,
  INVALID_PARAM7: 12,
  INVALID_SEQUENCE: 13,
  DENIED: 14,
  OPERATION_CANCELLED: 15,
} as const;

export type MavMissionResult = typeof MAV_MISSION_RESULT[keyof typeof MAV_MISSION_RESULT];

/**
 * MAV_MISSION_TYPE for different mission types
 */
export const MAV_MISSION_TYPE = {
  MISSION: 0,       // Main mission waypoints
  FENCE: 1,         // Geofence areas
  RALLY: 2,         // Rally points
  ALL: 255,         // Clear all types
} as const;

export type MavMissionType = typeof MAV_MISSION_TYPE[keyof typeof MAV_MISSION_TYPE];

/**
 * Create a default waypoint
 */
export function createDefaultWaypoint(
  seq: number,
  latitude: number,
  longitude: number,
  altitude: number = 100,
): MissionItem {
  return {
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_WAYPOINT,
    current: false,
    autocontinue: true,
    param1: 0,      // Hold time
    param2: 0,      // Acceptance radius
    param3: 0,      // Pass radius (0 = fly through)
    param4: NaN,    // Yaw (NaN = unchanged)
    latitude,
    longitude,
    altitude,
  };
}

/**
 * Get human-readable name for a command
 */
export function getCommandName(command: number): string {
  return COMMAND_NAMES[command] || `CMD ${command}`;
}

/**
 * Check if a command has location (lat/lon/alt)
 */
export function commandHasLocation(command: number): boolean {
  return COMMANDS_WITH_LOCATION.has(command);
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Calculate total mission distance
 * @returns Total distance in meters
 */
export function calculateMissionDistance(items: MissionItem[]): number {
  let total = 0;
  const locItems = items.filter(item => commandHasLocation(item.command));

  for (let i = 1; i < locItems.length; i++) {
    const prev = locItems[i - 1];
    const curr = locItems[i];
    total += calculateDistance(prev.latitude, prev.longitude, curr.latitude, curr.longitude);
  }

  return total;
}

/**
 * Estimate mission time based on distance and speed
 * @param distance Total distance in meters
 * @param speed Speed in m/s (default 10 m/s)
 * @returns Estimated time in seconds
 */
export function estimateMissionTime(distance: number, speed: number = 10): number {
  return distance / speed;
}
