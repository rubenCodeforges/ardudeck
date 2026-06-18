/**
 * Mission Builder - Convert SurveyResult into MissionItem[] for insertion.
 *
 * Camera/aircraft mode emits: NAV_TAKEOFF → NAV_WAYPOINT(1st) → DO_CHANGE_SPEED
 * → DO_SET_CAM_TRIGG_DIST → NAV_WAYPOINT× → cam-off → NAV_RETURN_TO_LAUNCH.
 *
 * Ground / manual mode (mower, rover) emits: NAV_WAYPOINT(1st) → DO_CHANGE_SPEED
 * → optional DO_SET_REVERSE between line pairs → NAV_WAYPOINT× →
 * NAV_RETURN_TO_LAUNCH. No takeoff, no camera trigger.
 *
 * DO_CHANGE_SPEED / DO_SET_CAM_TRIGG_DIST follow the first waypoint because
 * ArduPilot does not execute DO_* commands placed before the first
 * NAV_WAYPOINT (issue #83).
 *
 * Reverse-alternating pattern: rover drives forward on odd lines and reverses
 * on even lines (no U-turns). The waypoint geometry is the same boustrophedon
 * layout; we just insert DO_SET_REVERSE between line endpoints to flip
 * direction without a 180° turn. Each "line" is a pair of waypoints (start,
 * end), so waypoints come in groups of two — toggle reverse after every pair.
 */
import type { MissionItem } from '../../../shared/mission-types';
import { MAV_CMD, MAV_FRAME } from '../../../shared/mission-types';
import type { FirmwareSource } from '../../../shared/firmware-types';
import type { SurveyConfig, SurveyResult } from './survey-types';

/**
 * Convert survey result into a complete mission ready for upload.
 *
 * `firmware` only changes vendor-specific param conventions, never the command
 * stream itself: all emitted MAV_CMDs (NAV_TAKEOFF, NAV_WAYPOINT,
 * DO_CHANGE_SPEED, DO_SET_CAM_TRIGG_DIST, NAV_RETURN_TO_LAUNCH) are standard and
 * accepted by both ArduPilot and PX4. The single divergence is DO_CHANGE_SPEED
 * speed-type (param1): ArduPilot uses airspeed (0) for aircraft, but PX4 only
 * acts on groundspeed (1) for that command, so we send 1 for PX4 aircraft.
 * Omitting `firmware` (or any non-px4 value) preserves ArduPilot behavior.
 */
