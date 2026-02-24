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

// MAV_CMD constants - comprehensive set for ArduPilot mission planning
export const MAV_CMD = {
  // Navigation commands (move the vehicle)
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
  NAV_ARC_WAYPOINT: 36,
  NAV_SPLINE_WAYPOINT: 82,
  NAV_ALTITUDE_WAIT: 83,
  NAV_VTOL_TAKEOFF: 84,
  NAV_VTOL_LAND: 85,
  NAV_GUIDED_ENABLE: 92,
  NAV_DELAY: 93,
  NAV_PAYLOAD_PLACE: 94,

  // Condition commands (wait for condition before next item)
  CONDITION_DELAY: 112,
  CONDITION_CHANGE_ALT: 113,
  CONDITION_DISTANCE: 114,
  CONDITION_YAW: 115,

  // DO commands (execute immediately, no wait)
  DO_SET_MODE: 176,
  DO_JUMP: 177,
  DO_CHANGE_SPEED: 178,
  DO_SET_HOME: 179,
  DO_SET_PARAMETER: 180,
  DO_SET_RELAY: 181,
  DO_REPEAT_RELAY: 182,
  DO_SET_SERVO: 183,
  DO_REPEAT_SERVO: 184,
  DO_FLIGHTTERMINATION: 185,
  DO_CHANGE_ALTITUDE: 186,
  DO_LAND_START: 189,
  DO_RALLY_LAND: 190,
  DO_GO_AROUND: 191,
  DO_REPOSITION: 192,
  DO_PAUSE_CONTINUE: 193,
  DO_SET_REVERSE: 194,
  DO_SET_ROI_LOCATION: 195,
  DO_SET_ROI_WPNEXT_OFFSET: 196,
  DO_SET_ROI_NONE: 197,
  DO_SET_ROI_SYSID: 198,
  DO_CONTROL_VIDEO: 200,
  DO_SET_ROI: 201,
  DO_DIGICAM_CONFIGURE: 202,
  DO_DIGICAM_CONTROL: 203,
  DO_MOUNT_CONFIGURE: 204,
  DO_MOUNT_CONTROL: 205,
  DO_SET_CAM_TRIGG_DIST: 206,
  DO_FENCE_ENABLE: 207,
  DO_PARACHUTE: 208,
  DO_MOTOR_TEST: 209,
  DO_INVERTED_FLIGHT: 210,
  DO_GRIPPER: 211,
  DO_AUTOTUNE_ENABLE: 212,
  SET_YAW_SPEED: 213,
  DO_SET_CAM_TRIGG_INTERVAL: 214,
  DO_SET_RESUME_REPEAT_DIST: 215,
  DO_SPRAYER: 216,
  DO_SEND_SCRIPT_MESSAGE: 217,
  DO_AUX_FUNCTION: 218,
  DO_GUIDED_LIMITS: 222,
  DO_ENGINE_CONTROL: 223,
  DO_SET_MISSION_CURRENT: 224,

  // Camera protocol commands
  SET_CAMERA_MODE: 530,
  SET_CAMERA_ZOOM: 531,
  SET_CAMERA_FOCUS: 532,
  SET_CAMERA_SOURCE: 534,
  JUMP_TAG: 600,
  DO_JUMP_TAG: 601,
  DO_GIMBAL_MANAGER_PITCHYAW: 1000,
  IMAGE_START_CAPTURE: 2000,
  IMAGE_STOP_CAPTURE: 2001,
  VIDEO_START_CAPTURE: 2500,
  VIDEO_STOP_CAPTURE: 2501,
  DO_VTOL_TRANSITION: 3000,

  // ArduPilot custom commands
  DO_WINCH: 42600,
  NAV_SCRIPT_TIME: 42702,
  NAV_ATTITUDE_TIME: 42703,
} as const;

export type MavCmd = typeof MAV_CMD[keyof typeof MAV_CMD];

