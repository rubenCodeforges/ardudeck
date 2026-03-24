/**
 * Mission Builder - Convert SurveyResult into MissionItem[] for insertion.
 * Generates DO_CHANGE_SPEED, DO_SET_CAM_TRIGG_DIST, NAV_WAYPOINT, and cam-off commands.
 */
import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../../shared/mission-types';
import type { SurveyConfig, SurveyResult } from './survey-types';

/**
 * Convert survey result into mission items ready for insertion.
 * Items are numbered starting from seq=0; the caller should renumber
 * based on where they're inserted in the existing mission.
 */
export function surveyToMissionItems(
  result: SurveyResult,
  config: SurveyConfig,
): MissionItem[] {
  if (result.waypoints.length === 0) return [];

  const items: MissionItem[] = [];
  let seq = 0;

  // 1. DO_CHANGE_SPEED - set survey speed
  items.push({
    seq: seq++,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.DO_CHANGE_SPEED,
    current: false,
    autocontinue: true,
    param1: 0,                // Speed type: 0 = airspeed
    param2: config.speed,     // Speed in m/s
    param3: -1,               // Throttle: -1 = no change
    param4: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  // 2. DO_SET_CAM_TRIGG_DIST - enable distance-based camera trigger
  const triggerDist = result.stats.photoSpacing > 0 ? result.stats.photoSpacing : 10;
  items.push({
    seq: seq++,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.DO_SET_CAM_TRIGG_DIST,
    current: false,
    autocontinue: true,
    param1: triggerDist,      // Trigger distance in meters
    param2: 0,
    param3: 1,                // Trigger once immediately
    param4: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  // 3. NAV_WAYPOINT for each flight path point
  const frame = config.altitudeReference === 'terrain'
    ? MAV_FRAME.GLOBAL_TERRAIN_ALT
    : config.altitudeReference === 'asl'
      ? MAV_FRAME.GLOBAL
      : MAV_FRAME.GLOBAL_RELATIVE_ALT;

  for (const wp of result.waypoints) {
    items.push({
      seq: seq++,
      frame,
      command: MAV_CMD.NAV_WAYPOINT,
      current: false,
      autocontinue: true,
      param1: 0,              // Hold time: 0 = pass through
      param2: 0,              // Acceptance radius
      param3: 0,              // Pass by distance
      param4: 0,              // Yaw angle: 0 = auto
      latitude: wp.lat,
      longitude: wp.lng,
      altitude: config.altitude,
    });
  }

  // 4. DO_SET_CAM_TRIGG_DIST - disable camera trigger
  items.push({
    seq: seq++,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.DO_SET_CAM_TRIGG_DIST,
    current: false,
    autocontinue: true,
    param1: 0,                // Distance 0 = disable
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  return items;
}