export function surveyToMissionItems(
  result: SurveyResult,
  config: SurveyConfig,
  firmware?: FirmwareSource,
): MissionItem[] {
  if (result.waypoints.length === 0) return [];

  const items: MissionItem[] = [];
  let seq = 0;

  const isManual = !!(config.camera.manualCorridorWidth && config.camera.manualCorridorWidth > 0);
  const isReverseAlt = isManual && config.groundPattern === 'reverse-alternating';
  const isPx4 = firmware === 'px4';

  // Camera-off-outside: trigger only along the scan lines and switch the camera
  // off during the turn-arounds. Grid/crosshatch emit waypoints as line
  // start/end PAIRS, so an even index is a line entry (camera on) and the
  // following odd index is the exit (camera off). Only meaningful for camera
  // flights on those patterns.
  const bracketCamera =
    !isManual &&
    !!config.cameraOffOutside &&
    (config.pattern === 'grid' || config.pattern === 'crosshatch');
  const triggerDist = result.stats.photoSpacing > 0 ? result.stats.photoSpacing : 10;
  const camTrigg = (dist: number): MissionItem => ({
    seq: 0, // re-stamped below via seq++
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.DO_SET_CAM_TRIGG_DIST,
    current: false,
    autocontinue: true,
    param1: dist,
    param2: 0,
    param3: dist > 0 ? 1 : 0, // trigger once immediately when arming
    param4: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  // 0. NAV_TAKEOFF — aircraft only. Rovers/mowers skip this.
  if (!isManual) {
    items.push({
      seq: seq++,
      frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
      command: MAV_CMD.NAV_TAKEOFF,
      current: false,
      autocontinue: true,
      param1: 15,               // Minimum pitch (degrees)
      param2: 0,
      param3: 0,
      param4: 0,                // Yaw (0 = keep current)
      latitude: 0,
      longitude: 0,
      altitude: config.altitude,
    });
  }

  // DO_CHANGE_SPEED / DO_SET_CAM_TRIGG_DIST are emitted after the first
  // waypoint (in the loop below): ArduPilot ignores DO_* before the first
  // NAV_WAYPOINT, so they'd never take effect otherwise. See issue #83.

  // 3. NAV_WAYPOINT for each flight path point. In reverse-alternating mode
  // we insert DO_SET_REVERSE between line pairs (waypoints come as start/end
  // pairs from grid-generator, so every 2 waypoints = one line). Lines 0,2,4
  // go forward; lines 1,3,5 go reverse.
  const frame = isManual
    ? MAV_FRAME.GLOBAL_RELATIVE_ALT  // rover ignores altitude anyway
    : config.altitudeReference === 'terrain'
      ? MAV_FRAME.GLOBAL_TERRAIN_ALT
      : config.altitudeReference === 'asl'
        ? MAV_FRAME.GLOBAL
        : MAV_FRAME.GLOBAL_RELATIVE_ALT;

  for (let i = 0; i < result.waypoints.length; i++) {
    const wp = result.waypoints[i]!;
    // Before the start of each new line (other than the first), insert a
    // DO_SET_REVERSE that flips direction. lineIndex = floor(i / 2). Toggle
    // happens when i is the first waypoint of a new even-indexed (1, 3, 5…)
    // line, i.e. i % 2 === 0 && i > 0.
    if (isReverseAlt && i > 0 && i % 2 === 0) {
      const lineIdx = i / 2;
      const reverseFlag = lineIdx % 2 === 1 ? 1 : 0; // odd lines reverse, even forward
      items.push({
        seq: seq++,
        frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
        command: MAV_CMD.DO_SET_REVERSE,
        current: false,
        autocontinue: true,
        param1: reverseFlag,    // 0 = forward, 1 = reverse
        param2: 0,
        param3: 0,
        param4: 0,
        latitude: 0,
        longitude: 0,
        altitude: 0,
      });
    }

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
      // Per-waypoint altitude when the pattern flies at more than one height
      // (e.g. crosshatch second-pass offset); otherwise the flat config value.
      altitude: isManual ? 0 : (result.altitudes?.[i] ?? config.altitude),
    });

    if (i === 0) {
      // DO_CHANGE_SPEED — applies to both aircraft (airspeed) and rovers (ground speed).
      items.push({
        seq: seq++,
        frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
        command: MAV_CMD.DO_CHANGE_SPEED,
        current: false,
        autocontinue: true,
        // Speed type: 0 = airspeed (aircraft), 1 = ground speed (rover).
        // ArduRover ignores type 0 and falls back to ground speed, so either works
        // for rovers in practice, but we set it correctly for clarity.
        // PX4 aircraft only honor ground speed (1) for DO_CHANGE_SPEED, so use 1
        // there too; ArduPilot aircraft keep airspeed (0) unchanged.
        param1: isManual || isPx4 ? 1 : 0,
        param2: config.speed,
        param3: -1,               // Throttle: -1 = no change
        param4: 0,
        latitude: 0,
        longitude: 0,
        altitude: 0,
      });

      // DO_SET_CAM_TRIGG_DIST — aircraft only. Mower has no camera to trigger.
      // Skipped when bracketing per-line (the brackets below own the trigger).
      if (!isManual && !bracketCamera) {
        items.push({ ...camTrigg(triggerDist), seq: seq++ });
      }
    }

    // Per-line camera bracketing: arm at each line entry (even index), disarm
    // at each line exit (odd index), so no photos fire during the turns.
    if (bracketCamera) {
      items.push({ ...camTrigg(i % 2 === 0 ? triggerDist : 0), seq: seq++ });
    }
  }

  // 3b. If we ended in reverse, flip back to forward so the rover can drive
  // home normally for any return-to-launch behavior.
  if (isReverseAlt) {
    const totalLines = Math.ceil(result.waypoints.length / 2);
    if (totalLines % 2 === 0) {
      // Last line was reverse — restore forward.
      items.push({
        seq: seq++,
        frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
        command: MAV_CMD.DO_SET_REVERSE,
        current: false,
        autocontinue: true,
        param1: 0,
        param2: 0,
        param3: 0,
        param4: 0,
        latitude: 0,
        longitude: 0,
        altitude: 0,
      });
    }
  }

  // 4. DO_SET_CAM_TRIGG_DIST — disable trigger. Aircraft only.
  if (!isManual) {
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
  }

  // 5. NAV_RETURN_TO_LAUNCH — fly/drive home after survey.
  items.push({
    seq: seq++,
    frame: MAV_FRAME.GLOBAL_RELATIVE_ALT,
    command: MAV_CMD.NAV_RETURN_TO_LAUNCH,
    current: false,
    autocontinue: true,
    param1: 0,
    param2: 0,
    param3: 0,
    param4: 0,
    latitude: 0,
    longitude: 0,
    altitude: 0,
  });

  return items;
}