// Human-readable command names - every MAV_CMD gets a friendly name
export const COMMAND_NAMES: Record<number, string> = {
  // Navigation
  [MAV_CMD.NAV_WAYPOINT]: 'Waypoint',
  [MAV_CMD.NAV_LOITER_UNLIM]: 'Loiter Unlim',
  [MAV_CMD.NAV_LOITER_TURNS]: 'Loiter Turns',
  [MAV_CMD.NAV_LOITER_TIME]: 'Loiter Time',
  [MAV_CMD.NAV_RETURN_TO_LAUNCH]: 'RTL',
  [MAV_CMD.NAV_LAND]: 'Land',
  [MAV_CMD.NAV_TAKEOFF]: 'Takeoff',
  [MAV_CMD.NAV_LAND_LOCAL]: 'Land Local',
  [MAV_CMD.NAV_TAKEOFF_LOCAL]: 'Takeoff Local',
  [MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT]: 'Continue/Change Alt',
  [MAV_CMD.NAV_LOITER_TO_ALT]: 'Loiter to Alt',
  [MAV_CMD.NAV_ARC_WAYPOINT]: 'Arc Waypoint',
  [MAV_CMD.NAV_SPLINE_WAYPOINT]: 'Spline WP',
  [MAV_CMD.NAV_ALTITUDE_WAIT]: 'Altitude Wait',
  [MAV_CMD.NAV_VTOL_TAKEOFF]: 'VTOL Takeoff',
  [MAV_CMD.NAV_VTOL_LAND]: 'VTOL Land',
  [MAV_CMD.NAV_GUIDED_ENABLE]: 'Guided Enable',
  [MAV_CMD.NAV_DELAY]: 'Delay',
  [MAV_CMD.NAV_PAYLOAD_PLACE]: 'Payload Place',
  [MAV_CMD.NAV_SCRIPT_TIME]: 'Script Time',
  [MAV_CMD.NAV_ATTITUDE_TIME]: 'Attitude Time',

  // Conditions
  [MAV_CMD.CONDITION_DELAY]: 'Condition Delay',
  [MAV_CMD.CONDITION_CHANGE_ALT]: 'Condition Alt',
  [MAV_CMD.CONDITION_DISTANCE]: 'Condition Dist',
  [MAV_CMD.CONDITION_YAW]: 'Condition Yaw',

  // DO commands
  [MAV_CMD.DO_SET_MODE]: 'Set Mode',
  [MAV_CMD.DO_JUMP]: 'Jump',
  [MAV_CMD.DO_CHANGE_SPEED]: 'Change Speed',
  [MAV_CMD.DO_SET_HOME]: 'Set Home',
  [MAV_CMD.DO_SET_PARAMETER]: 'Set Parameter',
  [MAV_CMD.DO_SET_RELAY]: 'Set Relay',
  [MAV_CMD.DO_REPEAT_RELAY]: 'Repeat Relay',
  [MAV_CMD.DO_SET_SERVO]: 'Set Servo',
  [MAV_CMD.DO_REPEAT_SERVO]: 'Repeat Servo',
  [MAV_CMD.DO_FLIGHTTERMINATION]: 'Flight Termination',
  [MAV_CMD.DO_CHANGE_ALTITUDE]: 'Change Altitude',
  [MAV_CMD.DO_LAND_START]: 'Land Start',
  [MAV_CMD.DO_RALLY_LAND]: 'Rally Land',
  [MAV_CMD.DO_GO_AROUND]: 'Go Around',
  [MAV_CMD.DO_REPOSITION]: 'Reposition',
  [MAV_CMD.DO_PAUSE_CONTINUE]: 'Pause/Continue',
  [MAV_CMD.DO_SET_REVERSE]: 'Set Reverse',
  [MAV_CMD.DO_SET_ROI_LOCATION]: 'ROI Location',
  [MAV_CMD.DO_SET_ROI_WPNEXT_OFFSET]: 'ROI Next WP',
  [MAV_CMD.DO_SET_ROI_NONE]: 'ROI None',
  [MAV_CMD.DO_SET_ROI_SYSID]: 'ROI System',
  [MAV_CMD.DO_CONTROL_VIDEO]: 'Control Video',
  [MAV_CMD.DO_SET_ROI]: 'Set ROI',
  [MAV_CMD.DO_DIGICAM_CONFIGURE]: 'Digicam Config',
  [MAV_CMD.DO_DIGICAM_CONTROL]: 'Digicam Control',
  [MAV_CMD.DO_MOUNT_CONFIGURE]: 'Mount Config',
  [MAV_CMD.DO_MOUNT_CONTROL]: 'Mount Control',
  [MAV_CMD.DO_SET_CAM_TRIGG_DIST]: 'Camera Trigger',
  [MAV_CMD.DO_FENCE_ENABLE]: 'Fence Enable',
  [MAV_CMD.DO_PARACHUTE]: 'Parachute',
  [MAV_CMD.DO_MOTOR_TEST]: 'Motor Test',
  [MAV_CMD.DO_INVERTED_FLIGHT]: 'Inverted Flight',
  [MAV_CMD.DO_GRIPPER]: 'Gripper',
  [MAV_CMD.DO_AUTOTUNE_ENABLE]: 'Autotune',
  [MAV_CMD.SET_YAW_SPEED]: 'Set Yaw Speed',
  [MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL]: 'Camera Interval',
  [MAV_CMD.DO_SET_RESUME_REPEAT_DIST]: 'Resume Repeat Dist',
  [MAV_CMD.DO_SPRAYER]: 'Sprayer',
  [MAV_CMD.DO_SEND_SCRIPT_MESSAGE]: 'Script Message',
  [MAV_CMD.DO_AUX_FUNCTION]: 'Aux Function',
  [MAV_CMD.DO_GUIDED_LIMITS]: 'Guided Limits',
  [MAV_CMD.DO_ENGINE_CONTROL]: 'Engine Control',
  [MAV_CMD.DO_SET_MISSION_CURRENT]: 'Set Mission Item',
  [MAV_CMD.SET_CAMERA_MODE]: 'Camera Mode',
  [MAV_CMD.SET_CAMERA_ZOOM]: 'Camera Zoom',
  [MAV_CMD.SET_CAMERA_FOCUS]: 'Camera Focus',
  [MAV_CMD.SET_CAMERA_SOURCE]: 'Camera Source',
  [MAV_CMD.JUMP_TAG]: 'Jump Tag',
  [MAV_CMD.DO_JUMP_TAG]: 'Do Jump Tag',
  [MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW]: 'Gimbal Pitch/Yaw',
  [MAV_CMD.IMAGE_START_CAPTURE]: 'Start Capture',
  [MAV_CMD.IMAGE_STOP_CAPTURE]: 'Stop Capture',
  [MAV_CMD.VIDEO_START_CAPTURE]: 'Start Video',
  [MAV_CMD.VIDEO_STOP_CAPTURE]: 'Stop Video',
  [MAV_CMD.DO_VTOL_TRANSITION]: 'VTOL Transition',
  [MAV_CMD.DO_WINCH]: 'Winch',
};

// Command descriptions for tooltips
export const COMMAND_DESCRIPTIONS: Record<number, string> = {
  // Navigation
  [MAV_CMD.NAV_WAYPOINT]: 'Navigate to waypoint with optional loiter time',
  [MAV_CMD.NAV_LOITER_UNLIM]: 'Loiter at location indefinitely',
  [MAV_CMD.NAV_LOITER_TURNS]: 'Loiter N turns around location',
  [MAV_CMD.NAV_LOITER_TIME]: 'Loiter at location for X seconds',
  [MAV_CMD.NAV_RETURN_TO_LAUNCH]: 'Return to launch/home location',
  [MAV_CMD.NAV_LAND]: 'Land at specified location',
  [MAV_CMD.NAV_TAKEOFF]: 'Takeoff to specified altitude',
  [MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT]: 'Continue to next WP while changing altitude',
  [MAV_CMD.NAV_LOITER_TO_ALT]: 'Loiter and climb/descend to altitude',
  [MAV_CMD.NAV_ARC_WAYPOINT]: 'Fly a curved arc path through waypoint',
  [MAV_CMD.NAV_SPLINE_WAYPOINT]: 'Spline waypoint for smooth curves',
  [MAV_CMD.NAV_ALTITUDE_WAIT]: 'Wait at altitude until climb rate met',
  [MAV_CMD.NAV_VTOL_TAKEOFF]: 'VTOL takeoff to altitude',
  [MAV_CMD.NAV_VTOL_LAND]: 'VTOL land at location',
  [MAV_CMD.NAV_GUIDED_ENABLE]: 'Enable/disable guided mode from companion',
  [MAV_CMD.NAV_DELAY]: 'Wait for specified time or until time of day',
  [MAV_CMD.NAV_PAYLOAD_PLACE]: 'Descend and release payload',
  [MAV_CMD.NAV_SCRIPT_TIME]: 'Run Lua script for specified time',
  [MAV_CMD.NAV_ATTITUDE_TIME]: 'Hold attitude for specified time',

  // Conditions
  [MAV_CMD.CONDITION_DELAY]: 'Wait for seconds before next command',
  [MAV_CMD.CONDITION_CHANGE_ALT]: 'Ascend/descend to altitude then continue',
  [MAV_CMD.CONDITION_DISTANCE]: 'Wait until within distance of next waypoint',
  [MAV_CMD.CONDITION_YAW]: 'Reach a target heading before next command',

  // DO commands
  [MAV_CMD.DO_SET_MODE]: 'Set flight mode',
  [MAV_CMD.DO_JUMP]: 'Jump to waypoint N and repeat X times',
  [MAV_CMD.DO_CHANGE_SPEED]: 'Change target speed',
  [MAV_CMD.DO_SET_HOME]: 'Set new home position',
  [MAV_CMD.DO_SET_PARAMETER]: 'Set a flight controller parameter',
  [MAV_CMD.DO_SET_RELAY]: 'Set relay on/off',
  [MAV_CMD.DO_REPEAT_RELAY]: 'Cycle relay on/off N times',
  [MAV_CMD.DO_SET_SERVO]: 'Set servo to PWM value',
  [MAV_CMD.DO_REPEAT_SERVO]: 'Cycle servo between PWM values',
  [MAV_CMD.DO_FLIGHTTERMINATION]: 'Terminate flight immediately',
  [MAV_CMD.DO_CHANGE_ALTITUDE]: 'Change altitude at specified rate',
  [MAV_CMD.DO_LAND_START]: 'Marker for start of landing sequence',
  [MAV_CMD.DO_RALLY_LAND]: 'Fly to rally point and land',
  [MAV_CMD.DO_GO_AROUND]: 'Abort landing and go around',
  [MAV_CMD.DO_REPOSITION]: 'Reposition vehicle to location',
  [MAV_CMD.DO_PAUSE_CONTINUE]: 'Pause or resume current mission',
  [MAV_CMD.DO_SET_REVERSE]: 'Set moving direction forward/reverse',
  [MAV_CMD.DO_SET_ROI_LOCATION]: 'Point camera at location',
  [MAV_CMD.DO_SET_ROI_WPNEXT_OFFSET]: 'Point camera at next waypoint',
  [MAV_CMD.DO_SET_ROI_NONE]: 'Cancel ROI - stop tracking',
  [MAV_CMD.DO_SET_ROI_SYSID]: 'Track another vehicle by system ID',
  [MAV_CMD.DO_CONTROL_VIDEO]: 'Control onboard video system',
  [MAV_CMD.DO_SET_ROI]: 'Set region of interest for camera',
  [MAV_CMD.DO_DIGICAM_CONFIGURE]: 'Configure digital camera settings',
  [MAV_CMD.DO_DIGICAM_CONTROL]: 'Trigger camera shutter',
  [MAV_CMD.DO_MOUNT_CONFIGURE]: 'Configure gimbal mount mode',
  [MAV_CMD.DO_MOUNT_CONTROL]: 'Control gimbal angles',
  [MAV_CMD.DO_SET_CAM_TRIGG_DIST]: 'Trigger camera at distance intervals',
  [MAV_CMD.DO_FENCE_ENABLE]: 'Enable/disable geofence',
  [MAV_CMD.DO_PARACHUTE]: 'Deploy parachute or enable auto-deploy',
  [MAV_CMD.DO_MOTOR_TEST]: 'Test individual motor',
  [MAV_CMD.DO_INVERTED_FLIGHT]: 'Enable/disable inverted flight',
  [MAV_CMD.DO_GRIPPER]: 'Open/close gripper',
  [MAV_CMD.DO_AUTOTUNE_ENABLE]: 'Enable/disable autotune',
  [MAV_CMD.SET_YAW_SPEED]: 'Set yaw angle and speed for rover',
  [MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL]: 'Trigger camera at time intervals',
  [MAV_CMD.DO_SET_RESUME_REPEAT_DIST]: 'Set distance for mission resume after RTL',
  [MAV_CMD.DO_SPRAYER]: 'Enable/disable crop sprayer',
  [MAV_CMD.DO_SEND_SCRIPT_MESSAGE]: 'Send message to onboard Lua script',
  [MAV_CMD.DO_AUX_FUNCTION]: 'Trigger auxiliary function switch',
  [MAV_CMD.DO_GUIDED_LIMITS]: 'Set limits for guided mode',
  [MAV_CMD.DO_ENGINE_CONTROL]: 'Start/stop engine',
  [MAV_CMD.DO_SET_MISSION_CURRENT]: 'Jump to mission item without counting',
  [MAV_CMD.SET_CAMERA_MODE]: 'Set camera operating mode',
  [MAV_CMD.SET_CAMERA_ZOOM]: 'Set camera zoom level',
  [MAV_CMD.SET_CAMERA_FOCUS]: 'Set camera focus',
  [MAV_CMD.SET_CAMERA_SOURCE]: 'Set camera video source',
  [MAV_CMD.JUMP_TAG]: 'Mark a tag label for DO_JUMP_TAG',
  [MAV_CMD.DO_JUMP_TAG]: 'Jump to tagged mission item',
  [MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW]: 'Set gimbal pitch and yaw angles',
  [MAV_CMD.IMAGE_START_CAPTURE]: 'Start taking photos at interval',
  [MAV_CMD.IMAGE_STOP_CAPTURE]: 'Stop taking photos',
  [MAV_CMD.VIDEO_START_CAPTURE]: 'Start recording video',
  [MAV_CMD.VIDEO_STOP_CAPTURE]: 'Stop recording video',
  [MAV_CMD.DO_VTOL_TRANSITION]: 'Transition between VTOL and fixed-wing',
  [MAV_CMD.DO_WINCH]: 'Control winch motor',
};

// Commands that have location (lat/lon/alt)
export const COMMANDS_WITH_LOCATION: Set<number> = new Set([
  MAV_CMD.NAV_WAYPOINT,
  MAV_CMD.NAV_LOITER_UNLIM,
  MAV_CMD.NAV_LOITER_TURNS,
  MAV_CMD.NAV_LOITER_TIME,
  MAV_CMD.NAV_LAND,
  MAV_CMD.NAV_TAKEOFF,
  MAV_CMD.NAV_LAND_LOCAL,
  MAV_CMD.NAV_TAKEOFF_LOCAL,
  MAV_CMD.NAV_LOITER_TO_ALT,
  MAV_CMD.NAV_ARC_WAYPOINT,
  MAV_CMD.NAV_SPLINE_WAYPOINT,
  MAV_CMD.NAV_VTOL_TAKEOFF,
  MAV_CMD.NAV_VTOL_LAND,
  MAV_CMD.NAV_PAYLOAD_PLACE,
  MAV_CMD.DO_SET_ROI,
  MAV_CMD.DO_SET_ROI_LOCATION,
  MAV_CMD.DO_SET_HOME,
  MAV_CMD.DO_LAND_START,
  MAV_CMD.DO_REPOSITION,
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
 * Create a takeoff waypoint
 * Takeoff at specified location to target altitude
 * @param seq Sequence number
 * @param latitude Launch latitude
 * @param longitude Launch longitude
 * @param altitude Target altitude to climb to (meters, relative to home)
 * @param pitch Minimum pitch during takeoff (degrees, 0 = straight up)
 */
export function createTakeoffWaypoint(
  seq: number,
  latitude: number,
  longitude: number,
  altitude: number = 50,
  pitch: number = 15,
): MissionItem {
  return {
    seq,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_TAKEOFF,
    current: false,
    autocontinue: true,
    param1: pitch,   // Minimum pitch (degrees)
    param2: 0,       // Empty
    param3: 0,       // Empty
    param4: NaN,     // Yaw (NaN = keep current)
    latitude,
    longitude,
    altitude,
  };
}

/**
 * Get human-readable name for a command
 */
export function getCommandName(command: number): string {
  return COMMAND_NAMES[command] || `Unknown CMD ${command}`;
}

/**
 * Check if a command has location (lat/lon/alt)
 */
export function commandHasLocation(command: number): boolean {
  return COMMANDS_WITH_LOCATION.has(command);
}

/**
 * Check if a command is a navigation command (vehicle movement)
 * Navigation commands are "parent" items in the mission list.
 * DO_* and CONDITION_* commands are "children" that execute at the preceding parent.
 * MAVLink spec: NAV commands are in range 16-95.
 */
export function isNavigationCommand(command: number): boolean {
  return command >= 16 && command <= 95;
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
    total += calculateDistance(prev!.latitude, prev!.longitude, curr!.latitude, curr!.longitude);
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
