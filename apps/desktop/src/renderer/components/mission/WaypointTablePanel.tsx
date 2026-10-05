import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import {
  Camera, Clock, Gauge, Crosshair, RotateCw, RotateCcw,
  Repeat, Wrench, Ruler, ArrowUpDown, ChevronRight, MoreHorizontal,
  RefreshCw, Pencil, Upload, Save, Play, Copy, Check,
  type LucideIcon,
} from 'lucide-react';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { useCargoEnabled, MISSION_LIBRARY_CARGO_SLUG } from '../../modules/capabilities';
import { type Group, isSurveyGroup, type SurveyGroup, GROUP_COLOR_PALETTE, isAssignedToVehicle } from '../../../shared/mission-group-types';
import { isSurveyGroupStale } from '../survey/survey-group-signature';
import { regenerateSurveyGroup } from '../survey/survey-regen';
import { hasReplayData } from './plan-replay';
import { selectionTouchesGroups } from './bulk-edit';
import { useReplayStore } from '../../stores/replay-store';
import { distanceLatLng } from '../survey/geo-math';
import { calculateGSD } from '../survey/survey-stats';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore, type MissionFirmware } from '../../stores/settings-store';
import { effectiveMissionFirmware } from '../../utils/mission-firmware';
import {
  COMMAND_NAMES,
  missionCommandLabel,
  missionCommandDescription,
  MAV_CMD,
  commandHasLocation,
  hasValidCoordinates,
  isNavigationCommand,
  computeGroupWaypointNumbers,
  type MissionItem
} from '../../../shared/mission-types';
import { FenceListPanel } from '../geofence/FenceListPanel';
import { RallyListPanel } from '../rally/RallyListPanel';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useFleetVehicles } from '../../hooks/useFleet';
import { useVehicleAppearanceStore, resolveVehicleColor } from '../../stores/vehicle-appearance-store';
import { computeItemColors, SEGMENT_COLORS } from '../../utils/mission-segment-colors';
import { validateMission } from '../../../shared/mission-validation';
import { MissionValidationBadge } from './MissionValidationBadge';
import { midMissionReturns, flownSeparately, flightBoundaries } from './mission-end';
import { predictFlownPath, turnRadiusFor, coverageGaps, type CornerCut } from './flown-path';
import { planSpeed } from '../survey/generators/turn-radius';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  formatAltitudeFromMeters,
  formatDistanceFromMeters,
  formatSpeedFromMetersPerSecond,
  formatVerticalSpeedFromMetersPerSecond,
  UNIT_LABELS,
  type AltitudeUnit,
  type DistanceUnit,
  type SpeedUnit,
  type VerticalSpeedUnit,
} from '../../../shared/user-units.js';
import {
  waypointDisplayBound,
  waypointDisplayStep,
  waypointDisplayValue,
  waypointNativeValue,
  type WaypointUnitContext,
} from './waypoint-unit-format';
import { computeRenderableIndices, renderableIndexOfSeq, estimateRowHeight } from './waypoint-list-window';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useVehicleProfileStore } from '../../stores/vehicle-profile-store';
import { allowedMissionCommands } from '../../../shared/vehicle-profile';

// Helper to get GPS state without subscribing (avoids re-renders)
function getGpsState() {
  const gps = useTelemetryStore.getState().gps;
  return {
    hasGpsFix: gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0,
    lat: gps.lat,
    lon: gps.lon,
  };
}

// Child command icon mapping: returns a Lucide icon for non-nav commands
function getChildCommandIcon(cmd: number, wp: MissionItem): LucideIcon | null {
  switch (cmd) {
    // Yaw / Turn
    case MAV_CMD.CONDITION_YAW:
      return wp.param3 < 0 ? RotateCcw : RotateCw;

    // Wait / Delay
    case MAV_CMD.CONDITION_DELAY:
    case MAV_CMD.NAV_DELAY:
      return Clock;

    // Camera / Photo / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
    case MAV_CMD.DO_CONTROL_VIDEO:
    case MAV_CMD.IMAGE_START_CAPTURE:
    case MAV_CMD.IMAGE_STOP_CAPTURE:
    case MAV_CMD.VIDEO_START_CAPTURE:
    case MAV_CMD.VIDEO_STOP_CAPTURE:
    case MAV_CMD.SET_CAMERA_ZOOM:
    case MAV_CMD.SET_CAMERA_FOCUS:
    case MAV_CMD.SET_CAMERA_SOURCE:
    case MAV_CMD.DO_MOUNT_CONTROL:
    case MAV_CMD.DO_MOUNT_CONFIGURE:
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return Camera;

    // Speed
    case MAV_CMD.DO_CHANGE_SPEED:
      return Gauge;

    // ROI
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
    case MAV_CMD.DO_SET_ROI_NONE:
      return Crosshair;

    // Jump
    case MAV_CMD.DO_JUMP:
    case MAV_CMD.DO_JUMP_TAG:
    case MAV_CMD.JUMP_TAG:
      return Repeat;

    // Servo / Relay
    case MAV_CMD.DO_SET_SERVO:
    case MAV_CMD.DO_REPEAT_SERVO:
    case MAV_CMD.DO_SET_RELAY:
    case MAV_CMD.DO_REPEAT_RELAY:
      return Wrench;

    // Altitude change
    case MAV_CMD.CONDITION_CHANGE_ALT:
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return ArrowUpDown;

    // Distance
    case MAV_CMD.CONDITION_DISTANCE:
      return Ruler;

    default:
      return null;
  }
}

// Color by command category for child icons
function getChildIconColor(cmd: number): string {
  switch (cmd) {
    // Camera / Gimbal - amber
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
    case MAV_CMD.DO_DIGICAM_CONTROL:
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
    case MAV_CMD.DO_CONTROL_VIDEO:
    case MAV_CMD.IMAGE_START_CAPTURE:
    case MAV_CMD.IMAGE_STOP_CAPTURE:
    case MAV_CMD.VIDEO_START_CAPTURE:
    case MAV_CMD.VIDEO_STOP_CAPTURE:
    case MAV_CMD.SET_CAMERA_ZOOM:
    case MAV_CMD.SET_CAMERA_FOCUS:
    case MAV_CMD.SET_CAMERA_SOURCE:
    case MAV_CMD.DO_MOUNT_CONTROL:
    case MAV_CMD.DO_MOUNT_CONFIGURE:
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return '#fbbf24';

    // Yaw / Turn - blue
    case MAV_CMD.CONDITION_YAW:
      return '#60a5fa';

    // Wait / Delay - gray
    case MAV_CMD.CONDITION_DELAY:
    case MAV_CMD.NAV_DELAY:
      return '#9ca3af';

    // Speed - cyan
    case MAV_CMD.DO_CHANGE_SPEED:
      return '#22d3ee';

    // ROI - pink
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
    case MAV_CMD.DO_SET_ROI_NONE:
      return '#f472b6';

    // Jump - orange
    case MAV_CMD.DO_JUMP:
    case MAV_CMD.DO_JUMP_TAG:
    case MAV_CMD.JUMP_TAG:
      return '#fb923c';

    // Default gray for servo/relay/alt/distance/other
    default:
      return '#9ca3af';
  }
}

// Grouped commands for the dropdown
interface CommandOption {
  value: number;
  labelKey: string;
  descKey: string;
}
interface CommandGroup {
  groupKey: string;
  commands: CommandOption[];
}
const COMMAND_GROUPS: CommandGroup[] = [
  {
    groupKey: 'mission:waypointTable.cmdGroup.navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, labelKey: 'mission:waypointTable.cmd.takeoff', descKey: 'mission:waypointTable.cmdDesc.launchAndClimbToAltitude' },
      { value: MAV_CMD.NAV_WAYPOINT, labelKey: 'mission:waypointTable.cmd.waypoint', descKey: 'mission:waypointTable.cmdDesc.flyToThisLocation' },
      { value: MAV_CMD.NAV_SPLINE_WAYPOINT, labelKey: 'mission:waypointTable.cmd.splineWp', descKey: 'mission:waypointTable.cmdDesc.flyThroughSmoothly' },
      { value: MAV_CMD.NAV_ARC_WAYPOINT, labelKey: 'mission:waypointTable.cmd.arcWp', descKey: 'mission:waypointTable.cmdDesc.curvedArcPath' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, labelKey: 'mission:waypointTable.cmd.loiter', descKey: 'mission:waypointTable.cmdDesc.circleUntilCommanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, labelKey: 'mission:waypointTable.cmd.loiterTime', descKey: 'mission:waypointTable.cmdDesc.circleForSetDuration' },
      { value: MAV_CMD.NAV_LOITER_TURNS, labelKey: 'mission:waypointTable.cmd.loiterTurns', descKey: 'mission:waypointTable.cmdDesc.circleNTimes' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, labelKey: 'mission:waypointTable.cmd.loiterToAlt', descKey: 'mission:waypointTable.cmdDesc.loiterAndChangeAlt' },
      { value: MAV_CMD.NAV_ALTITUDE_WAIT, labelKey: 'mission:waypointTable.cmd.altitudeWait', descKey: 'mission:waypointTable.cmdDesc.waitAtAltitudePlane' },
      { value: MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT, labelKey: 'mission:waypointTable.cmd.continueAlt', descKey: 'mission:waypointTable.cmdDesc.continueAndChangeAlt' },
      { value: MAV_CMD.NAV_LAND, labelKey: 'mission:waypointTable.cmd.land', descKey: 'mission:waypointTable.cmdDesc.landAtThisLocation' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, labelKey: 'mission:waypointTable.cmd.returnHome', descKey: 'mission:waypointTable.cmdDesc.flyBackToLaunch' },
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, labelKey: 'mission:waypointTable.cmd.vtolTakeoff', descKey: 'mission:waypointTable.cmdDesc.vtolVerticalTakeoff' },
      { value: MAV_CMD.NAV_VTOL_LAND, labelKey: 'mission:waypointTable.cmd.vtolLand', descKey: 'mission:waypointTable.cmdDesc.vtolVerticalLanding' },
      { value: MAV_CMD.NAV_DELAY, labelKey: 'mission:waypointTable.cmd.wait', descKey: 'mission:waypointTable.cmdDesc.pauseMissionForTime' },
      { value: MAV_CMD.NAV_PAYLOAD_PLACE, labelKey: 'mission:waypointTable.cmd.payloadPlace', descKey: 'mission:waypointTable.cmdDesc.descendAndRelease' },
      { value: MAV_CMD.NAV_GUIDED_ENABLE, labelKey: 'mission:waypointTable.cmd.guidedEnable', descKey: 'mission:waypointTable.cmdDesc.enableGuidedMode' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.conditions',
    commands: [
      { value: MAV_CMD.CONDITION_DELAY, labelKey: 'mission:waypointTable.cmd.delay', descKey: 'mission:waypointTable.cmdDesc.waitSeconds' },
      { value: MAV_CMD.CONDITION_DISTANCE, labelKey: 'mission:waypointTable.cmd.distance', descKey: 'mission:waypointTable.cmdDesc.waitUntilNearNextWp' },
      { value: MAV_CMD.CONDITION_CHANGE_ALT, labelKey: 'mission:waypointTable.cmd.changeAlt', descKey: 'mission:waypointTable.cmdDesc.reachAltThenContinue' },
      { value: MAV_CMD.CONDITION_YAW, labelKey: 'mission:waypointTable.cmd.yaw', descKey: 'mission:waypointTable.cmdDesc.reachHeadingThenContinue' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.cameraGimbal',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, labelKey: 'mission:waypointTable.cmd.cameraTrigger', descKey: 'mission:waypointTable.cmdDesc.triggerAtDistance' },
      { value: MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL, labelKey: 'mission:waypointTable.cmd.cameraInterval', descKey: 'mission:waypointTable.cmdDesc.triggerAtTimeInterval' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, labelKey: 'mission:waypointTable.cmd.digicamControl', descKey: 'mission:waypointTable.cmdDesc.takeAPhoto' },
      { value: MAV_CMD.DO_DIGICAM_CONFIGURE, labelKey: 'mission:waypointTable.cmd.digicamConfig', descKey: 'mission:waypointTable.cmdDesc.configureCamera' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startCapture', descKey: 'mission:waypointTable.cmdDesc.startTakingPhotos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopCapture', descKey: 'mission:waypointTable.cmdDesc.stopTakingPhotos' },
      { value: MAV_CMD.VIDEO_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startVideo', descKey: 'mission:waypointTable.cmdDesc.startRecording' },
      { value: MAV_CMD.VIDEO_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopVideo', descKey: 'mission:waypointTable.cmdDesc.stopRecording' },
      { value: MAV_CMD.SET_CAMERA_ZOOM, labelKey: 'mission:waypointTable.cmd.cameraZoom', descKey: 'mission:waypointTable.cmdDesc.setZoomLevel' },
      { value: MAV_CMD.SET_CAMERA_FOCUS, labelKey: 'mission:waypointTable.cmd.cameraFocus', descKey: 'mission:waypointTable.cmdDesc.setFocus' },
      { value: MAV_CMD.SET_CAMERA_SOURCE, labelKey: 'mission:waypointTable.cmd.cameraSource', descKey: 'mission:waypointTable.cmdDesc.setVideoSource' },
      { value: MAV_CMD.DO_SET_ROI, labelKey: 'mission:waypointTable.cmd.setRoi', descKey: 'mission:waypointTable.cmdDesc.pointCameraAtLocation' },
      { value: MAV_CMD.DO_SET_ROI_LOCATION, labelKey: 'mission:waypointTable.cmd.roiLocation', descKey: 'mission:waypointTable.cmdDesc.pointCameraAtGps' },
      { value: MAV_CMD.DO_SET_ROI_NONE, labelKey: 'mission:waypointTable.cmd.roiNone', descKey: 'mission:waypointTable.cmdDesc.stopCameraTracking' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, labelKey: 'mission:waypointTable.cmd.mountControl', descKey: 'mission:waypointTable.cmdDesc.setGimbalAngles' },
      { value: MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW, labelKey: 'mission:waypointTable.cmd.gimbalPitchYaw', descKey: 'mission:waypointTable.cmdDesc.setGimbalPitchAndYaw' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, labelKey: 'mission:waypointTable.cmd.setSpeed', descKey: 'mission:waypointTable.cmdDesc.changeFlightSpeed' },
      { value: MAV_CMD.DO_SET_HOME, labelKey: 'mission:waypointTable.cmd.setHome', descKey: 'mission:waypointTable.cmdDesc.setNewHomePosition' },
      { value: MAV_CMD.DO_JUMP, labelKey: 'mission:waypointTable.cmd.jump', descKey: 'mission:waypointTable.cmdDesc.jumpToWpAndRepeat' },
      { value: MAV_CMD.JUMP_TAG, labelKey: 'mission:waypointTable.cmd.jumpTag', descKey: 'mission:waypointTable.cmdDesc.markATagLabel' },
      { value: MAV_CMD.DO_JUMP_TAG, labelKey: 'mission:waypointTable.cmd.doJumpTag', descKey: 'mission:waypointTable.cmdDesc.jumpToTagLabel' },
      { value: MAV_CMD.DO_SET_SERVO, labelKey: 'mission:waypointTable.cmd.setServo', descKey: 'mission:waypointTable.cmdDesc.setServoPwm' },
      { value: MAV_CMD.DO_REPEAT_SERVO, labelKey: 'mission:waypointTable.cmd.repeatServo', descKey: 'mission:waypointTable.cmdDesc.cycleServoOutput' },
      { value: MAV_CMD.DO_SET_RELAY, labelKey: 'mission:waypointTable.cmd.setRelay', descKey: 'mission:waypointTable.cmdDesc.setRelayOnOff' },
      { value: MAV_CMD.DO_REPEAT_RELAY, labelKey: 'mission:waypointTable.cmd.repeatRelay', descKey: 'mission:waypointTable.cmdDesc.cycleRelayOnOff' },
      { value: MAV_CMD.DO_CHANGE_ALTITUDE, labelKey: 'mission:waypointTable.cmd.changeAlt', descKey: 'mission:waypointTable.cmdDesc.changeAltitude' },
      { value: MAV_CMD.DO_FENCE_ENABLE, labelKey: 'mission:waypointTable.cmd.fenceEnable', descKey: 'mission:waypointTable.cmdDesc.enableDisableGeofence' },
      { value: MAV_CMD.DO_PARACHUTE, labelKey: 'mission:waypointTable.cmd.parachute', descKey: 'mission:waypointTable.cmdDesc.deployParachute' },
      { value: MAV_CMD.DO_GRIPPER, labelKey: 'mission:waypointTable.cmd.gripper', descKey: 'mission:waypointTable.cmdDesc.openCloseGripper' },
      { value: MAV_CMD.DO_SPRAYER, labelKey: 'mission:waypointTable.cmd.sprayer', descKey: 'mission:waypointTable.cmdDesc.enableDisableSprayer' },
      { value: MAV_CMD.DO_WINCH, labelKey: 'mission:waypointTable.cmd.winch', descKey: 'mission:waypointTable.cmdDesc.controlWinchMotor' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, labelKey: 'mission:waypointTable.cmd.vtolTransition', descKey: 'mission:waypointTable.cmdDesc.switchVtolFwMode' },
      { value: MAV_CMD.DO_LAND_START, labelKey: 'mission:waypointTable.cmd.landStart', descKey: 'mission:waypointTable.cmdDesc.beginLandingSequence' },
      { value: MAV_CMD.DO_ENGINE_CONTROL, labelKey: 'mission:waypointTable.cmd.engineControl', descKey: 'mission:waypointTable.cmdDesc.startStopEngine' },
      { value: MAV_CMD.DO_AUX_FUNCTION, labelKey: 'mission:waypointTable.cmd.auxFunction', descKey: 'mission:waypointTable.cmdDesc.triggerRcAuxFunction' },
      { value: MAV_CMD.DO_SEND_SCRIPT_MESSAGE, labelKey: 'mission:waypointTable.cmd.scriptMessage', descKey: 'mission:waypointTable.cmdDesc.sendToLuaScript' },
      { value: MAV_CMD.SET_YAW_SPEED, labelKey: 'mission:waypointTable.cmd.yawSpeed', descKey: 'mission:waypointTable.cmdDesc.setYawSpeedRover' },
      { value: MAV_CMD.DO_SET_RESUME_REPEAT_DIST, labelKey: 'mission:waypointTable.cmd.resumeRepeat', descKey: 'mission:waypointTable.cmdDesc.resumeDistAfterRtl' },
      { value: MAV_CMD.DO_AUTOTUNE_ENABLE, labelKey: 'mission:waypointTable.cmd.autotune', descKey: 'mission:waypointTable.cmdDesc.enableDisableAutotune' },
      { value: MAV_CMD.DO_INVERTED_FLIGHT, labelKey: 'mission:waypointTable.cmd.invertedFlight', descKey: 'mission:waypointTable.cmdDesc.invertedFlightOnOff' },
    ],
  },
];

// Simple mode: only the most common commands
const SIMPLE_COMMAND_GROUPS: CommandGroup[] = [
  {
    groupKey: 'mission:waypointTable.cmdGroup.navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, labelKey: 'mission:waypointTable.cmd.takeoff', descKey: 'mission:waypointTable.cmdDesc.launchAndClimbToAltitude' },
      { value: MAV_CMD.NAV_WAYPOINT, labelKey: 'mission:waypointTable.cmd.waypoint', descKey: 'mission:waypointTable.cmdDesc.flyToThisLocation' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, labelKey: 'mission:waypointTable.cmd.loiter', descKey: 'mission:waypointTable.cmdDesc.circleUntilCommanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, labelKey: 'mission:waypointTable.cmd.loiterTime', descKey: 'mission:waypointTable.cmdDesc.circleForSetDuration' },
      { value: MAV_CMD.NAV_LAND, labelKey: 'mission:waypointTable.cmd.land', descKey: 'mission:waypointTable.cmdDesc.landAtThisLocation' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, labelKey: 'mission:waypointTable.cmd.returnHome', descKey: 'mission:waypointTable.cmdDesc.flyBackToLaunch' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.camera',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, labelKey: 'mission:waypointTable.cmd.cameraTrigger', descKey: 'mission:waypointTable.cmdDesc.triggerAtDistance' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, labelKey: 'mission:waypointTable.cmd.takePhoto', descKey: 'mission:waypointTable.cmdDesc.triggerCameraShutter' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startCapture', descKey: 'mission:waypointTable.cmdDesc.startTakingPhotos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopCapture', descKey: 'mission:waypointTable.cmdDesc.stopTakingPhotos' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, labelKey: 'mission:waypointTable.cmd.setSpeed', descKey: 'mission:waypointTable.cmdDesc.changeFlightSpeed' },
      { value: MAV_CMD.DO_JUMP, labelKey: 'mission:waypointTable.cmd.jump', descKey: 'mission:waypointTable.cmdDesc.jumpToWpAndRepeat' },
      { value: MAV_CMD.DO_SET_SERVO, labelKey: 'mission:waypointTable.cmd.setServo', descKey: 'mission:waypointTable.cmdDesc.setServoPwm' },
    ],
  },
];

// iNav MSP: only 8 waypoint types supported
const INAV_COMMAND_GROUPS: CommandGroup[] = [
  {
    groupKey: 'mission:waypointTable.cmdGroup.navigation',
    commands: [
      { value: MAV_CMD.NAV_WAYPOINT, labelKey: 'mission:waypointTable.cmd.waypoint', descKey: 'mission:waypointTable.cmdDesc.flyToLocation' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, labelKey: 'mission:waypointTable.cmd.poshold', descKey: 'mission:waypointTable.cmdDesc.holdPositionIndefinitely' },
      { value: MAV_CMD.NAV_LOITER_TIME, labelKey: 'mission:waypointTable.cmd.posholdTime', descKey: 'mission:waypointTable.cmdDesc.holdPositionForDuration' },
      { value: MAV_CMD.NAV_LAND, labelKey: 'mission:waypointTable.cmd.land', descKey: 'mission:waypointTable.cmdDesc.landAtLocation' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, labelKey: 'mission:waypointTable.cmd.rth', descKey: 'mission:waypointTable.cmdDesc.returnToHome' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.actions',
    commands: [
      { value: MAV_CMD.DO_SET_ROI, labelKey: 'mission:waypointTable.cmd.setPoi', descKey: 'mission:waypointTable.cmdDesc.pointOfInterestForCamera' },
      { value: MAV_CMD.DO_JUMP, labelKey: 'mission:waypointTable.cmd.jump', descKey: 'mission:waypointTable.cmdDesc.jumpToWpAndRepeat' },
      { value: MAV_CMD.CONDITION_YAW, labelKey: 'mission:waypointTable.cmd.setHeading', descKey: 'mission:waypointTable.cmdDesc.lockHeadingDirection' },
    ],
  },
];

/**
 * PX4 mission commands. NOT a subset of the ArduPilot list: PX4 rejects a
 * mission containing commands it does not implement, so offering ArduPilot's
 * full palette on a PX4 vehicle builds a plan that only fails at upload.
 *
 * Curated from PX4FirmwarePlugin::supportedMissionCommands() in the QGC source
 * vendored at qgroundcontrol/, which is the reference GCS for PX4. Notable
 * differences from ArduPilot: no spline or arc waypoints, no NAV_LOITER_TURNS,
 * no ALTITUDE_WAIT, no relay/parachute/aux-function, DO_SET_ROI_* instead of
 * the legacy DO_SET_ROI, and DO_SET_ACTUATOR alongside DO_SET_SERVO.
 */
const PX4_COMMAND_GROUPS: CommandGroup[] = [
  {
    groupKey: 'mission:waypointTable.cmdGroup.navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, labelKey: 'mission:waypointTable.cmd.takeoff', descKey: 'mission:waypointTable.cmdDesc.launchAndClimbToAltitude' },
      { value: MAV_CMD.NAV_WAYPOINT, labelKey: 'mission:waypointTable.cmd.waypoint', descKey: 'mission:waypointTable.cmdDesc.flyToThisLocation' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, labelKey: 'mission:waypointTable.cmd.loiter', descKey: 'mission:waypointTable.cmdDesc.circleUntilCommanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, labelKey: 'mission:waypointTable.cmd.loiterTime', descKey: 'mission:waypointTable.cmdDesc.circleForSetDuration' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, labelKey: 'mission:waypointTable.cmd.loiterToAlt', descKey: 'mission:waypointTable.cmdDesc.loiterAndChangeAlt' },
      { value: MAV_CMD.NAV_LAND, labelKey: 'mission:waypointTable.cmd.land', descKey: 'mission:waypointTable.cmdDesc.landAtThisLocation' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, labelKey: 'mission:waypointTable.cmd.returnHome', descKey: 'mission:waypointTable.cmdDesc.flyBackToLaunch' },
      { value: MAV_CMD.NAV_DELAY, labelKey: 'mission:waypointTable.cmd.delay', descKey: 'mission:waypointTable.cmdDesc.waitBeforeTheNextItem' },
      { value: MAV_CMD.DO_LAND_START, labelKey: 'mission:waypointTable.cmd.landStart', descKey: 'mission:waypointTable.cmdDesc.marksTheLandingSequence' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.vtol',
    commands: [
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, labelKey: 'mission:waypointTable.cmd.vtolTakeoff', descKey: 'mission:waypointTable.cmdDesc.verticalTakeoff' },
      { value: MAV_CMD.NAV_VTOL_LAND, labelKey: 'mission:waypointTable.cmd.vtolLand', descKey: 'mission:waypointTable.cmdDesc.verticalLanding' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, labelKey: 'mission:waypointTable.cmd.vtolTransition', descKey: 'mission:waypointTable.cmdDesc.switchHoverForwardFlight' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.camera',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, labelKey: 'mission:waypointTable.cmd.cameraTrigger', descKey: 'mission:waypointTable.cmdDesc.triggerAtDistance' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, labelKey: 'mission:waypointTable.cmd.takePhoto', descKey: 'mission:waypointTable.cmdDesc.triggerCameraShutter' },
      { value: MAV_CMD.SET_CAMERA_MODE, labelKey: 'mission:waypointTable.cmd.cameraMode', descKey: 'mission:waypointTable.cmdDesc.photoOrVideoMode' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startCapture', descKey: 'mission:waypointTable.cmdDesc.startTakingPhotos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopCapture', descKey: 'mission:waypointTable.cmdDesc.stopTakingPhotos' },
      { value: MAV_CMD.VIDEO_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startVideo', descKey: 'mission:waypointTable.cmdDesc.startRecording' },
      { value: MAV_CMD.VIDEO_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopVideo', descKey: 'mission:waypointTable.cmdDesc.stopRecording' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.gimbalRoi',
    commands: [
      { value: MAV_CMD.DO_SET_ROI_LOCATION, labelKey: 'mission:waypointTable.cmd.roiLocation', descKey: 'mission:waypointTable.cmdDesc.pointCameraAtALocation' },
      { value: MAV_CMD.DO_SET_ROI_WPNEXT_OFFSET, labelKey: 'mission:waypointTable.cmd.roiNextWp', descKey: 'mission:waypointTable.cmdDesc.pointAtTheNextWaypoint' },
      { value: MAV_CMD.DO_SET_ROI_NONE, labelKey: 'mission:waypointTable.cmd.roiNone', descKey: 'mission:waypointTable.cmdDesc.cancelRegionOfInterest' },
      { value: MAV_CMD.DO_MOUNT_CONFIGURE, labelKey: 'mission:waypointTable.cmd.mountConfig', descKey: 'mission:waypointTable.cmdDesc.setGimbalMode' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, labelKey: 'mission:waypointTable.cmd.mountControl', descKey: 'mission:waypointTable.cmdDesc.aimTheGimbal' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, labelKey: 'mission:waypointTable.cmd.setSpeed', descKey: 'mission:waypointTable.cmdDesc.changeFlightSpeed' },
      { value: MAV_CMD.DO_JUMP, labelKey: 'mission:waypointTable.cmd.jump', descKey: 'mission:waypointTable.cmdDesc.jumpToWpAndRepeat' },
      { value: MAV_CMD.DO_SET_HOME, labelKey: 'mission:waypointTable.cmd.setHome', descKey: 'mission:waypointTable.cmdDesc.redefineTheHomePosition' },
      { value: MAV_CMD.DO_SET_SERVO, labelKey: 'mission:waypointTable.cmd.setServo', descKey: 'mission:waypointTable.cmdDesc.setServoPwm' },
      { value: MAV_CMD.DO_SET_ACTUATOR, labelKey: 'mission:waypointTable.cmd.setActuator', descKey: 'mission:waypointTable.cmdDesc.setAnActuatorOutput' },
      { value: MAV_CMD.DO_GRIPPER, labelKey: 'mission:waypointTable.cmd.gripper', descKey: 'mission:waypointTable.cmdDesc.openCloseGripper' },
      { value: MAV_CMD.CONDITION_YAW, labelKey: 'mission:waypointTable.cmd.setHeading', descKey: 'mission:waypointTable.cmdDesc.lockHeadingDirection' },
    ],
  },
];

/** The PX4 essentials, mirroring how SIMPLE_COMMAND_GROUPS trims ArduPilot's. */
const PX4_SIMPLE_COMMAND_GROUPS: CommandGroup[] = [
  {
    groupKey: 'mission:waypointTable.cmdGroup.navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, labelKey: 'mission:waypointTable.cmd.takeoff', descKey: 'mission:waypointTable.cmdDesc.launchAndClimbToAltitude' },
      { value: MAV_CMD.NAV_WAYPOINT, labelKey: 'mission:waypointTable.cmd.waypoint', descKey: 'mission:waypointTable.cmdDesc.flyToThisLocation' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, labelKey: 'mission:waypointTable.cmd.loiter', descKey: 'mission:waypointTable.cmdDesc.circleUntilCommanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, labelKey: 'mission:waypointTable.cmd.loiterTime', descKey: 'mission:waypointTable.cmdDesc.circleForSetDuration' },
      { value: MAV_CMD.NAV_LAND, labelKey: 'mission:waypointTable.cmd.land', descKey: 'mission:waypointTable.cmdDesc.landAtThisLocation' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, labelKey: 'mission:waypointTable.cmd.returnHome', descKey: 'mission:waypointTable.cmdDesc.flyBackToLaunch' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.camera',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, labelKey: 'mission:waypointTable.cmd.cameraTrigger', descKey: 'mission:waypointTable.cmdDesc.triggerAtDistance' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, labelKey: 'mission:waypointTable.cmd.takePhoto', descKey: 'mission:waypointTable.cmdDesc.triggerCameraShutter' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, labelKey: 'mission:waypointTable.cmd.startCapture', descKey: 'mission:waypointTable.cmdDesc.startTakingPhotos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, labelKey: 'mission:waypointTable.cmd.stopCapture', descKey: 'mission:waypointTable.cmdDesc.stopTakingPhotos' },
    ],
  },
  {
    groupKey: 'mission:waypointTable.cmdGroup.actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, labelKey: 'mission:waypointTable.cmd.setSpeed', descKey: 'mission:waypointTable.cmdDesc.changeFlightSpeed' },
      { value: MAV_CMD.DO_JUMP, labelKey: 'mission:waypointTable.cmd.jump', descKey: 'mission:waypointTable.cmdDesc.jumpToWpAndRepeat' },
      { value: MAV_CMD.DO_SET_SERVO, labelKey: 'mission:waypointTable.cmd.setServo', descKey: 'mission:waypointTable.cmdDesc.setServoPwm' },
    ],
  },
];

/** Command ids PX4 accepts, for validating a plan built before/elsewhere. */
export const PX4_SUPPORTED_COMMANDS: ReadonlySet<number> = new Set(
  PX4_COMMAND_GROUPS.flatMap(g => g.commands.map(c => c.value)),
);

// Flat list of all available commands (for lookup)
const ALL_AVAILABLE_COMMANDS = [
  ...COMMAND_GROUPS.flatMap(g => g.commands),
  ...PX4_COMMAND_GROUPS.flatMap(g => g.commands),
  ...INAV_COMMAND_GROUPS.flatMap(g => g.commands),
].filter((cmd, i, arr) => arr.findIndex(c => c.value === cmd.value) === i);

// Custom command dropdown (replaces native select)
function CommandDropdown({
  value,
  onChange,
  advanced,
  firmware,
}: {
  value: number;
  onChange: (cmd: number) => void;
  advanced: boolean;
  firmware: MissionFirmware;
}) {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // iNav has only 8 commands total, no need for simple/advanced split
  const baseGroups = firmware === 'inav'
    ? INAV_COMMAND_GROUPS
    : firmware === 'px4'
      ? (advanced ? PX4_COMMAND_GROUPS : PX4_SIMPLE_COMMAND_GROUPS)
      : advanced ? COMMAND_GROUPS : SIMPLE_COMMAND_GROUPS;

  // A vehicle running the ArduDeck Vehicle SDK lists the mission commands it honours.
  // Offering the rest means the operator plans a mission, sends it, and only then finds
  // out the vehicle refuses it. A vehicle that never says keeps the full list.
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const declaredCmds = useVehicleProfileStore(
    (s) => (activeVehicleKey ? s.byVehicle[activeVehicleKey] : undefined),
  );
  const groups = useMemo(() => {
    const allowed = allowedMissionCommands(declaredCmds);
    if (!allowed) return baseGroups;
    return baseGroups
      .map((g) => ({ ...g, commands: g.commands.filter((c) => allowed.has(c.value)) }))
      .filter((g) => g.commands.length > 0);
  }, [baseGroups, declaredCmds]);

  // Current command label
  const currentCmd = ALL_AVAILABLE_COMMANDS.find(c => c.value === value);
  const currentLabel = (currentCmd ? t(currentCmd.labelKey) : '') || missionCommandLabel(value);

  // Filter groups by search
  const filteredGroups = search.trim()
    ? groups
        .map(g => ({
          ...g,
          commands: g.commands.filter(
            c => t(c.labelKey).toLowerCase().includes(search.toLowerCase())
              || t(c.descKey).toLowerCase().includes(search.toLowerCase()),
          ),
        }))
        .filter(g => g.commands.length > 0)
    : groups;

  // Close on click outside (check both button and popup since popup is fixed/portaled)
  const handleClickOutside = useCallback((e: MouseEvent) => {
    const target = e.target as Node;
    if (
      dropdownRef.current && !dropdownRef.current.contains(target) &&
      popupRef.current && !popupRef.current.contains(target)
    ) {
      setIsOpen(false);
      setSearch('');
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      requestAnimationFrame(() => searchRef.current?.focus());
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleClickOutside]);

  return (
    <div ref={dropdownRef} className="relative">
      <button
        onClick={() => {
          if (!isOpen && dropdownRef.current) {
            const rect = dropdownRef.current.getBoundingClientRect();
            setPopupStyle({
              position: 'fixed',
              left: rect.left,
              width: rect.width,
              bottom: window.innerHeight - rect.top + 4,
              maxHeight: Math.max(200, rect.top - 12),
            });
          }
          setIsOpen(!isOpen);
        }}
        className="w-full flex items-center justify-between bg-surface-raised text-content text-sm px-2 py-1.5 rounded border border-default hover:border-default focus:border-blue-500 focus:outline-none"
      >
        <span className="truncate">{currentLabel}</span>
        <svg className={`w-4 h-4 shrink-0 ml-1 text-content-secondary transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div ref={popupRef} className="z-[9999] bg-surface-solid border border-default rounded-lg shadow-xl flex flex-col overflow-hidden" style={popupStyle}>
          {/* Search input */}
          <div className="p-1.5 border-b border-subtle shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={searchRef}
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setIsOpen(false);
                    setSearch('');
                  }
                  // Select first match on Enter
                  if (e.key === 'Enter' && filteredGroups.length > 0) {
                    const firstCmd = filteredGroups[0]?.commands[0];
                    if (firstCmd) {
                      onChange(firstCmd.value);
                      setIsOpen(false);
                      setSearch('');
                    }
                  }
                }}
                placeholder={t('mission:waypointTable.searchCommands')}
                className="w-full bg-surface-input text-content text-xs pl-7 pr-2 py-1.5 rounded border border-subtle focus:border-blue-500/50 focus:outline-none placeholder-content-secondary"
              />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-auto flex-1 min-h-0">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-content-secondary text-center">{t('mission:waypointTable.noCommandsMatch', { search })}</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.groupKey}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-content-secondary uppercase tracking-wider sticky top-0 bg-surface-raised">
                    {t(group.groupKey)}
                  </div>
                  {group.commands.map((cmd) => (
                    <button
                      key={cmd.value}
                      onClick={() => {
                        onChange(cmd.value);
                        setIsOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3 py-1.5 text-sm transition-colors flex items-center gap-2 ${
                        cmd.value === value
                          ? 'bg-blue-600/30 text-blue-300'
                          : 'text-content hover:bg-surface-raised'
                      }`}
                    >
                      <span className="font-medium whitespace-nowrap" title={advanced ? t(cmd.descKey) : undefined}>{t(cmd.labelKey)}</span>
                      {!advanced && <span className="text-xs text-content-secondary truncate">{t(cmd.descKey)}</span>}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}

// Get description for a waypoint
// advanced=false: friendly labels for beginners ("Fly here", "Circle here")
// advanced=true: standard GCS labels ("WP", "Loiter Unlim")
function getWaypointSummary(
  wp: MissionItem,
  advanced: boolean,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  speedUnit: SpeedUnit,
  verticalSpeedUnit: VerticalSpeedUnit,
  t: TFunction,
): string {
  const radiusSuffix = wp.param3 > 0 ? t('mission:waypointTable.summary.radiusSuffix', { value: formatDistanceFromMeters(wp.param3, distanceUnit) }) : '';
  const radius = radiusSuffix;

  switch (wp.command) {
    // Navigation
    case MAV_CMD.NAV_TAKEOFF:
      return t('mission:waypointTable.summary.takeoffTo', { alt: formatAltitudeFromMeters(wp.altitude, altitudeUnit) });
    case MAV_CMD.NAV_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? t('mission:waypointTable.summary.wpHold', { s: wp.param1 }) : t('mission:waypointTable.summary.wp');
      return wp.param1 > 0 ? t('mission:waypointTable.summary.flyHereWait', { s: wp.param1 }) : t('mission:waypointTable.summary.flyHere');
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? t('mission:waypointTable.summary.splineHold', { s: wp.param1 }) : t('mission:waypointTable.summary.spline');
      return wp.param1 > 0 ? t('mission:waypointTable.summary.smoothPathWait', { s: wp.param1 }) : t('mission:waypointTable.summary.smoothPath');
    case MAV_CMD.NAV_LOITER_UNLIM:
      if (advanced) return t('mission:waypointTable.summary.loiterUnlim', { radius });
      return t('mission:waypointTable.summary.circleHere', { radius });
    case MAV_CMD.NAV_LOITER_TIME:
      if (advanced) return t('mission:waypointTable.summary.loiterTime', { s: wp.param1, radius });
      return t('mission:waypointTable.summary.circleFor', { s: wp.param1, radius });
    case MAV_CMD.NAV_LOITER_TURNS:
      if (advanced) return t('mission:waypointTable.summary.loiterTurns', { n: wp.param1, radius });
      return t('mission:waypointTable.summary.circleTurns', { n: wp.param1, radius });
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return t('mission:waypointTable.summary.loiterToAlt', { alt: formatAltitudeFromMeters(wp.altitude, altitudeUnit), radius });
    case MAV_CMD.NAV_LAND:
      if (advanced) return t('mission:waypointTable.summary.land');
      return t('mission:waypointTable.summary.landHere');
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      if (advanced) return 'RTL';
      return t('mission:waypointTable.summary.returnToHome');
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return t('mission:waypointTable.summary.vtolTakeoffTo', { alt: formatAltitudeFromMeters(wp.altitude, altitudeUnit) });
    case MAV_CMD.NAV_VTOL_LAND:
      if (advanced) return t('mission:waypointTable.summary.vtolLand');
      return t('mission:waypointTable.summary.vtolLandHere');
    case MAV_CMD.NAV_DELAY:
      return t('mission:waypointTable.summary.wait', { s: wp.param1 });
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.placePayloadMax', { alt: formatAltitudeFromMeters(wp.param1, altitudeUnit) }) : t('mission:waypointTable.summary.placePayload');
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return t('mission:waypointTable.summary.continueChangeTo', { alt: formatAltitudeFromMeters(wp.altitude, altitudeUnit) });
    case MAV_CMD.NAV_ARC_WAYPOINT:
      if (advanced) return t('mission:waypointTable.summary.arcWp');
      return t('mission:waypointTable.summary.curvedPath');
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return t('mission:waypointTable.summary.waitAt', { alt: formatAltitudeFromMeters(wp.altitude, altitudeUnit) });
    case MAV_CMD.NAV_GUIDED_ENABLE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.enableGuided') : t('mission:waypointTable.summary.disableGuided');
    case MAV_CMD.NAV_SCRIPT_TIME:
      return t('mission:waypointTable.summary.scriptFor', { s: wp.param1 });
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return t('mission:waypointTable.summary.holdAttitude', { s: wp.param1 });

    // Conditions
    case MAV_CMD.CONDITION_DELAY:
      return t('mission:waypointTable.summary.wait', { s: wp.param1 });
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return t('mission:waypointTable.summary.climbDescendAt', { rate: formatVerticalSpeedFromMetersPerSecond(wp.param1, verticalSpeedUnit) });
    case MAV_CMD.CONDITION_DISTANCE:
      return t('mission:waypointTable.summary.waitUntilFromNext', { dist: formatDistanceFromMeters(wp.param1, distanceUnit) });
    case MAV_CMD.CONDITION_YAW: {
      const isRelative = wp.param4 !== 0;
      return isRelative
        ? t('mission:waypointTable.summary.turnBy', { deg: wp.param1 })
        : t('mission:waypointTable.summary.turnTo', { deg: wp.param1 });
    }

    // Camera / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_DIST ${formatDistanceFromMeters(wp.param1, distanceUnit)}` : 'CAM_TRIGG off'; // i18n-exempt
      return wp.param1 > 0 ? t('mission:waypointTable.summary.cameraEveryDist', { dist: formatDistanceFromMeters(wp.param1, distanceUnit) }) : t('mission:waypointTable.summary.cameraTriggerOff');
    case MAV_CMD.DO_DIGICAM_CONTROL:
      if (advanced) return 'DIGICAM_CONTROL';
      return t('mission:waypointTable.summary.takePhoto');
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
      if (advanced) return 'DIGICAM_CONFIGURE';
      return t('mission:waypointTable.summary.configureCamera');
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      if (advanced) return 'SET_ROI';
      return t('mission:waypointTable.summary.pointCameraHere');
    case MAV_CMD.DO_SET_ROI_NONE:
      if (advanced) return 'ROI_NONE';
      return t('mission:waypointTable.summary.stopCameraTracking');
    case MAV_CMD.DO_MOUNT_CONTROL:
      if (advanced) return 'MOUNT_CONTROL';
      return t('mission:waypointTable.summary.setGimbalAngles');
    case MAV_CMD.DO_MOUNT_CONFIGURE:
      if (advanced) return 'MOUNT_CONFIGURE';
      return t('mission:waypointTable.summary.configureGimbal');
    case MAV_CMD.DO_CONTROL_VIDEO:
      return t('mission:waypointTable.summary.controlVideo');
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_INT ${wp.param1}s` : 'CAM_TRIGG_INT off'; // i18n-exempt
      return wp.param1 > 0 ? t('mission:waypointTable.summary.cameraEveryTime', { s: wp.param1 }) : t('mission:waypointTable.summary.cameraIntervalOff');
    case MAV_CMD.IMAGE_START_CAPTURE:
      if (advanced) return wp.param2 > 0 ? `IMG_START (${wp.param2}s int)` : 'IMG_START'; // i18n-exempt
      return wp.param2 > 0 ? t('mission:waypointTable.summary.startPhotosEvery', { s: wp.param2 }) : t('mission:waypointTable.summary.startTakingPhotos');
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      if (advanced) return 'IMG_STOP';
      return t('mission:waypointTable.summary.stopTakingPhotos');
    case MAV_CMD.VIDEO_START_CAPTURE:
      if (advanced) return 'VID_START';
      return t('mission:waypointTable.summary.startRecordingVideo');
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      if (advanced) return 'VID_STOP';
      return t('mission:waypointTable.summary.stopRecordingVideo');
    case MAV_CMD.SET_CAMERA_ZOOM:
      return t('mission:waypointTable.summary.cameraZoom', { v: wp.param2 });
    case MAV_CMD.SET_CAMERA_FOCUS:
      return t('mission:waypointTable.summary.cameraFocus', { v: wp.param2 });
    case MAV_CMD.SET_CAMERA_SOURCE:
      return t('mission:waypointTable.summary.setCameraSource');
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return t('mission:waypointTable.summary.gimbalPitchYaw', { pitch: wp.param1, yaw: wp.param2 });

    // Actions
    case MAV_CMD.DO_CHANGE_SPEED:
      return t('mission:waypointTable.summary.setSpeedTo', { speed: formatSpeedFromMetersPerSecond(wp.param2, speedUnit) });
    case MAV_CMD.DO_SET_HOME:
      return wp.param1 === 1 ? t('mission:waypointTable.summary.setHomeCurrent') : t('mission:waypointTable.summary.setHomeLocation');
    case MAV_CMD.DO_JUMP:
      return wp.param2 > 0 ? t('mission:waypointTable.summary.jumpToWpTimes', { wp: wp.param1, n: wp.param2 }) : t('mission:waypointTable.summary.jumpToWpForever', { wp: wp.param1 });
    case MAV_CMD.DO_SET_SERVO:
      return t('mission:waypointTable.summary.servo', { n: wp.param1, v: wp.param2 });
    case MAV_CMD.DO_REPEAT_SERVO:
      return t('mission:waypointTable.summary.cycleServo', { n: wp.param1 });
    case MAV_CMD.DO_SET_RELAY:
      return wp.param2 > 0 ? t('mission:waypointTable.summary.relayOn', { n: wp.param1 }) : t('mission:waypointTable.summary.relayOff', { n: wp.param1 });
    case MAV_CMD.DO_REPEAT_RELAY:
      return t('mission:waypointTable.summary.cycleRelay', { n: wp.param1 });
    case MAV_CMD.DO_FENCE_ENABLE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.enableGeofence') : t('mission:waypointTable.summary.disableGeofence');
    case MAV_CMD.DO_PARACHUTE:
      return t('mission:waypointTable.summary.deployParachute');
    case MAV_CMD.DO_GRIPPER:
      return wp.param2 === 0 ? t('mission:waypointTable.summary.releaseGripper') : t('mission:waypointTable.summary.grabGripper');
    case MAV_CMD.DO_VTOL_TRANSITION:
      return wp.param1 === 3 ? t('mission:waypointTable.summary.transitionFw') : t('mission:waypointTable.summary.transitionMc');
    case MAV_CMD.DO_LAND_START:
      return t('mission:waypointTable.summary.beginLanding');
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return t('mission:waypointTable.summary.changeAltTo', { alt: formatAltitudeFromMeters(wp.param1, altitudeUnit) });
    case MAV_CMD.DO_SET_MODE:
      return t('mission:waypointTable.summary.setMode', { n: wp.param1 });
    case MAV_CMD.DO_PAUSE_CONTINUE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.resumeMission') : t('mission:waypointTable.summary.pauseMission');
    case MAV_CMD.DO_SET_REVERSE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.driveReverse') : t('mission:waypointTable.summary.driveForward');
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.invertedOn') : t('mission:waypointTable.summary.invertedOff');
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.autotuneOn') : t('mission:waypointTable.summary.autotuneOff');
    case MAV_CMD.DO_ENGINE_CONTROL:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.startEngine') : t('mission:waypointTable.summary.stopEngine');
    case MAV_CMD.DO_FLIGHTTERMINATION:
      return t('mission:waypointTable.summary.flightTermination');
    case MAV_CMD.DO_SET_PARAMETER:
      return t('mission:waypointTable.summary.setParam', { n: wp.param1, v: wp.param2 });
    case MAV_CMD.JUMP_TAG:
      return t('mission:waypointTable.summary.tag', { n: wp.param1 });
    case MAV_CMD.DO_JUMP_TAG:
      return wp.param2 > 0 ? t('mission:waypointTable.summary.jumpToTagTimes', { tag: wp.param1, n: wp.param2 }) : t('mission:waypointTable.summary.jumpToTagForever', { tag: wp.param1 });
    case MAV_CMD.DO_SPRAYER:
      return wp.param1 > 0 ? t('mission:waypointTable.summary.sprayerOn') : t('mission:waypointTable.summary.sprayerOff');
    case MAV_CMD.DO_WINCH:
      return t('mission:waypointTable.summary.controlWinch');
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return t('mission:waypointTable.summary.scriptMsg', { n: wp.param1 });
    case MAV_CMD.SET_YAW_SPEED:
      return t('mission:waypointTable.summary.yawAt', { deg: wp.param1, rate: wp.param2 });
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return t('mission:waypointTable.summary.resumeRepeat', { dist: formatDistanceFromMeters(wp.param1, distanceUnit) });
    case MAV_CMD.DO_AUX_FUNCTION:
      return t('mission:waypointTable.summary.auxFunction', { n: wp.param1 });

    default:
      return missionCommandLabel(wp.command);
  }
}

type CommandParamConfig = {
  key: keyof MissionItem;
  labelKey: string;
  unit: string;
  unitHintKey?: string;
  unitKind?: 'distance' | 'altitude' | 'speed' | 'verticalSpeed';
  min?: number;
  max?: number;
  step?: number;
  show: boolean;
};

// Get the parameters config for each command type
export function getCommandParams(cmd: number): CommandParamConfig[] {
  const baseLocation: CommandParamConfig[] = [
    { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
  ];

  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return [
        { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.targetAltitude', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.pitchAngle', unit: '°', min: 0, max: 90, step: 5, show: true },
      ];
    case MAV_CMD.NAV_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.waitTime', unit: 's', min: 0, max: 300, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.acceptanceRadius', unit: 'm', unitKind: 'distance', min: 0, max: 50, step: 1, show: false },
      ];
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.waitTime', unit: 's', min: 0, max: 300, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_UNLIM:
      return [
        ...baseLocation,
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TIME:
      return [
        ...baseLocation,
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.duration', unit: 's', min: 1, max: 600, step: 5, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TURNS:
      return [
        ...baseLocation,
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.numberOfTurns', unit: '', min: 1, max: 100, step: 1, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LAND:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.abortAltitude', unit: 'm', unitKind: 'altitude', min: 0, max: 100, step: 5, show: true },
      ];
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return []; // No params needed
    case MAV_CMD.NAV_DELAY:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.waitTime', unit: 's', min: 1, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_SPEED:
      return [
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.targetSpeed', unit: 'm/s', unitKind: 'speed', min: 1, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return [
        ...baseLocation,
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return [
        { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.targetAltitude', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
      ];
    case MAV_CMD.NAV_VTOL_LAND:
      return [
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.approachAlt', unit: 'm', unitKind: 'altitude', min: 0, max: 200, step: 5, show: true },
      ];
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return [
        ...baseLocation,
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.maxDescend', unit: 'm', unitKind: 'altitude', min: 0, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_DELAY:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.time', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.rate', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
        { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.targetAltitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
      ];
    case MAV_CMD.CONDITION_DISTANCE:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.distance', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.CONDITION_YAW:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.angle', unit: 'deg', min: 0, max: 360, step: 5, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.speed', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.direction', unit: '', unitHintKey: 'mission:waypointTable.unitHint.yawDirection', min: -1, max: 1, step: 1, show: true },
        { key: 'param4' as const, labelKey: 'mission:waypointTable.param.relative', unit: '', unitHintKey: 'mission:waypointTable.unitHint.yawRelative', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.waypointNumber', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.repeatCount', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.distance', unit: 'm', unitKind: 'distance', min: 0, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_SERVO:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.servoNumber', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.pwm', unit: 'us', min: 500, max: 2500, step: 10, show: true },
      ];
    case MAV_CMD.DO_SET_RELAY:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.relayNumber', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.onOff', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_SERVO:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.servoNumber', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.pwm', unit: 'us', min: 500, max: 2500, step: 10, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.count', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_RELAY:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.relayNumber', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.count', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return baseLocation;
    case MAV_CMD.DO_MOUNT_CONTROL:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.pitch', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.roll', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.yaw', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_FENCE_ENABLE:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.enable', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_GRIPPER:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.gripperNumber', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.action', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_VTOL_TRANSITION:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.state', unit: '', min: 1, max: 4, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.frame', unit: '', min: 0, max: 10, step: 1, show: false },
      ];
    // New commands
    case MAV_CMD.NAV_ARC_WAYPOINT:
      return [
        ...baseLocation,
      ];
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return [
        { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.targetAltitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.climbRate', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
      ];
    case MAV_CMD.NAV_SCRIPT_TIME:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.command', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.timeout', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.time', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.interval', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.count', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_START_CAPTURE:
      return [
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.interval', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.totalImages', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_START_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      return [];
    case MAV_CMD.SET_CAMERA_ZOOM:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.zoomType', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.zoomValue', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.SET_CAMERA_FOCUS:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.focusType', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.focusValue', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.pitch', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.yaw', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.JUMP_TAG:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.tagNumber', unit: '', min: 1, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP_TAG:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.tagNumber', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.repeatCount', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SPRAYER:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.enable', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_WINCH:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.instance', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.action', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.id', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.param1', unit: '', min: -1000, max: 1000, step: 1, show: true },
        { key: 'param3' as const, labelKey: 'mission:waypointTable.param.param2', unit: '', min: -1000, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.SET_YAW_SPEED:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.yawAngle', unit: 'deg', min: -180, max: 180, step: 5, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.speed', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_AUX_FUNCTION:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.function', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, labelKey: 'mission:waypointTable.param.switchPos', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.distance', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.DO_ENGINE_CONTROL:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.startStop', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.enable', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return [
        { key: 'param1' as const, labelKey: 'mission:waypointTable.param.inverted', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return [
        { key: 'altitude' as const, labelKey: 'mission:waypointTable.param.targetAltitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
      ];
    default:
      return baseLocation;
  }
}

interface WaypointTablePanelProps {
  readOnly?: boolean;
}

export function WaypointTablePanel({ readOnly = false }: WaypointTablePanelProps) {
  // Use shared edit mode from toolbar
  const activeMode = useEditModeStore((state) => state.activeMode);
  const prevModeRef = useRef(activeMode);

  // Get fence and rally store actions to clear edit modes when switching
  const setFenceDrawMode = useFenceStore((state) => state.setDrawMode);
  const setRallyAddMode = useRallyStore((state) => state.setAddMode);

  // Clear edit modes when switching away from a mode
  useEffect(() => {
    const prevMode = prevModeRef.current;
    if (prevMode !== activeMode) {
      // Clear fence draw mode when leaving geofence
      if (prevMode === 'geofence') {
        setFenceDrawMode('none');
      }
      // Clear rally add mode when leaving rally
      if (prevMode === 'rally') {
        setRallyAddMode(false);
      }
      prevModeRef.current = activeMode;
    }
  }, [activeMode, setFenceDrawMode, setRallyAddMode]);

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Content based on active mode - no tabs, controlled by toolbar */}
      <div className="flex-1 overflow-hidden">
        {activeMode === 'mission' && <WaypointListContent readOnly={readOnly} />}
        {activeMode === 'geofence' && <FenceListPanel readOnly={readOnly} />}
        {activeMode === 'rally' && <RallyListPanel readOnly={readOnly} />}
      </div>
    </div>
  );
}

/**
 * Group header rendered above the first WP of each group in the mission
 * table. Carries the group's color, count, collapse toggle, rename, and
 * overflow menu (delete). Selective-upload checkbox + edit-survey shortcut
 * land in later steps.
 */
function formatBlockDistance(m: number, unit: DistanceUnit): string {
  return formatDistanceFromMeters(m, unit);
}

function formatBlockDuration(s: number): string {
  const mins = Math.floor(s / 60);
  const secs = Math.round(s % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function displayParamValue(
  value: number,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number {
  return param.unitKind ? waypointDisplayValue(value, param.unitKind, unitContext) : value;
}

function nativeParamValue(
  value: number,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number {
  return param.unitKind ? waypointNativeValue(value, param.unitKind, unitContext) : value;
}

function displayParamBound(
  value: number | undefined,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number | undefined {
  if (value === undefined) return undefined;
  return param.unitKind ? waypointDisplayBound(value, param.unitKind, unitContext) : value;
}

function displayParamStep(
  value: number | undefined,
  param: CommandParamConfig,
  unitContext: WaypointUnitContext,
): number | undefined {
  if (value === undefined) return undefined;
  return param.unitKind ? waypointDisplayStep(param.unitKind, unitContext) : value;
}

function displayParamUnit(
  param: CommandParamConfig,
  distanceUnit: DistanceUnit,
  altitudeUnit: AltitudeUnit,
  speedUnit: SpeedUnit,
  verticalSpeedUnit: VerticalSpeedUnit,
): string {
  if (param.unitKind === 'distance') return UNIT_LABELS.distance[distanceUnit];
  if (param.unitKind === 'altitude') return UNIT_LABELS.altitude[altitudeUnit];
  if (param.unitKind === 'speed') return UNIT_LABELS.speed[speedUnit];
  if (param.unitKind === 'verticalSpeed') return UNIT_LABELS.verticalSpeed[verticalSpeedUnit];
  return param.unit;
}

function isValidDisplayNumber(value: number, min?: number, max?: number): boolean {
  return Number.isFinite(value) &&
    (min === undefined || value >= min) &&
    (max === undefined || value <= max);
}

function sameNativeParamValue(a: number, b: number): boolean {
  return Math.abs(a - b) < 1e-9;
}

function UnitParamInput({
  nativeValue,
  param,
  distanceUnit,
  altitudeUnit,
  speedUnit,
  verticalSpeedUnit,
  onCommit,
}: {
  nativeValue: number;
  param: CommandParamConfig;
  distanceUnit: DistanceUnit;
  altitudeUnit: AltitudeUnit;
  speedUnit: SpeedUnit;
  verticalSpeedUnit: VerticalSpeedUnit;
  onCommit: (nativeValue: number) => void;
}) {
  const unitContext = useMemo<WaypointUnitContext>(() => ({
    distanceUnit,
    altitudeUnit,
    speedUnit,
    verticalSpeedUnit,
  }), [altitudeUnit, distanceUnit, speedUnit, verticalSpeedUnit]);
  const displayValue = displayParamValue(nativeValue, param, unitContext);
  const min = displayParamBound(param.min, param, unitContext);
  const max = displayParamBound(param.max, param, unitContext);
  const step = displayParamStep(param.step, param, unitContext);
  const [draft, setDraft] = useState(() => String(displayValue));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(displayValue));
  }, [displayValue, focused]);

  const resetDraft = useCallback(() => {
    setDraft(String(displayParamValue(nativeValue, param, unitContext)));
  }, [nativeValue, param, unitContext]);

  const commitDisplayValue = useCallback((display: number) => {
    if (!isValidDisplayNumber(display, min, max)) {
      resetDraft();
      return;
    }
    const nextNative = nativeParamValue(display, param, unitContext);
    if (!sameNativeParamValue(nextNative, nativeValue)) {
      onCommit(nextNative);
    }
    setDraft(String(display));
  }, [max, min, nativeValue, onCommit, param, resetDraft, unitContext]);

  return (
    <input
      type="number"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const nextDraft = e.target.value;
        setDraft(nextDraft);
        if (nextDraft.trim() === '') return;
        const parsed = Number(nextDraft);
        if (!isValidDisplayNumber(parsed, min, max)) return;
        const nextNative = nativeParamValue(parsed, param, unitContext);
        if (!sameNativeParamValue(nextNative, nativeValue)) {
          onCommit(nextNative);
        }
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          return;
        }
        const parsed = Number(draft);
        if (draft.trim() === '' || !Number.isFinite(parsed)) {
          resetDraft();
          return;
        }
        if (parsed === displayValue) {
          resetDraft();
          return;
        }
        commitDisplayValue(parsed);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          resetDraft();
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
    />
  );
}

// Plain-number sibling of UnitParamInput: keeps a string draft while focused so
// partial input ("", "-", "1.") never commits. Without this, clearing the
// latitude field commits Number('') = 0 and teleports the waypoint to 0,0
// mid-edit. Commits on blur/Enter (plus live for in-range values when `live`),
// Escape reverts.
//
// `text` renders as type="text" inputMode="decimal": Chromium localizes
// type="number" display (comma decimals on comma-locale systems), which made
// lat/lon show "42,44" while every other coordinate in the app uses dots.
// Comma input is still accepted when typing.
function parseDecimal(s: string): number {
  return Number(s.trim().replace(',', '.'));
}

function DraftNumberInput({
  value,
  onCommit,
  min,
  max,
  step,
  live = false,
  text = false,
}: {
  value: number;
  onCommit: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  live?: boolean;
  text?: boolean;
}) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const skipBlurCommitRef = useRef(false);

  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      type={text ? 'text' : 'number'}
      inputMode="decimal"
      value={draft}
      onFocus={() => setFocused(true)}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (!live || next.trim() === '') return;
        const parsed = parseDecimal(next);
        if (isValidDisplayNumber(parsed, min, max) && parsed !== value) onCommit(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        if (skipBlurCommitRef.current) {
          skipBlurCommitRef.current = false;
          setDraft(String(value));
          return;
        }
        const parsed = parseDecimal(draft);
        if (draft.trim() === '' || !isValidDisplayNumber(parsed, min, max)) {
          setDraft(String(value));
          return;
        }
        if (parsed !== value) onCommit(parsed);
        setDraft(String(parsed));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur();
        } else if (e.key === 'Escape') {
          skipBlurCommitRef.current = true;
          e.currentTarget.blur();
        }
      }}
      min={min}
      max={max}
      step={step}
      className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
    />
  );
}

function GroupHeaderRow({
  group,
  count,
  stats,
  readOnly,
  isSelected,
  isEditing,
  onVehicleState,
  onSelect,
  onToggleCollapse,
  onToggleVisible,
  onSync,
  connected,
  onRename,
  onSetColor,
  onDelete,
  onRegenerate,
  onReplay,
  onEdit,
  distanceUnit,
  fleetVehicles,
  assignedVehicleKey,
  onAssignVehicle,
  onDistribute,
  onDuplicate,
  onSaveArea,
  onMoveUp,
  onMoveDown,
  flightEnd,
  onSetEndsFlight,
  onSelectWaypoints,
  bulkSelected,
  pickIndex,
  linkMode,
  linkPick,
  onLinkClick,
  flightColor,
  dragging,
  dropBefore,
  onGroupDragStart,
  onGroupDragOver,
  onGroupDrop,
  onGroupDragEnd,
  onToggleBulkSelected,
}: {
  group: Group;
  count: number;
  /** Per-group flight stats shown inline in the header (distance, time, GSD). */
  stats?: { distanceM: number; timeS: number; gsd: number | null };
  readOnly: boolean;
  isSelected: boolean;
  /** True when the survey panel is currently editing this group live. */
  isEditing: boolean;
  /**
   * Vehicle-sync state for this group from the last successful upload.
   * - 'none': never uploaded or no record
   * - 'on-vehicle': uploaded and unchanged since
   * - 'stale-on-vehicle': uploaded then locally edited; vehicle now lags
   */
  onVehicleState: 'none' | 'on-vehicle' | 'stale-on-vehicle';
  onSelect: () => void;
  onToggleCollapse: () => void;
  /** Toggle whether this group is shown on the map. */
  onToggleVisible: () => void;
  /** Sync this group: upload to the vehicle when connected, else save to file. */
  onSync?: () => void;
  /** Whether an FC is connected (drives the sync button's upload-vs-save mode). */
  connected?: boolean;
  onRename: (name: string) => void;
  /** Change the group's color (map + sidebar). */
  onSetColor: (color: string) => void;
  onDelete: () => void;
  onRegenerate?: () => void;
  /** Animate the coverage-planning pipeline on the map. Survey groups whose
      generatorResult carries replayable data only. Click again to stop. */
  onReplay?: () => void;
  /** Re-open the survey panel and load this group's polygon + config back
      into the draft for live editing. Survey groups only. */
  onEdit?: () => void;
  distanceUnit: DistanceUnit;
  /**
   * Fleet/swarm: vehicles available to assign this group to. When non-empty a
   * vehicle picker appears in the header and the sync button uploads to the
   * assigned vehicle. Empty / undefined in single-vehicle mode (picker hidden).
   */
  fleetVehicles?: Array<{ key: string; label: string; color: string }>;
  assignedVehicleKey?: string;
  onAssignVehicle?: (vehicleKey: string | null) => void;
  /** Split this group into one mission per fleet vehicle (swarm survey). */
  onDistribute?: () => void;
  onDuplicate?: () => void;
  /** Survey groups only: keep this area on its own, without opening the editor. */
  onSaveArea?: () => void;
  /** Move this group one place earlier/later in the flight. Undefined at the ends. */
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  /**
   * Whether the flight ends at this group, and what it ends with. Undefined
   * when the plan holds a single survey, where the question does not arise.
   */
  flightEnd?: {
    ends: boolean;
    label: string;
    /** Which flight this group is part of, and where in it. */
    flight: number;
    leg: number;
    legs: number;
    flights: number;
    /** Last in the plan with no return: says so instead of "continues". */
    dangling: boolean;
    color: string;
  };
  onSetEndsFlight?: (ends: boolean) => void;
  /** Add all of this group's waypoints to the multi-selection. */
  onSelectWaypoints?: () => void;
  /** Ticked for bulk actions. Undefined hides the checkbox entirely. */
  bulkSelected?: boolean;
  /** 1-based position in the connect order, when more than one is ticked. */
  pickIndex?: number;
  /** Survey-pick mode: the whole row becomes the target. */
  linkMode?: null | 'connect' | 'disconnect';
  /** Its place in the pick so far, when picked. */
  linkPick?: number;
  onLinkClick?: () => void;
  /** The flight's colour, so every survey on one flight reads as one block. */
  flightColor?: string;
  /** Drag to reorder: this row is the one being dragged. */
  dragging?: boolean;
  /** Drop line above this row. */
  dropBefore?: boolean;
  onGroupDragStart?: () => void;
  onGroupDragOver?: (e: React.DragEvent) => void;
  onGroupDrop?: () => void;
  onGroupDragEnd?: () => void;
  onToggleBulkSelected?: (additive: boolean) => void;
}) {
  const { t } = useTranslation();
  const isStaleSurvey = isSurveyGroup(group) && isSurveyGroupStale(group);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(group.name);
  const [menuOpen, setMenuOpen] = useState(false);
  const [colorOpen, setColorOpen] = useState(false);
  const [colorPos, setColorPos] = useState<{ top: number; left: number } | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; right: number } | null>(null);
  const [vehicleMenuOpen, setVehicleMenuOpen] = useState(false);
  const [vehicleMenuPos, setVehicleMenuPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const swatchRef = useRef<HTMLButtonElement>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const vehicleBtnRef = useRef<HTMLButtonElement>(null);

  const showVehiclePicker = !readOnly && !!fleetVehicles && fleetVehicles.length > 0 && !!onAssignVehicle;
  const assignedVehicle = fleetVehicles?.find((v) => v.key === assignedVehicleKey);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const commit = () => {
    const next = draft.trim();
    if (next && next !== group.name) onRename(next);
    else setDraft(group.name);
    setEditing(false);
  };

  const cancel = () => {
    setDraft(group.name);
    setEditing(false);
  };

  return (
    <div
      data-tour="mission-group"
      className={`relative flex flex-col select-none cursor-pointer transition-colors ${
        linkMode
          ? linkPick
            ? 'bg-purple-500/25 ring-1 ring-inset ring-purple-400'
            : 'bg-surface-raised/40 hover:bg-purple-500/20 hover:ring-1 hover:ring-inset hover:ring-purple-400/60'
          : isSelected ? 'bg-surface-raised/80' : 'bg-surface-raised/40 hover:bg-surface-raised/60'
      }`}
      style={{
        borderLeft: `3px solid ${flightColor ?? group.color}`,
        opacity: dragging ? 0.4 : undefined,
        outline: dragging ? '1px dashed rgba(167,139,250,.9)' : undefined,
      }}
      onDragOver={onGroupDragOver}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onGroupDrop?.();
      }}
      onDragEnd={onGroupDragEnd}
      onClick={onSelect}
    >
      {dropBefore && (
        <div className="absolute -top-px left-0 right-0 h-0.5 bg-purple-400 z-30 pointer-events-none">
          <span className="absolute -left-1 -top-1 w-2.5 h-2.5 rounded-full bg-purple-400" />
        </div>
      )}
      {/* In pick mode the whole row is one target. An overlay, because the
          controls inside the row all stop propagation, so a click on any of
          them would never reach the row itself. */}
      {linkMode && onLinkClick && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onLinkClick();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="absolute inset-0 z-20 w-full h-full cursor-pointer"
          title={linkMode === 'connect'
            ? t('mission:waypointTable.group.linkConnectTip')
            : t('mission:waypointTable.group.linkSplitTip')}
        >
          {linkPick !== undefined && (
            <span className="absolute left-1 top-1 w-4 h-4 rounded-full bg-purple-500 text-white text-[9px] font-bold flex items-center justify-center">
              {linkPick}
            </span>
          )}
        </button>
      )}
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
      {!readOnly && !linkMode && onGroupDragStart && (
        <div
          draggable
          onDragStart={(e) => {
            e.stopPropagation();
            e.dataTransfer.effectAllowed = 'move';
            // Firefox refuses to start a drag without payload.
            e.dataTransfer.setData('text/plain', group.id);
            onGroupDragStart();
          }}
          onDragEnd={onGroupDragEnd}
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 w-3.5 h-5 flex items-center justify-center text-content-tertiary hover:text-content cursor-grab active:cursor-grabbing"
          data-tip={t('mission:waypointTable.group.dragTip')}
        >
          <svg viewBox="0 0 10 16" className="w-2.5 h-4" fill="currentColor">
            <circle cx="3" cy="3" r="1.2" /><circle cx="7" cy="3" r="1.2" />
            <circle cx="3" cy="8" r="1.2" /><circle cx="7" cy="8" r="1.2" />
            <circle cx="3" cy="13" r="1.2" /><circle cx="7" cy="13" r="1.2" />
          </svg>
        </div>
      )}
      {!readOnly && onToggleBulkSelected && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleBulkSelected(e.shiftKey);
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-5 h-5"
          data-tip={pickIndex
            ? t('mission:waypointTable.group.pickedTip', { n: pickIndex })
            : t('mission:waypointTable.group.bulkSelectTip')}
        >
          {pickIndex ? (
            <span className="w-4 h-4 rounded-full bg-purple-600 text-white text-[9px] font-semibold flex items-center justify-center">
              {pickIndex}
            </span>
          ) : (
            <input
              type="checkbox"
              checked={!!bulkSelected}
              onChange={() => { /* handled by wrapper onClick */ }}
              className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
            />
          )}
        </div>
      )}
      {!readOnly && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-5 h-5"
          data-tip={group.visible ? t('mission:waypointTable.group.visibleTip') : t('mission:waypointTable.group.hiddenTip')}
        >
          <input
            type="checkbox"
            checked={group.visible}
            onChange={() => { /* handled by wrapper onClick */ }}
            className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
          />
        </div>
      )}
      <button
        onClick={(e) => {
          e.stopPropagation();
          onToggleCollapse();
        }}
        className="w-4 h-4 flex items-center justify-center text-content-secondary hover:text-content transition-colors shrink-0"
        data-tip={group.collapsed ? t('mission:waypointTable.group.expandTip', { count }) : t('mission:waypointTable.group.collapseTip')}
      >
        <ChevronRight
          className={`w-3 h-3 transition-transform ${group.collapsed ? '' : 'rotate-90'}`}
        />
      </button>
      <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
        <button
          ref={swatchRef}
          onClick={(e) => {
            e.stopPropagation();
            if (readOnly) return;
            if (!colorOpen) {
              const r = swatchRef.current?.getBoundingClientRect();
              // Anchor the palette to the swatch, in a body-level portal so it
              // isn't clipped by the waypoint list's overflow.
              if (r) setColorPos({ top: r.bottom + 4, left: r.left });
            }
            setColorOpen((v) => !v);
          }}
          className="w-3.5 h-3.5 rounded-sm border border-white/25 block"
          style={{ backgroundColor: group.color }}
          data-tip={readOnly ? undefined : t('mission:waypointTable.group.changeColor')}
          aria-label={t('mission:waypointTable.group.groupColor')}
        />
        {colorOpen && !readOnly && colorPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setColorOpen(false)} />
              <div
                className="fixed z-[9999] p-1.5 bg-surface-solid border border-subtle rounded-lg shadow-2xl grid grid-cols-4 gap-1"
                style={{ top: colorPos.top, left: colorPos.left }}
              >
                {GROUP_COLOR_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => {
                      onSetColor(c);
                      setColorOpen(false);
                    }}
                    className={`w-5 h-5 rounded transition-transform hover:scale-110 ${c === group.color ? 'ring-2 ring-white' : ''}`}
                    style={{ backgroundColor: c }}
                    aria-label={t('mission:waypointTable.group.setColor', { color: c })}
                  />
                ))}
              </div>
            </>,
            document.body,
          )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        {editing ? (
          <input
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commit();
              else if (e.key === 'Escape') cancel();
            }}
            className="text-xs font-medium bg-surface-input border border-subtle rounded px-1 py-0.5 text-content focus:outline-none focus:border-blue-500/50 max-w-[200px]"
          />
        ) : (
          <span
            className={`flex-1 min-w-0 text-xs font-medium text-content truncate ${readOnly ? '' : 'cursor-text hover:text-blue-300'}`}
            onDoubleClick={() => !readOnly && setEditing(true)}
            title={readOnly ? group.name : t('mission:waypointTable.group.renameTip')}
          >
            {group.name}
          </span>
        )}
        <span className="text-[10px] text-content-secondary shrink-0">
          {t('mission:waypointTable.group.wpCount', { count })}
        </span>
        {isStaleSurvey && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-amber-500/15 text-amber-300 shrink-0"
            title={t('mission:waypointTable.group.staleTip')}
          >
            {t('mission:waypointTable.group.modified')}
          </span>
        )}
        {onVehicleState === 'on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title={t('mission:waypointTable.group.onVehicleTip')}
          >
            {t('mission:waypointTable.group.onVehicle')}
          </span>
        )}
        {onVehicleState === 'stale-on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-yellow-500/15 text-yellow-300 shrink-0"
            title={t('mission:waypointTable.group.staleOnVehicleTip')}
          >
            {t('mission:waypointTable.group.staleOnVehicle')}
          </span>
        )}
        {isEditing && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title={t('mission:waypointTable.group.editingTip')}
          >
            {t('mission:waypointTable.group.editing')}
          </span>
        )}
      </div>
      {showVehiclePicker && (
        <>
          <button
            ref={vehicleBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              const r = vehicleBtnRef.current?.getBoundingClientRect();
              if (r) setVehicleMenuPos({ top: r.bottom + 4, left: r.left });
              setVehicleMenuOpen((o) => !o);
            }}
            className="shrink-0 flex items-center gap-1.5 px-1.5 h-6 rounded text-[11px] font-medium border border-subtle bg-surface-raised hover:bg-surface-solid text-content transition-colors max-w-[120px]"
            data-tip={t('mission:waypointTable.group.assignTip')}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: assignedVehicle?.color ?? 'transparent', border: assignedVehicle ? 'none' : '1px solid var(--border-subtle, #555)' }}
            />
            <span className="truncate">{assignedVehicle ? assignedVehicle.label : t('mission:waypointTable.group.assign')}</span>
          </button>
          {vehicleMenuOpen && vehicleMenuPos &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[998]" onClick={(e) => { e.stopPropagation(); setVehicleMenuOpen(false); }} />
                <div
                  className="fixed z-[999] min-w-[140px] py-1 rounded-md border border-subtle bg-surface-solid shadow-xl"
                  style={{ top: vehicleMenuPos.top, left: vehicleMenuPos.left }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    onClick={() => { onAssignVehicle?.(null); setVehicleMenuOpen(false); }}
                    className="w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-content hover:bg-surface-raised text-left"
                  >
                    <span className="w-2.5 h-2.5 rounded-full shrink-0 border border-subtle" />
                    {t('mission:waypointTable.group.unassigned')}
                  </button>
                  {fleetVehicles!.map((v) => (
                    <button
                      key={v.key}
                      onClick={() => { onAssignVehicle?.(v.key); setVehicleMenuOpen(false); }}
                      className={`w-full flex items-center gap-2 px-2.5 py-1.5 text-[11px] text-content hover:bg-surface-raised text-left ${v.key === assignedVehicleKey ? 'bg-surface-raised' : ''}`}
                    >
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                      <span className="truncate">{v.label}</span>
                    </button>
                  ))}
                </div>
              </>,
              document.body,
            )}
        </>
      )}
      {!readOnly && onSync && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (count > 0) onSync();
          }}
          disabled={count === 0}
          className={`shrink-0 w-6 h-6 flex items-center justify-center rounded transition-colors ${
            count === 0
              ? 'text-content-tertiary cursor-not-allowed'
              : 'text-emerald-300 hover:text-emerald-200 hover:bg-emerald-500/15'
          }`}
          data-tip={
            count === 0
              ? t('mission:waypointTable.group.syncEmpty')
              : connected
                ? t('mission:waypointTable.group.syncUpload')
                : t('mission:waypointTable.group.syncSave')
          }
        >
          {connected ? <Upload className="w-3.5 h-3.5" /> : <Save className="w-3.5 h-3.5" />}
        </button>
      )}
      {!readOnly && onEdit && !isEditing && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          className="shrink-0 flex items-center gap-1 px-1.5 h-6 rounded text-[11px] font-medium text-purple-300 bg-purple-500/15 hover:bg-purple-500/25 transition-colors"
          data-tip={t('mission:waypointTable.group.editSurveyTip')}
        >
          <Pencil className="w-3 h-3" />
          {t('common:edit')}
        </button>
      )}
      {!readOnly && onReplay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplay();
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-sky-300 hover:text-sky-200 hover:bg-sky-500/15 rounded transition-colors"
          data-tip={t('mission:waypointTable.group.replayTip')}
        >
          <Play className="w-3.5 h-3.5" />
        </button>
      )}
      {!readOnly && isStaleSurvey && onRegenerate && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRegenerate();
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-amber-300 hover:text-amber-200 hover:bg-amber-500/15 rounded transition-colors"
          data-tip={t('mission:waypointTable.group.regenerateTip')}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      )}
      {!readOnly && (
        <div className="shrink-0">
          <button
            ref={menuBtnRef}
            onClick={(e) => {
              e.stopPropagation();
              if (!menuOpen) {
                const r = menuBtnRef.current?.getBoundingClientRect();
                // Body-level portal anchored to the button so the menu isn't
                // clipped or out-stacked by the virtualized list's rows.
                if (r) setMenuPos({ top: r.bottom + 4, right: window.innerWidth - r.right });
              }
              setMenuOpen((v) => !v);
            }}
            className="w-5 h-5 flex items-center justify-center text-content-tertiary hover:text-content transition-colors rounded hover:bg-surface"
            data-tip={t('mission:waypointTable.group.actionsTip')}
          >
            <MoreHorizontal className="w-3.5 h-3.5" />
          </button>
          {menuOpen && menuPos &&
            createPortal(
              <>
                <div className="fixed inset-0 z-[9998]" onClick={() => setMenuOpen(false)} />
                <div
                  className="fixed z-[9999] min-w-[140px] bg-surface-solid border border-subtle rounded-lg shadow-2xl py-1"
                  style={{ top: menuPos.top, right: menuPos.right }}
                >
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      setEditing(true);
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                  >
                    {t('mission:waypointTable.group.rename')}
                  </button>
                  {onSelectWaypoints && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSelectWaypoints();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.selectWaypoints')}
                    </button>
                  )}
                  {flightEnd && onSetEndsFlight && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSetEndsFlight(!flightEnd.ends);
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {flightEnd.ends ? t('mission:waypointTable.group.continueNext') : t('mission:waypointTable.group.endFlightHere')}
                    </button>
                  )}
                  {onMoveUp && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onMoveUp();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.moveEarlier')}
                    </button>
                  )}
                  {onMoveDown && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onMoveDown();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.moveLater')}
                    </button>
                  )}
                  {onDistribute && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDistribute();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.distribute', { count: fleetVehicles?.length ?? 0 })}
                    </button>
                  )}
                  {onSaveArea && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onSaveArea();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.saveArea')}
                    </button>
                  )}
                  {onDuplicate && (
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDuplicate();
                      }}
                      className="w-full text-left px-3 py-1.5 text-xs text-content hover:bg-surface-raised transition-colors"
                    >
                      {t('mission:waypointTable.group.duplicate')}
                    </button>
                  )}
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-raised hover:text-red-300 transition-colors"
                  >
                    {t('mission:waypointTable.group.delete')}
                  </button>
                </div>
              </>,
              document.body,
            )}
        </div>
      )}
      </div>
      <div className="px-2 pb-1.5 pl-12 -mt-0.5 flex items-center gap-1.5 text-[10px] text-content-tertiary tabular-nums">
        <span className="uppercase tracking-wide">{group.kind}</span>
        {flightEnd && (
          <>
            <span
              className="px-1 rounded bg-purple-500/15 text-purple-300"
              title={flightEnd.legs > 1
                ? t('mission:waypointTable.group.legTip', { flight: flightEnd.flight, leg: flightEnd.leg, legs: flightEnd.legs })
                : t('mission:waypointTable.group.ownFlightTip', { flight: flightEnd.flight })}
            >
              {flightEnd.legs > 1
                ? t('mission:waypointTable.group.leg', { leg: flightEnd.leg, legs: flightEnd.legs })
                : t('mission:waypointTable.group.ownFlight')}
            </span>
            <span
              className={
                flightEnd.dangling
                  ? 'text-amber-400'
                  : flightEnd.ends ? 'text-content-tertiary' : 'text-purple-300'
              }
              title={flightEnd.dangling
                ? t('mission:waypointTable.group.danglingTip')
                : flightEnd.ends
                  ? t('mission:waypointTable.group.endsTip')
                  : t('mission:waypointTable.group.continuesTip')}
            >
              {flightEnd.dangling
                ? t('mission:waypointTable.group.noEnding')
                : flightEnd.ends ? t('mission:waypointTable.group.ends', { label: flightEnd.label }) : t('mission:waypointTable.group.continues')}
            </span>
          </>
        )}
        {stats && stats.distanceM > 0 && (
          <>
            <span>· {formatBlockDistance(stats.distanceM, distanceUnit)}</span>
            {stats.timeS > 0 && <span>· {formatBlockDuration(stats.timeS)}</span>}
            {/* i18n-exempt */}
            {stats.gsd != null && stats.gsd > 0 && <span>· {stats.gsd.toFixed(1)} cm/px</span>}
          </>
        )}
      </div>
    </div>
  );
}

/** One tint per flight, so consecutive flights read as separate blocks. */
const FLIGHT_BAND_COLORS = ['#a78bfa', '#38bdf8', '#34d399', '#fbbf24', '#f472b6', '#22d3ee'];

// Extracted waypoint list content (original WaypointTablePanel content)
function WaypointListContent({ readOnly = false }: { readOnly?: boolean }) {
  const { t } = useTranslation();
  const {
    missionItems,
    groups,
    selectedSeq,
    selectedGroupId,
    currentSeq,
    setSelectedSeq,
    setSelectedGroupId,
    updateWaypoint,
    removeWaypoint,
    removeWaypoints,
    bulkSetAltitude,
    bulkSetSpeed,
    addWaypoint,
    reorderWaypoints,
    renameGroup,
    setGroupColor,
    setGroupVehicle,
    clearMission,
    deleteGroup,
    deleteGroups,
    toggleGroupCollapsed,
    setGroupVisible,
    duplicateGroup,
    moveGroup,
    reorderGroups,
    connectSurveys,
    disconnectSurveys,
    regroupItems,
    setGroupEndsFlight,
    focusWaypoint,
    uploadGroup,
    uploadGroupToVehicle,
    saveGroupToFile,
    distributeGroupAcrossFleet,
    lastUploadedAt,
    lastUploadedGroupIds,
  } = useMissionStore();

  const libraryEnabled = useCargoEnabled(MISSION_LIBRARY_CARGO_SLUG);
  const saveGroupAsArea = useSurveyAreaStore((s) => s.saveGroupAsArea);
  const setSurveyGroupSource = useMissionStore((s) => s.setSurveyGroupSource);

  // Keep one survey on its own, straight from the group list: opening the
  // editor to reach a save button is not what "save this area" should cost.
  const saveSurveyGroupAsArea = useCallback(async (groupId: string) => {
    const group = useMissionStore.getState().groups.find((g) => g.id === groupId);
    if (!group || group.kind !== 'survey') return;
    const doc = await saveGroupAsArea(group, {
      name: group.name,
      ...(group.source ? { id: group.source.docId } : {}),
    });
    if (doc) setSurveyGroupSource(groupId, { docId: doc.id, revision: doc.revision, name: doc.name });
  }, [saveGroupAsArea, setSurveyGroupSource]);

  const surveyEditingGroupId = useSurveyStore((s) => s.editingGroupId);
  const surveyLoadFromGroup = useSurveyStore((s) => s.loadFromGroup);

  // Fleet/swarm: vehicles available to assign groups to, each with its identity
  // colour. The per-group picker only appears when 2+ vehicles are present.
  const fleetVehicles = useFleetVehicles();
  const colorOverrides = useVehicleAppearanceStore((s) => s.overrides);
  const fleetVehicleOptions = useMemo(
    () =>
      fleetVehicles.length >= 2
        ? fleetVehicles.map((v) => ({
            key: v.key,
            label: v.label,
            color: resolveVehicleColor(colorOverrides, v.key, v.sysid),
          }))
        : undefined,
    [fleetVehicles, colorOverrides],
  );

  // Pre-compute upload state per group id. Doing this once per render keeps
  // the GroupHeaderRow props cheap and avoids each header subscribing.
  const uploadedSet = useMemo(
    () => new Set(lastUploadedGroupIds),
    [lastUploadedGroupIds],
  );
  const computeOnVehicleState = useCallback(
    (g: Group): 'none' | 'on-vehicle' | 'stale-on-vehicle' => {
      if (!lastUploadedAt || !uploadedSet.has(g.id)) return 'none';
      return g.updatedAt > lastUploadedAt ? 'stale-on-vehicle' : 'on-vehicle';
    },
    [lastUploadedAt, uploadedSet],
  );

  const advancedLabels = useSettingsStore((s) => s.missionDefaults.advancedMissionLabels);
  const settingsFirmware = useSettingsStore((s) => s.missionDefaults.missionFirmware);
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const verticalSpeedUnit = useSettingsStore((s) => s.unitPreferences.verticalSpeed);
  const connectionState = useConnectionStore((s) => s.connectionState);

  const showSegmentColors = useSettingsStore((s) => s.missionDefaults.showSegmentColors);

  // Segment colors for sidebar indicators (matches map line colors)
  const itemColors = useMemo(() => computeItemColors(missionItems), [missionItems]);

  // Per-group waypoint numbers (1-based within each group), matching the map.
  const groupWaypointNumbers = useMemo(
    () => computeGroupWaypointNumbers(missionItems),
    [missionItems],
  );

  // Per-group flight stats (distance, time, GSD) shown in each group header,
  // mirroring the per-block readout pro survey planners expect.
  const groupStats = useMemo(() => {
    const itemsByGroup = new Map<string, MissionItem[]>();
    for (const it of missionItems) {
      if (!it.groupId) continue;
      const arr = itemsByGroup.get(it.groupId);
      if (arr) arr.push(it);
      else itemsByGroup.set(it.groupId, [it]);
    }
    const stats = new Map<string, { distanceM: number; timeS: number; gsd: number | null }>();
    for (const g of groups) {
      const items = itemsByGroup.get(g.id) ?? [];
      let distanceM = 0;
      let prev: { lat: number; lng: number } | null = null;
      for (const it of items) {
        if (it.latitude === 0 && it.longitude === 0) continue;
        const cur = { lat: it.latitude, lng: it.longitude };
        if (prev) distanceM += distanceLatLng(prev, cur);
        prev = cur;
      }
      // Speed: survey config first, then any DO_CHANGE_SPEED in the group.
      let speed = 0;
      let gsd: number | null = null;
      if (isSurveyGroup(g)) {
        const cfg = g.config as { speed?: number; altitude?: number; camera?: { sensorWidth: number; focalLength: number; imageWidth: number; manualCorridorWidth?: number } };
        if (typeof cfg.speed === 'number') speed = cfg.speed;
        const cam = cfg.camera;
        if (cam && !(cam.manualCorridorWidth && cam.manualCorridorWidth > 0) && typeof cfg.altitude === 'number') {
          gsd = calculateGSD(cam.sensorWidth, cam.focalLength, cam.imageWidth, cfg.altitude);
        }
      }
      if (speed <= 0) {
        const spd = items.find((it) => it.command === MAV_CMD.DO_CHANGE_SPEED && it.param2 > 0);
        if (spd) speed = spd.param2;
      }
      const timeS = speed > 0 ? distanceM / speed : 0;
      stats.set(g.id, { distanceM, timeS, gsd });
    }
    return stats;
  }, [missionItems, groups]);

  // Pre-flight validation, recomputed on any mission/group change.
  const strandedReturns = useMemo(
    () => midMissionReturns(missionItems, groups).length,
    [missionItems, groups],
  );
  const surveyGroupCount = useMemo(() => groups.filter((g) => g.kind === 'survey').length, [groups]);
  // Group-level selection, independent of the per-waypoint one: deleting three
  // survey groups meant opening three overflow menus.
  // Ordered, not a Set: ticking is how the pilot says what to connect AND in
  // what order, so the sequence of clicks has to survive.
  const [bulkGroupOrder, setBulkGroupOrder] = useState<string[]>([]);
  /**
   * Picking surveys straight off the list. 'connect' collects them in click
   * order and applies on Done; 'disconnect' acts on each click at once.
   */
  const [linkMode, setLinkMode] = useState<null | 'connect' | 'disconnect'>(null);
  const [linkPicks, setLinkPicks] = useState<string[]>([]);
  const bulkGroups = useMemo(() => new Set(bulkGroupOrder), [bulkGroupOrder]);

  const boundaries = useMemo(() => flightBoundaries(missionItems, groups), [missionItems, groups]);
  const endsByGroup = useMemo(
    () => new Map(boundaries.map((b) => [b.groupId, b])),
    [boundaries],
  );
  // Connect needs two surveys that are not already on the same flight.
  // Disconnect needs a flight carrying more than one survey. Anything else
  // and the button has nothing to do, so it is off.
  const flightsPresent = useMemo(
    () => new Set(boundaries.map((b) => b.flight)).size,
    [boundaries],
  );
  const connectable = boundaries.length >= 2 && flightsPresent >= 2;
  const detachable = useMemo(
    () => boundaries.filter((b) => b.legs > 1).length,
    [boundaries],
  );
  // A group whose waypoints are not contiguous: the route jumps between two
  // survey areas leg after leg, which is never what anyone planned.
  const interleaved = useMemo(() => {
    const seen = new Set<string>();
    let last: string | undefined;
    for (const it of [...missionItems].sort((a, b) => a.seq - b.seq)) {
      if (!it.groupId || it.groupId === last) continue;
      if (seen.has(it.groupId)) return true;
      seen.add(it.groupId);
      last = it.groupId;
    }
    return false;
  }, [missionItems]);
  const flightCount = useMemo(
    () => new Set(boundaries.map((b) => b.flight)).size,
    [boundaries],
  );
  // Tick some group rows and the buttons act on those only; tick none and they
  // act on the whole plan.
  const pickedSurveyIds = useMemo(
    () => bulkGroupOrder.filter((id) => boundaries.some((b) => b.groupId === id)),
    [boundaries, bulkGroupOrder],
  );

  const [draggedGroupId, setDraggedGroupId] = useState<string | null>(null);
  const [groupDropTarget, setGroupDropTarget] = useState<string | null>(null);

  /** Which flight a group belongs to, for constraining a drag to one of them. */
  const flightOf = useCallback(
    (id: string) => endsByGroup.get(id)?.flight,
    [endsByGroup],
  );

  /**
   * Reordering is within one flight: dragging a survey into another flight
   * would change what is connected to what, which is Connect's job.
   */
  const canDropOn = useCallback(
    (targetId: string) => {
      if (!draggedGroupId || draggedGroupId === targetId) return false;
      const from = flightOf(draggedGroupId);
      const to = flightOf(targetId);
      // Groups outside any flight (manual, imported) reorder freely.
      if (from === undefined || to === undefined) return true;
      return from === to;
    },
    [draggedGroupId, flightOf],
  );

  /** Drop the dragged group into the slot the hovered row occupies. */
  const dropGroupOn = useCallback((targetId: string) => {
    const dragged = draggedGroupId;
    setDraggedGroupId(null);
    setGroupDropTarget(null);
    if (!dragged || dragged === targetId || !canDropOn(targetId)) return;
    const sorted = [...groups].sort((a, b) => a.order - b.order);
    const from = sorted.findIndex((g) => g.id === dragged);
    const to = sorted.findIndex((g) => g.id === targetId);
    if (from < 0 || to < 0) return;
    // Dropping downward lands it after the row it was dropped on, which is
    // what the drop line above the next row already showed.
    reorderGroups(dragged, from < to ? to : to);
  }, [draggedGroupId, groups, reorderGroups, canDropOn]);

  const linkPickOf = useCallback(
    (id: string) => {
      const i = linkPicks.indexOf(id);
      return i >= 0 ? i + 1 : undefined;
    },
    [linkPicks],
  );

  const handleLinkClick = useCallback((groupId: string) => {
    if (linkMode === 'disconnect') {
      setGroupEndsFlight(groupId, true);
      return;
    }
    setLinkPicks((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  }, [linkMode, setGroupEndsFlight]);

  const exitLinkMode = useCallback(() => {
    setLinkMode(null);
    setLinkPicks([]);
  }, []);

  const applyLinkPicks = useCallback(() => {
    if (linkPicks.length >= 2) connectSurveys(linkPicks);
    exitLinkMode();
  }, [linkPicks, connectSurveys, exitLinkMode]);

  useEffect(() => {
    if (!linkMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') exitLinkMode();
      if (e.key === 'Enter' && linkMode === 'connect') applyLinkPicks();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [linkMode, exitLinkMode, applyLinkPicks]);

  const pickOrderOf = useCallback(
    (id: string) => {
      if (pickedSurveyIds.length < 2) return undefined;
      const i = pickedSurveyIds.indexOf(id);
      return i >= 0 ? i + 1 : undefined;
    },
    [pickedSurveyIds],
  );

  const flightEndFor = useCallback((group: Group) => {
    if (group.kind !== 'survey' || boundaries.length < 2) return undefined;
    const b = endsByGroup.get(group.id);
    if (!b) return undefined;
    return {
      ends: b.ends,
      label: b.endCommand && COMMAND_NAMES[b.endCommand] ? missionCommandLabel(b.endCommand) : 'RTL',
      flight: b.flight,
      leg: b.leg,
      legs: b.legs,
      flights: flightCount,
      dangling: b.danglingEnd,
      color: FLIGHT_BAND_COLORS[(b.flight - 1) % FLIGHT_BAND_COLORS.length]!,
    };
  }, [boundaries, endsByGroup, flightCount]);

  const showFlownPath = useSettingsStore((s) => s.missionDefaults.showFlownPath);
  const flownPathBankDeg = useSettingsStore((s) => s.missionDefaults.flownPathBankDeg);
  const surveyConfig = useSurveyStore((s) => s.config);
  const surveySwathWidth = useSurveyStore((s) => s.config.corridorWidth ?? 60);

  // Bends the aircraft cuts so deep the camera misses the ground: the red
  // rings on the map, named here so a waypoint says why it is circled.
  const coverageGapBySeq = useMemo(() => {
    const byIndex = new Map<number, CornerCut>();
    if (!showFlownPath) return byIndex;
    const placed = missionItems
      .filter((it) => commandHasLocation(it.command) && (it.latitude !== 0 || it.longitude !== 0))
      .sort((a, b) => a.seq - b.seq);
    if (placed.length < 3) return byIndex;
    const { speedMs } = planSpeed({ ...surveyConfig, polygon: [] });
    const { cuts } = predictFlownPath(
      placed.map((it) => ({ lat: it.latitude, lng: it.longitude })),
      turnRadiusFor(speedMs, flownPathBankDeg),
    );
    for (const cut of coverageGaps(cuts, surveySwathWidth)) {
      const at = placed[cut.index];
      if (at) byIndex.set(at.seq, cut);
    }
    return byIndex;
  }, [showFlownPath, missionItems, surveyConfig, surveySwathWidth, flownPathBankDeg]);
  const coverageGapAt = useCallback((seq: number) => coverageGapBySeq.get(seq), [coverageGapBySeq]);
  const validation = useMemo(
    () => validateMission(missionItems, groups, {
      isAir: true,
      altitudeUnit,
      midMissionReturns: flownSeparately(groups) ? 0 : strandedReturns,
    }),
    [missionItems, groups, altitudeUnit, strandedReturns],
  );

  const effectiveFirmware = effectiveMissionFirmware(connectionState, settingsFirmware);

  const [draggedSeq, setDraggedSeq] = useState<number | null>(null);
  const [dropTargetSeq, setDropTargetSeq] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set());

  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [lastCheckedSeq, setLastCheckedSeq] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

  // Any structural change to missionItems (single delete, reorder, add, refresh)
  // can shift the seq numbers our checkbox set refers to. The safe thing is to
  // drop the multi-selection — better than silently selecting the wrong rows.
  // The bulk delete handler clears multiSelected itself first, so this no-ops
  // for its own changes.
  const prevMissionLengthRef = useRef(missionItems.length);
  useEffect(() => {
    if (prevMissionLengthRef.current !== missionItems.length) {
      prevMissionLengthRef.current = missionItems.length;
      if (multiSelected.size > 0) {
        setMultiSelected(new Set());
        setLastCheckedSeq(null);
      }
    }
  }, [missionItems.length, multiSelected.size]);

  // Pre-compute parent-child group structure
  const groupInfo = useMemo(() => {
    const parentOf = new Map<number, number>(); // childSeq -> parentSeq
    const childCountOf = new Map<number, number>(); // parentSeq -> number of children
    let currentParent: number | null = null;

    for (const item of missionItems) {
      const child = !isNavigationCommand(item.command) || item.command === MAV_CMD.NAV_DELAY;
      if (!child) {
        currentParent = item.seq;
        childCountOf.set(item.seq, 0);
      } else if (currentParent !== null) {
        parentOf.set(item.seq, currentParent);
        childCountOf.set(currentParent, (childCountOf.get(currentParent) ?? 0) + 1);
      }
    }

    return { parentOf, childCountOf };
  }, [missionItems]);

  // Group-level lookups for the header rows. `groupById` keeps O(1) lookup
  // from a wp's groupId; `itemCountByGroup` powers the "N WPs" header label
  // even when WPs are hidden by collapse.
  const groupById = useMemo(() => {
    const m = new Map<string, Group>();
    for (const g of groups) m.set(g.id, g);
    return m;
  }, [groups]);

  const itemCountByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const wp of missionItems) {
      if (!wp.groupId) continue;
      m.set(wp.groupId, (m.get(wp.groupId) ?? 0) + 1);
    }
    return m;
  }, [missionItems]);

  const groupOrder = useMemo(
    () => [...groups].sort((a, b) => a.order - b.order).map((g) => g.id),
    [groups],
  );
  const groupPosition = useCallback(
    (id: string) => {
      const i = groupOrder.indexOf(id);
      return { canMoveUp: i > 0, canMoveDown: i >= 0 && i < groupOrder.length - 1 };
    },
    [groupOrder],
  );

  // Header seq per group, so a group split by a foreign item (a hand-placed
  // waypoint landing inside a survey's range) still gets one header. Keying
  // off the previous row's groupId listed the group once per run, and each
  // one showed the group's full totals, which reads as a duplicate.
  const headerSeqByGroup = useMemo(() => {
    const m = new Map<string, number>();
    for (const wp of missionItems) {
      if (!wp.groupId || m.has(wp.groupId)) continue;
      m.set(wp.groupId, wp.seq);
    }
    return m;
  }, [missionItems]);

  // Survey groups whose generatorResult can drive the plan-replay animation.
  // hasReplayData fully validates the opaque blob, so compute once per groups
  // change instead of per header render.
  const replayableGroupIds = useMemo(() => {
    const s = new Set<string>();
    for (const g of groups) {
      if (isSurveyGroup(g) && hasReplayData(g.generatorResult)) s.add(g.id);
    }
    return s;
  }, [groups]);

  const toggleCollapse = useCallback((parentSeq: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(parentSeq)) next.delete(parentSeq);
      else next.add(parentSeq);
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    const parentSeqs = missionItems
      .filter(item => isNavigationCommand(item.command) && item.command !== MAV_CMD.NAV_DELAY)
      .map(item => item.seq);
    setCollapsedGroups(new Set(parentSeqs));
  }, [missionItems]);

  const expandAll = useCallback(() => {
    setCollapsedGroups(new Set());
  }, []);

  // In readOnly mode, don't show selection for editing
  const selectedWaypoint = readOnly ? null : missionItems.find(wp => wp.seq === selectedSeq);

  const handleRowClick = (seq: number) => {
    setSelectedSeq(seq);
  };

  const handleCommandChange = (seq: number, newCommand: number) => {
    updateWaypoint(seq, { command: newCommand });
  };

  const handleParamChange = (seq: number, key: keyof MissionItem, value: number) => {
    updateWaypoint(seq, { [key]: value });
  };

  const handleDelete = (seq: number) => {
    removeWaypoint(seq);
  };

  // Toggle one waypoint's checkbox. Shift-click selects the range from the
  // previously checked row to the current row (inclusive), so users can
  // bulk-select large mission segments quickly.
  const handleCheckboxToggle = (seq: number, e: React.MouseEvent) => {
    const shiftKey = e.shiftKey;
    setMultiSelected(prev => {
      const next = new Set(prev);
      if (shiftKey && lastCheckedSeq !== null && lastCheckedSeq !== seq) {
        const seqs = missionItems.map(w => w.seq);
        const a = seqs.indexOf(lastCheckedSeq);
        const b = seqs.indexOf(seq);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a <= b ? [a, b] : [b, a];
          // Mirror the action of the anchor row: if it's currently selected,
          // shift-click extends selection; otherwise it extends deselection.
          const shouldSelect = prev.has(lastCheckedSeq);
          for (let i = lo; i <= hi; i++) {
            const s = seqs[i];
            if (s === undefined) continue;
            if (shouldSelect) next.add(s);
            else next.delete(s);
          }
        }
      } else {
        if (next.has(seq)) next.delete(seq);
        else next.add(seq);
      }
      return next;
    });
    setLastCheckedSeq(seq);
  };

  const handleDeleteSelected = () => {
    if (multiSelected.size === 0) return;
    removeWaypoints([...multiSelected]);
    setMultiSelected(new Set());
    setLastCheckedSeq(null);
  };

  const handleSelectAll = () => {
    setMultiSelected(new Set(missionItems.map(w => w.seq)));
  };

  const handleClearSelection = () => {
    setMultiSelected(new Set());
    setLastCheckedSeq(null);
  };

  const selectGroupWaypoints = (groupId: string) => {
    setMultiSelected((prev) => {
      const next = new Set(prev);
      for (const it of missionItems) if (it.groupId === groupId) next.add(it.seq);
      return next;
    });
  };

  const [bulkPopover, setBulkPopover] = useState<'altitude' | 'speed' | null>(null);
  const [bulkAltMeters, setBulkAltMeters] = useState(50);
  const [bulkSpeedMs, setBulkSpeedMs] = useState(5);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  const bulkNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showBulkNotice = (text: string) => {
    setBulkNotice(text);
    if (bulkNoticeTimer.current) clearTimeout(bulkNoticeTimer.current);
    bulkNoticeTimer.current = setTimeout(() => setBulkNotice(null), 3000);
  };
  useEffect(() => () => {
    if (bulkNoticeTimer.current) clearTimeout(bulkNoticeTimer.current);
  }, []);

  // Survey regeneration rebuilds items from config, overwriting manual bulk edits.
  const selectionInSurvey = useMemo(() => {
    if (multiSelected.size === 0 || bulkPopover === null) return false;
    const surveyIds = new Set<string>();
    for (const g of groups) {
      if (!isSurveyGroup(g)) continue;
      surveyIds.add(g.id);
      for (const c of g.distribution?.chunks ?? []) surveyIds.add(c.groupId);
    }
    return selectionTouchesGroups(missionItems, multiSelected, surveyIds);
  }, [multiSelected, bulkPopover, groups, missionItems]);

  const openBulkPopover = (kind: 'altitude' | 'speed') => {
    const first = missionItems.find((it) => multiSelected.has(it.seq));
    if (kind === 'altitude' && first) setBulkAltMeters(first.altitude || 50);
    setBulkPopover(kind);
  };

  const handleBulkAltitude = () => {
    const changed = bulkSetAltitude([...multiSelected], bulkAltMeters);
    setBulkPopover(null);
    handleClearSelection();
    showBulkNotice(t('mission:waypointTable.list.bulkAltDone', { count: changed, alt: bulkAltMeters }));
  };

  const handleBulkSpeed = () => {
    const changed = bulkSetSpeed([...multiSelected], bulkSpeedMs);
    setBulkPopover(null);
    handleClearSelection();
    showBulkNotice(
      bulkSpeedMs <= 0
        ? t('mission:waypointTable.list.speedRemoved', { count: changed })
        : t('mission:waypointTable.list.speedSet', { count: changed, speed: bulkSpeedMs }),
    );
  };

  const [coordsCopied, setCoordsCopied] = useState(false);
  const [wpCoordCopied, setWpCoordCopied] = useState(false);
  const toggleBulkGroup = useCallback((groupId: string) => {
    setBulkGroupOrder((prev) =>
      prev.includes(groupId) ? prev.filter((id) => id !== groupId) : [...prev, groupId]);
  }, []);

  const handleDeleteBulkGroups = useCallback(() => {
    if (bulkGroupOrder.length === 0) return;
    deleteGroups(bulkGroupOrder);
    setBulkGroupOrder([]);
  }, [bulkGroupOrder, deleteGroups]);

  const handleCopyCoords = () => {
    const source = multiSelected.size > 0
      ? missionItems.filter(w => multiSelected.has(w.seq))
      : missionItems;
    const lines = source
      .filter(w => commandHasLocation(w.command) && hasValidCoordinates(w.latitude, w.longitude))
      .map(w => `${w.latitude.toFixed(7)}, ${w.longitude.toFixed(7)}`);
    if (lines.length === 0) return;
    navigator.clipboard.writeText(lines.join('\n'));
    setCoordsCopied(true);
    window.setTimeout(() => setCoordsCopied(false), 1200);
  };

  const handleAddWaypoint = () => {
    const lastWp = missionItems[missionItems.length - 1];
    const gpsState = getGpsState();
    const homePosition = useMissionStore.getState().homePosition;

    // Use last waypoint, then GPS, then home position (required by addWaypoint anyway)
    const baseLat = lastWp?.latitude ?? (gpsState.hasGpsFix ? gpsState.lat : homePosition?.lat ?? 0);
    const baseLon = lastWp?.longitude ?? (gpsState.hasGpsFix ? gpsState.lon : homePosition?.lon ?? 0);
    const alt = lastWp?.altitude ?? 100;

    // Offset slightly from base position so new WP doesn't stack exactly on top
    const lat = baseLat + 0.001;
    const lon = baseLon + 0.001;

    addWaypoint(lat, lon, alt);
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, seq: number) => {
    setDraggedSeq(seq);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(seq));
  };

  const handleDragOver = (e: React.DragEvent, seq: number) => {
    e.preventDefault();
    if (draggedSeq !== null && draggedSeq !== seq) {
      setDropTargetSeq(seq);
    }
  };

  const handleDragLeave = () => {
    setDropTargetSeq(null);
  };

  const handleDrop = (e: React.DragEvent, targetSeq: number) => {
    e.preventDefault();
    if (draggedSeq !== null && draggedSeq !== targetSeq) {
      reorderWaypoints(draggedSeq, targetSeq);
    }
    setDraggedSeq(null);
    setDropTargetSeq(null);
  };

  const handleDragEnd = () => {
    setDraggedSeq(null);
    setDropTargetSeq(null);
  };

  const getCommandName = (cmd: number) => missionCommandLabel(cmd);
  const getCommandInfo = (cmd: number) => ALL_AVAILABLE_COMMANDS.find(c => c.value === cmd);

  // Virtualization for large missions. Collapsed children don't render, so we
  // virtualize over the list of ACTUALLY-rendered indices (otherwise measured
  // heights would be wrong). Below the threshold we render the list normally so
  // typical missions behave exactly as before.
  const VIRTUALIZE_THRESHOLD = 250;
  const collapsedGroupIds = useMemo(
    () => new Set(groups.filter((g) => g.collapsed).map((g) => g.id)),
    [groups],
  );
  const renderableIndices = useMemo(
    () => computeRenderableIndices(missionItems, collapsedGroups, collapsedGroupIds),
    [missionItems, collapsedGroups, collapsedGroupIds],
  );
  const useVirtual = renderableIndices.length > VIRTUALIZE_THRESHOLD;
  // Rows are positioned purely from the deterministic per-row estimate - no
  // measureElement. Dynamic DOM measurement feeds measured-size deltas back
  // into the virtualizer during commit (resizeItem -> notify -> re-render ->
  // more refs measured), and that feedback crashed this panel twice with
  // "Maximum update depth exceeded" on large surveys - once via scroll
  // corrections, once via scroll-to-selected reconciliation. Row heights here
  // are uniform per kind, so measurement bought pixel-perfection we don't
  // need at the price of a loop we can't afford. Below VIRTUALIZE_THRESHOLD
  // the list renders normally and stays exact.
  const estimateRowSize = (vi: number): number => {
    const idx = renderableIndices[vi];
    const wp = idx === undefined ? undefined : missionItems[idx];
    if (!wp || idx === undefined) return 52;
    const group = wp.groupId ? groupById.get(wp.groupId) : undefined;
    // Generous so the estimate is >= the real height: a too-small estimate would
    // overlap rows, while a slightly large one just adds a little spacing.
    // Survey rows are uniform, so cumulative drift is negligible.
    return estimateRowHeight({
      isChild: !isNavigationCommand(wp.command) || wp.command === MAV_CMD.NAV_DELAY,
      hasHeader: wp.groupId !== undefined && headerSeqByGroup.get(wp.groupId) === wp.seq,
      inCollapsedGroup: group?.collapsed === true,
    });
  };
  const rowVirtualizer = useVirtualizer({
    count: renderableIndices.length,
    getScrollElement: () => tableRef.current,
    estimateSize: estimateRowSize,
    overscan: 15,
  });
  // Keep the selection reachable when it comes from outside the list (map or
  // profile click): in virtual mode off-window rows do not exist in the DOM,
  // so move the window to the selected row. align 'auto' is a no-op when the
  // row is already visible, so clicking a row in the list does not jump.
  useEffect(() => {
    if (!useVirtual || selectedSeq === null) return;
    const vi = renderableIndexOfSeq(missionItems, renderableIndices, selectedSeq);
    if (vi >= 0) rowVirtualizer.scrollToIndex(vi, { align: 'auto' });
    // Only selection changes trigger a scroll; list edits and virtualizer
    // updates must not re-run this or the list would fight user scrolling.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSeq, useVirtual]);
  // Canonical react-virtual rendering: render ONLY the current window from
  // getVirtualItems(). The previous approach mapped over all items and null-ed
  // the off-window ones, which re-attached measureElement refs on every commit
  // and drove an infinite measure -> resize -> setState loop ("Maximum update
  // depth exceeded") that crashed the panel on large (20k+) missions. Below the
  // virtualize threshold we render every renderable row, exactly as before.
  const rowsToRender: { idx: number; v: { key: React.Key; index: number; start: number } | null }[] =
    useVirtual
      ? rowVirtualizer.getVirtualItems().flatMap((vi) => {
          const idx = renderableIndices[vi.index];
          return idx === undefined ? [] : [{ idx, v: { key: vi.key, index: vi.index, start: vi.start } }];
        })
      : missionItems.map((_, idx) => ({ idx, v: null }));

  return (
    <div className="h-full flex flex-col bg-surface">
      {/* Header: collapse/expand or, when multi-selected, bulk actions */}
      {missionItems.length > 0 && (
        <div className="relative shrink-0 px-3 py-1.5 border-b border-subtle flex items-center justify-between">
          {!readOnly && bulkGroups.size > 0 ? (
            <>
              <span className="text-[10px] text-content-secondary">
                {t('mission:waypointTable.list.groupsSelected', { count: bulkGroups.size })}
                {pickedSurveyIds.length > 1 && (
                  <span className="text-purple-300">
                    {t('mission:waypointTable.list.connectOrder', { order: pickedSurveyIds
                      .map((id) => groups.find((g) => g.id === id)?.name ?? '?')
                      .join(' → ') })}
                  </span>
                )}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setBulkGroupOrder(
                    [...groups].sort((a, b) => a.order - b.order).map((g) => g.id),
                  )}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.selectEveryGroup')}
                >
                  {t('mission:waypointTable.list.selectAll')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => setBulkGroupOrder([])}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.clearGroupSelection')}
                >
                  {t('mission:waypointTable.list.clear')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleDeleteBulkGroups}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  title={t('mission:waypointTable.list.deleteGroupsTip', { count: bulkGroups.size })}
                >
                  {t('mission:waypointTable.list.deleteGroups')}
                </button>
              </div>
            </>
          ) : !readOnly && multiSelected.size > 0 ? (
            <>
              <span className="text-[10px] text-content-secondary">
                {t('mission:waypointTable.list.selectedOf', { count: multiSelected.size, total: missionItems.length })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.selectAllWaypoints')}
                >
                  {t('mission:waypointTable.list.selectAll')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleClearSelection}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.clearSelection')}
                >
                  {t('mission:waypointTable.list.clear')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleCopyCoords}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  data-tip={t('mission:waypointTable.list.copySelectedTip')}
                >
                  {coordsCopied ? t('mission:waypointTable.list.copied') : t('mission:waypointTable.list.copyCoords')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => openBulkPopover('altitude')}
                  className={`text-[10px] font-medium transition-colors ${
                    bulkPopover === 'altitude' ? 'text-blue-400' : 'text-blue-400/80 hover:text-blue-300'
                  }`}
                  data-tip={t('mission:waypointTable.list.setAltTip', { count: multiSelected.size })}
                >
                  {t('common:altitude')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={() => openBulkPopover('speed')}
                  className={`text-[10px] font-medium transition-colors ${
                    bulkPopover === 'speed' ? 'text-blue-400' : 'text-blue-400/80 hover:text-blue-300'
                  }`}
                  data-tip={t('mission:waypointTable.list.setSpeedTip')}
                >
                  {t('common:speed')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleDeleteSelected}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  title={t('mission:waypointTable.list.deleteSelectedTip', { count: multiSelected.size })}
                >
                  {t('mission:waypointTable.list.deleteSelected')}
                </button>
              </div>
            </>
          ) : (
            <>
              <span className={`text-[10px] ${bulkNotice ? 'text-emerald-400' : 'text-content-secondary'}`}>
                {bulkNotice ?? t('mission:waypointTable.list.itemCount', { count: missionItems.length })}
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCopyCoords}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  data-tip={t('mission:waypointTable.list.copyAllTip')}
                >
                  {coordsCopied ? t('mission:waypointTable.list.copied') : t('mission:waypointTable.list.copyCoords')}
                </button>
                {interleaved && !readOnly && (
                  <>
                    <span className="text-content-tertiary text-[10px]">|</span>
                    <button
                      onClick={() => regroupItems()}
                      className="text-[10px] text-amber-400 hover:text-amber-300 transition-colors"
                      title={t('mission:waypointTable.list.repairOrderTip')}
                    >
                      {t('mission:waypointTable.list.repairOrder')}
                    </button>
                  </>
                )}
                {surveyGroupCount >= 2 && !readOnly && (
                  <>
                    <span className="text-content-tertiary text-[10px]">|</span>
                    <button
                      onClick={() => { setLinkPicks([]); setLinkMode('connect'); }}
                      disabled={!connectable}
                      className={`text-[10px] transition-colors ${
                        !connectable
                          ? 'text-content-tertiary cursor-default'
                          : 'text-purple-300 hover:text-purple-200'
                      }`}
                      title={!connectable
                        ? boundaries.length < 2
                          ? t('mission:waypointTable.list.onlyOneSurvey')
                          : t('mission:waypointTable.list.allSameFlight')
                        : t('mission:waypointTable.list.connectTip')}
                    >
                      {t('mission:waypointTable.list.connect')}
                    </button>
                    <span className="text-content-tertiary text-[10px]">/</span>
                    <button
                      onClick={() => { setLinkPicks([]); setLinkMode('disconnect'); }}
                      disabled={detachable === 0}
                      className={`text-[10px] transition-colors ${
                        detachable === 0
                          ? 'text-content-tertiary cursor-default'
                          : 'text-purple-300 hover:text-purple-200'
                      }`}
                      title={detachable === 0
                        ? t('mission:waypointTable.list.noneConnected')
                        : t('mission:waypointTable.list.disconnectTip')}
                    >
                      {t('mission:waypointTable.list.disconnect')}
                    </button>
                  </>
                )}
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={collapseAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.collapseAllTip')}
                >
                  {t('mission:waypointTable.list.collapseAll')}
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={expandAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title={t('mission:waypointTable.list.expandAllTip')}
                >
                  {t('mission:waypointTable.list.expandAll')}
                </button>
                {!readOnly && missionItems.length > 0 && (
                  <>
                    <span className="text-content-tertiary text-[10px]">|</span>
                    {/* Two-step rather than a modal: destructive, but this bar is
                        transient and a dialog here would be heavier than the action. */}
                    <button
                      onClick={() => {
                        if (confirmDeleteAll) {
                          clearMission();
                          setConfirmDeleteAll(false);
                        } else {
                          setConfirmDeleteAll(true);
                        }
                      }}
                      onBlur={() => setConfirmDeleteAll(false)}
                      className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                      data-tip={t('mission:waypointTable.list.deleteAllTip')}
                    >
                      {confirmDeleteAll
                        ? t('mission:waypointTable.list.deleteAllConfirm', { count: missionItems.length })
                        : t('mission:waypointTable.list.deleteAll')}
                    </button>
                  </>
                )}
              </div>
            </>
          )}
          {!readOnly && bulkPopover && multiSelected.size > 0 && (
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setBulkPopover(null)} />
              <div className="absolute right-2 top-full mt-1 z-[9999] w-60 bg-surface-solid border border-subtle rounded-lg shadow-2xl p-3">
                <div className="text-xs font-medium text-content mb-2">
                  {bulkPopover === 'altitude'
                    ? t('mission:waypointTable.list.altFor', { count: multiSelected.size })
                    : t('mission:waypointTable.list.speedFor', { count: multiSelected.size })}
                </div>
                <div className="flex items-center gap-2">
                  <div
                    className="flex-1 min-w-0"
                    data-tip={
                      bulkPopover === 'speed'
                        ? t('mission:waypointTable.list.speedZeroTip')
                        : undefined
                    }
                  >
                    {bulkPopover === 'altitude' ? (
                      <DraftNumberInput value={bulkAltMeters} onCommit={setBulkAltMeters} min={-500} max={10000} step={1} />
                    ) : (
                      <DraftNumberInput value={bulkSpeedMs} onCommit={setBulkSpeedMs} min={0} max={200} step={0.5} />
                    )}
                  </div>
                  <span className="text-[10px] text-content-secondary shrink-0">
                    {bulkPopover === 'altitude' ? 'm' : 'm/s'}
                  </span>
                  <button
                    onClick={bulkPopover === 'altitude' ? handleBulkAltitude : handleBulkSpeed}
                    className="shrink-0 px-2.5 py-1 rounded-md text-xs font-medium bg-blue-500/15 text-blue-400 border border-blue-500/30 hover:bg-blue-500/25 transition-colors"
                  >
                    {t('common:apply')}
                  </button>
                </div>
                {bulkPopover === 'altitude' && (
                  <p className="mt-1.5 text-[10px] text-content-tertiary">
                    {t('mission:waypointTable.list.altFramesNote')}
                  </p>
                )}
                {selectionInSurvey && (
                  <p className="mt-1.5 text-[10px] text-amber-400">
                    {t('mission:waypointTable.list.surveyEditWarning')}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {linkMode && (
        <div className="border-b border-subtle shrink-0 px-2 py-1.5 bg-purple-500/10 flex items-center gap-2">
          <span className="text-[11px] text-purple-200 flex-1 min-w-0 truncate">
            {linkMode === 'connect'
              ? linkPicks.length === 0
                ? t('mission:waypointTable.list.linkConnectHint')
                : linkPicks
                    .map((id, i) => `${i + 1}. ${groups.find((g) => g.id === id)?.name ?? '?'}`)
                    .join('   →   ')
              : t('mission:waypointTable.list.linkSplitHint')}
          </span>
          {linkMode === 'connect' && (
            <button
              onClick={applyLinkPicks}
              disabled={linkPicks.length < 2}
              className={`shrink-0 px-2 py-0.5 text-[10px] rounded-md transition-colors ${
                linkPicks.length < 2
                  ? 'bg-surface-raised text-content-tertiary cursor-default'
                  : 'bg-purple-600 text-white hover:bg-purple-500'
              }`}
            >
              {t('mission:waypointTable.list.done')}
            </button>
          )}
          <button
            onClick={exitLinkMode}
            className="shrink-0 px-2 py-0.5 text-[10px] rounded-md bg-surface-raised text-content-secondary hover:text-content transition-colors"
          >
            {linkMode === 'connect' ? t('common:cancel') : t('mission:waypointTable.list.finish')}
          </button>
        </div>
      )}

      {/* Pre-flight validation strip */}
      {!readOnly && missionItems.length > 0 && (
        <div className="border-b border-subtle shrink-0">
          <MissionValidationBadge
            result={validation}
            onAction={(action) => {
              if (action === 'connect-surveys') connectSurveys();
            }}
          />
        </div>
      )}

      {/* Waypoint list */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        {missionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-content-secondary p-4">
            <svg className="w-12 h-12 mb-3 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {readOnly ? (
              <>
                <p className="text-sm font-medium mb-1">{t('mission:waypointTable.list.noMission')}</p>
                <p className="text-xs text-content-tertiary text-center">{t('mission:waypointTable.list.noMissionOnFc')}</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">{t('mission:waypointTable.list.noWaypoints')}</p>
                <p className="text-xs text-content-tertiary text-center">{t('mission:waypointTable.list.noWaypointsHint')}</p>
              </>
            )}
          </div>
        ) : (
          <div
            className={useVirtual ? 'relative' : 'divide-y divide-subtle'}
            style={useVirtual ? { height: rowVirtualizer.getTotalSize() } : undefined}
          >
            {rowsToRender.map(({ idx, v }) => {
              const wp = missionItems[idx]!;
              // Wrap in an absolutely-positioned, measured container when
              // virtualizing; pass through unchanged otherwise.
              const wrap = (node: React.ReactNode): React.ReactNode =>
                v
                  ? (
                    <div
                      key={v.key}
                      data-index={v.index}
                      style={{ position: 'absolute', top: 0, left: 0, width: '100%', transform: `translateY(${v.start}px)` }}
                    >
                      {node}
                    </div>
                  )
                  : node;
              const isSelected = wp.seq === selectedSeq;
              const isCurrent = wp.seq === currentSeq;
              const isDragging = wp.seq === draggedSeq;
              const isDropTarget = wp.seq === dropTargetSeq;
              const isChild = !isNavigationCommand(wp.command) || wp.command === MAV_CMD.NAV_DELAY;
              const segColor = showSegmentColors && !isCurrent && !(isSelected && !readOnly)
                ? (itemColors.get(wp.seq) ?? SEGMENT_COLORS.default)
                : undefined;
              // Add micro gap before parent nav rows (except the first item)
              const isParentWithGap = !isChild && idx > 0;

              // Collapse logic: hide children of collapsed parents
              const parentSeq = groupInfo.parentOf.get(wp.seq);
              if (isChild && parentSeq !== undefined && collapsedGroups.has(parentSeq)) {
                return null;
              }

              // Parent collapse info
              const childCount = !isChild ? (groupInfo.childCountOf.get(wp.seq) ?? 0) : 0;
              const isCollapsed = !isChild && collapsedGroups.has(wp.seq);
              const hasChildren = childCount > 0;

              // Group header detection. We show a header before the first WP
              // of each group. When the group is collapsed, only the header
              // renders for that span; subsequent items return null.
              const showGroupHeader = wp.groupId !== undefined && headerSeqByGroup.get(wp.groupId) === wp.seq;
              const group = wp.groupId ? groupById.get(wp.groupId) : undefined;
              const hideByGroupCollapse = group?.collapsed === true;
              // Assignments store the vehicle key of the moment; transport ids
              // rotate on engine restart, so resolve to the LIVE vehicle key
              // (sysid fallback) for both display and upload targeting.
              const liveAssignedKey = group?.assignedVehicleKey
                ? fleetVehicles.find((v) => isAssignedToVehicle(group.assignedVehicleKey, v))?.key
                  ?? group.assignedVehicleKey
                : undefined;
              const band = group ? flightEndFor(group) : undefined;
              const banded = !!band && boundaries.length > 1;
              const startsFlight = banded && band!.leg === 1;
              const headerNode =
                showGroupHeader && group ? (
                  <div
                    className={banded ? 'border-l-[3px] pl-2' : undefined}
                    style={banded
                      ? { borderLeftColor: band!.color, background: `${band!.color}1f` }
                      : undefined}
                  >
                    {startsFlight && (
                      <div
                        className="flex items-center gap-1.5 px-2 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider"
                        style={{ color: band!.color }}
                      >
                        <span
                          className="w-4 h-4 rounded-full text-white flex items-center justify-center text-[9px]"
                          style={{ background: band!.color }}
                        >
                          {band!.flight}
                        </span>
                        <span>{t('mission:waypointTable.list.flight', { n: band!.flight })}</span>
                        <span className="text-content-tertiary normal-case tracking-normal font-normal">
                          {band!.legs === 1
                            ? t('mission:waypointTable.list.onItsOwn')
                            : t('mission:waypointTable.list.surveysConnected', { count: band!.legs })}
                        </span>
                      </div>
                    )}
                  <GroupHeaderRow
                    group={group}
                    count={itemCountByGroup.get(group.id) ?? 0}
                    stats={groupStats.get(group.id)}
                    readOnly={readOnly}
                    isSelected={selectedGroupId === group.id}
                    isEditing={surveyEditingGroupId === group.id}
                    onVehicleState={computeOnVehicleState(group)}
                    onSelect={() => setSelectedGroupId(group.id)}
                    onToggleCollapse={() => toggleGroupCollapsed(group.id)}
                    onToggleVisible={() =>
                      setGroupVisible(group.id, !group.visible)
                    }
                    fleetVehicles={fleetVehicleOptions}
                    assignedVehicleKey={liveAssignedKey}
                    onDistribute={
                      fleetVehicleOptions &&
                      (itemCountByGroup.get(group.id) ?? 0) >= fleetVehicleOptions.length * 2
                        ? () => distributeGroupAcrossFleet(group.id, fleetVehicleOptions)
                        : undefined
                    }
                    onSelectWaypoints={
                      (itemCountByGroup.get(group.id) ?? 0) > 0
                        ? () => selectGroupWaypoints(group.id)
                        : undefined
                    }
                    onDuplicate={() => duplicateGroup(group.id)}
                    {...(libraryEnabled && group.kind === 'survey'
                      ? { onSaveArea: () => void saveSurveyGroupAsArea(group.id) }
                      : {})}
                    onMoveUp={groupPosition(group.id).canMoveUp ? () => moveGroup(group.id, 'up') : undefined}
                    onMoveDown={groupPosition(group.id).canMoveDown ? () => moveGroup(group.id, 'down') : undefined}
                    flightEnd={flightEndFor(group)}
                    flightColor={(flightEndFor(group)?.legs ?? 0) > 1 ? flightEndFor(group)?.color : undefined}
                    dragging={draggedGroupId === group.id}
                    dropBefore={groupDropTarget === group.id && draggedGroupId !== group.id}
                    onGroupDragStart={() => setDraggedGroupId(group.id)}
                    onGroupDragOver={(e) => {
                      if (!draggedGroupId) return;
                      e.preventDefault();
                      e.stopPropagation();
                      const ok = canDropOn(group.id);
                      e.dataTransfer.dropEffect = ok ? 'move' : 'none';
                      setGroupDropTarget(ok ? group.id : null);
                    }}
                    onGroupDrop={() => dropGroupOn(group.id)}
                    onGroupDragEnd={() => { setDraggedGroupId(null); setGroupDropTarget(null); }}
                  linkMode={group.kind === 'survey' ? linkMode : null}
                    linkPick={linkPickOf(group.id)}
                    onLinkClick={() => handleLinkClick(group.id)}
                    onSetEndsFlight={(ends) => setGroupEndsFlight(group.id, ends)}
                    onAssignVehicle={(vehicleKey) => {
                      setGroupVehicle(group.id, vehicleKey);
                      // Assigning a vehicle colours the group by that vehicle's
                      // identity colour, so the planner + telemetry map agree.
                      if (vehicleKey) {
                        const opt = fleetVehicleOptions?.find((o) => o.key === vehicleKey);
                        if (opt) setGroupColor(group.id, opt.color);
                      }
                    }}
                    onSync={() =>
                      liveAssignedKey
                        ? uploadGroupToVehicle(group.id, liveAssignedKey)
                        : connectionState.isConnected
                          ? uploadGroup(group.id)
                          : saveGroupToFile(group.id)
                    }
                    connected={connectionState.isConnected || !!liveAssignedKey}
                    onRename={(name) => renameGroup(group.id, name)}
                    onSetColor={(color) => setGroupColor(group.id, color)}
                    onDelete={() => deleteGroup(group.id)}
                    bulkSelected={bulkGroups.has(group.id)}
                    pickIndex={pickOrderOf(group.id)}
                    onToggleBulkSelected={() => toggleBulkGroup(group.id)}
                    distanceUnit={distanceUnit}
                    onRegenerate={
                      isSurveyGroup(group)
                        ? () => regenerateSurveyGroup(group.id)
                        : undefined
                    }
                    onReplay={
                      replayableGroupIds.has(group.id)
                        ? () => {
                            // Toggle: replaying this group again stops it.
                            const rs = useReplayStore.getState();
                            if (rs.groupId === group.id) rs.stopReplay();
                            else rs.startReplay(group.id);
                          }
                        : undefined
                    }
                    onEdit={
                      isSurveyGroup(group)
                        ? () => {
                            const sg = group as SurveyGroup;
                            surveyLoadFromGroup({
                              id: sg.id,
                              polygon: sg.polygon,
                              config: sg.config,
                            });
                          }
                        : undefined
                    }
                  />
                  </div>
                ) : null;

              if (hideByGroupCollapse) {
                // Render only the header (if any) and suppress the row.
                return wrap(<Fragment key={wp.seq}>{headerNode}</Fragment>);
              }

              return wrap((
                <Fragment key={wp.seq}>
                {headerNode}
                <div
                  onClick={() => !readOnly && handleRowClick(wp.seq)}
                  draggable={!readOnly}
                  onDragStart={(e) => !readOnly && handleDragStart(e, wp.seq)}
                  onDragOver={(e) => !readOnly && handleDragOver(e, wp.seq)}
                  onDragLeave={!readOnly ? handleDragLeave : undefined}
                  onDrop={(e) => !readOnly && handleDrop(e, wp.seq)}
                  onDragEnd={!readOnly ? handleDragEnd : undefined}
                  className={`group flex items-center gap-2 py-2 transition-colors ${
                    isChild ? 'px-2 pl-8' : 'px-2'
                  } ${
                    isParentWithGap ? 'mt-1' : ''
                  } ${
                    readOnly ? '' : 'cursor-pointer'
                  } ${
                    isDropTarget ? 'border-t-2 border-t-blue-500' : ''
                  } ${
                    isDragging
                      ? 'opacity-50 bg-surface'
                      : isCurrent
                      ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                      : isSelected && !readOnly
                      ? 'bg-blue-500/20 border-l-2 border-l-blue-500'
                      : isChild
                      ? 'border-l-2 border-l-subtle ml-[14px] hover:bg-surface'
                      : readOnly
                      ? 'border-l-2 border-l-transparent'
                      : 'hover:bg-surface border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Multi-select checkbox - hidden in readOnly mode */}
                  {!readOnly && (
                    <div
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCheckboxToggle(wp.seq, e);
                      }}
                      onMouseDown={(e) => e.stopPropagation()}
                      className="shrink-0 flex items-center justify-center w-5 h-5"
                      title={t('mission:waypointTable.list.shiftClickRange')}
                    >
                      <input
                        type="checkbox"
                        checked={multiSelected.has(wp.seq)}
                        onChange={() => { /* handled by wrapper onClick to capture shift */ }}
                        className="w-3.5 h-3.5 rounded border-subtle bg-surface-raised text-blue-500 focus:ring-1 focus:ring-blue-500 cursor-pointer"
                      />
                    </div>
                  )}

                  {/* Drag handle - hidden in readOnly mode */}
                  {!readOnly && (
                    <div className="text-content-tertiary cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                      </svg>
                    </div>
                  )}

                  {/* Collapse chevron for parent nav items with children */}
                  {!isChild && hasChildren ? (
                    <button
                      onClick={(e) => toggleCollapse(wp.seq, e)}
                      className="w-4 h-4 flex items-center justify-center text-content-secondary hover:text-content transition-colors shrink-0"
                      title={isCollapsed ? t('mission:waypointTable.list.expandItems', { count: childCount }) : t('mission:waypointTable.list.collapse')}
                    >
                      <svg className={`w-3 h-3 transition-transform ${isCollapsed ? '' : 'rotate-90'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ) : !isChild ? (
                    <div className="w-4" />
                  ) : null}

                  {/* Badge: numbered circle for nav commands, icon or dot for child commands */}
                  {isChild ? (
                    (() => {
                      const ChildIcon = getChildCommandIcon(wp.command, wp);
                      const intrinsicColor = getChildIconColor(wp.command);
                      const iconColor = isCurrent ? '#fb923c' : isSelected && !readOnly ? '#60a5fa' : segColor || intrinsicColor;
                      return (
                        <div className="w-5 h-5 rounded flex items-center justify-center shrink-0">
                          {ChildIcon ? (
                            <ChildIcon className="w-3.5 h-3.5" style={{ color: iconColor }} />
                          ) : (
                            <div
                              className={`w-1.5 h-1.5 rounded-full ${
                                isCurrent ? 'bg-orange-400' : isSelected && !readOnly ? 'bg-blue-400' : !segColor ? 'bg-content-secondary' : ''
                              }`}
                              style={segColor ? { backgroundColor: segColor } : undefined}
                            />
                          )}
                        </div>
                      );
                    })()
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-orange-500 text-white'
                          : isSelected && !readOnly
                          ? 'bg-blue-500 text-white'
                          : segColor
                          ? 'text-white'
                          : 'bg-surface-raised text-content'
                      }`}
                      style={segColor ? { backgroundColor: segColor } : undefined}
                    >
                      {groupWaypointNumbers.get(wp.seq) ?? wp.seq + 1}
                    </div>
                  )}

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className={`flex items-center gap-1.5 ${
                      isChild ? 'text-xs text-content-secondary' : 'text-sm text-content'
                    }`}>
                      {(() => {
                        const summary = getWaypointSummary(wp, advancedLabels, distanceUnit, altitudeUnit, speedUnit, verticalSpeedUnit, t);
                        const altText = commandHasLocation(wp.command)
                          ? formatAltitudeFromMeters(wp.altitude, altitudeUnit)
                          : null;
                        return (
                          <>
                            <span className="truncate">{summary}</span>
                            {/* Altitude on the primary line; skipped when the
                                summary already embeds it (Takeoff, Loiter to
                                Alt, ...) so it never shows twice. */}
                            {altText && !summary.includes(altText) && (
                              <span className="shrink-0 text-content-secondary tabular-nums">{altText}</span>
                            )}
                          </>
                        );
                      })()}
                      {wp.command === MAV_CMD.CONDITION_YAW && wp.param3 !== 0 && (
                        <span className={`px-1 py-0 text-[9px] font-bold rounded shrink-0 ${
                          wp.param3 < 0
                            ? 'bg-blue-500/15 text-blue-400'
                            : 'bg-blue-500/15 text-blue-400'
                        }`}>
                          {wp.param3 < 0 ? 'CCW' : 'CW'}
                        </span>
                      )}
                      {/* Collapsed child count badge */}
                      {isCollapsed && childCount > 0 && (
                        <span className="px-1.5 py-0 text-[9px] rounded bg-surface-raised text-content-secondary shrink-0">
                          +{childCount}
                        </span>
                      )}
                    </div>
                    {commandHasLocation(wp.command) && (
                      <div className="text-[10px] text-content-tertiary font-mono">
                        {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                      </div>
                    )}
                  </div>

                  {/* Focus button - pan/zoom the map to this WP. Located WPs only. */}
                  {!readOnly && commandHasLocation(wp.command) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        focusWaypoint(wp.seq);
                      }}
                      className={`p-1 text-content-secondary hover:text-blue-400 hover:bg-blue-500/10 rounded transition-all shrink-0 ${
                        isSelected || multiSelected.has(wp.seq) ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                      data-tip={t('mission:waypointTable.list.focusMap')}
                    >
                      <Crosshair className="w-4 h-4" />
                    </button>
                  )}

                  {/* Delete button - hidden in readOnly mode */}
                  {!readOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wp.seq);
                      }}
                      className={`p-1 text-content-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-all shrink-0 ${
                        isSelected || multiSelected.has(wp.seq) ? '' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100'
                      }`}
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
                </Fragment>
              ));
            })}
            {/* Groups with no waypoints (e.g. a survey emptied by Distribute
                to fleet) still need a header, or their polygon/config would
                be unreachable from the list. */}
            {groups
              .filter((g) => (itemCountByGroup.get(g.id) ?? 0) === 0)
              .map((group) => (
                <GroupHeaderRow
                  key={group.id}
                  group={group}
                  count={0}
                  readOnly={readOnly}
                  isSelected={selectedGroupId === group.id}
                  isEditing={surveyEditingGroupId === group.id}
                  onVehicleState="none"
                  onSelect={() => setSelectedGroupId(group.id)}
                  onToggleCollapse={() => toggleGroupCollapsed(group.id)}
                  onToggleVisible={() => setGroupVisible(group.id, !group.visible)}
                  connected={connectionState.isConnected}
                  onRename={(name) => renameGroup(group.id, name)}
                  onSetColor={(color) => setGroupColor(group.id, color)}
                  onDelete={() => deleteGroup(group.id)}
                  onMoveUp={groupPosition(group.id).canMoveUp ? () => moveGroup(group.id, 'up') : undefined}
                  onMoveDown={groupPosition(group.id).canMoveDown ? () => moveGroup(group.id, 'down') : undefined}
                  flightEnd={flightEndFor(group)}
                  flightColor={(flightEndFor(group)?.legs ?? 0) > 1 ? flightEndFor(group)?.color : undefined}
                  dragging={draggedGroupId === group.id}
                  dropBefore={groupDropTarget === group.id && draggedGroupId !== group.id}
                  onGroupDragStart={() => setDraggedGroupId(group.id)}
                  onGroupDragOver={(e) => {
                    if (!draggedGroupId) return;
                    e.preventDefault();
                    e.stopPropagation();
                    const ok = canDropOn(group.id);
                    e.dataTransfer.dropEffect = ok ? 'move' : 'none';
                    setGroupDropTarget(ok ? group.id : null);
                  }}
                  onGroupDrop={() => dropGroupOn(group.id)}
                  onGroupDragEnd={() => { setDraggedGroupId(null); setGroupDropTarget(null); }}
                  linkMode={group.kind === 'survey' ? linkMode : null}
                  linkPick={linkPickOf(group.id)}
                  onLinkClick={() => handleLinkClick(group.id)}
                  onSetEndsFlight={(ends) => setGroupEndsFlight(group.id, ends)}
                  bulkSelected={bulkGroups.has(group.id)}
                  pickIndex={pickOrderOf(group.id)}
                  onToggleBulkSelected={() => toggleBulkGroup(group.id)}
                  distanceUnit={distanceUnit}
                  onRegenerate={
                    isSurveyGroup(group) ? () => regenerateSurveyGroup(group.id) : undefined
                  }
                  onEdit={
                    isSurveyGroup(group)
                      ? () => {
                          const sg = group as SurveyGroup;
                          surveyLoadFromGroup({
                            id: sg.id,
                            polygon: sg.polygon,
                            config: sg.config,
                          });
                        }
                      : undefined
                  }
                />
              ))}
          </div>
        )}
      </div>

      {/* Details panel for selected waypoint */}
      {selectedWaypoint && (
        <div className="border-t border-subtle bg-surface p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-content-secondary">
              {t('mission:waypointTable.list.editingWaypoint', { n: groupWaypointNumbers.get(selectedWaypoint.seq) ?? selectedWaypoint.seq + 1 })}
            </span>
            <div className="flex items-center gap-2">
              {commandHasLocation(selectedWaypoint.command) && (
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(`${selectedWaypoint.latitude}, ${selectedWaypoint.longitude}`);
                    setWpCoordCopied(true);
                    window.setTimeout(() => setWpCoordCopied(false), 1200);
                  }}
                  className="text-content-secondary hover:text-content"
                  data-tip={t('mission:waypointTable.list.copyThisTip')}
                >
                  {wpCoordCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              )}
            <button
              onClick={() => setSelectedSeq(null)}
              className="text-content-secondary hover:text-content"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            </div>
          </div>

          {coverageGapAt(selectedWaypoint.seq) && (
            <div className="mb-3 px-2 py-1.5 rounded-md bg-red-500/10 border border-red-500/30 text-[11px] text-red-300 leading-snug">
              {t('mission:waypointTable.list.coverageGap', { dist: Math.round(coverageGapAt(selectedWaypoint.seq)!.deviationM), deg: Math.round(coverageGapAt(selectedWaypoint.seq)!.turnDeg) })}
            </div>
          )}

          {/* Command selector */}
          <div className="mb-3">
            <label className="block text-[11px] text-content-secondary mb-1">{t('common:action')}</label>
            <CommandDropdown
              value={selectedWaypoint.command}
              onChange={(cmd) => handleCommandChange(selectedWaypoint.seq, cmd)}
              advanced={advancedLabels}
              firmware={effectiveFirmware}
            />
          </div>

          {/* Dynamic parameters */}
          <div className="grid grid-cols-2 gap-2">
            {getCommandParams(selectedWaypoint.command)
              .filter(p => p.show)
              .map((param) => {
                const displayUnit = displayParamUnit(param, distanceUnit, altitudeUnit, speedUnit, verticalSpeedUnit);
                return (
                  <div key={param.key}>
                    <label className="block text-[11px] text-content-secondary mb-1">
                      {t(param.labelKey)} {(displayUnit || param.unitHintKey) && <span className="text-content-tertiary">({displayUnit || (param.unitHintKey ? t(param.unitHintKey) : '')})</span>}
                    </label>
                    {param.unitKind === 'distance' || param.unitKind === 'altitude' || param.unitKind === 'speed' || param.unitKind === 'verticalSpeed' ? (
                      <UnitParamInput
                        nativeValue={selectedWaypoint[param.key] as number}
                        param={param}
                        distanceUnit={distanceUnit}
                        altitudeUnit={altitudeUnit}
                        speedUnit={speedUnit}
                        verticalSpeedUnit={verticalSpeedUnit}
                        onCommit={(nativeValue) => handleParamChange(selectedWaypoint.seq, param.key, nativeValue)}
                      />
                    ) : (
                      <DraftNumberInput
                        value={selectedWaypoint[param.key] as number}
                        onCommit={(v) => handleParamChange(selectedWaypoint.seq, param.key, v)}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        live
                      />
                    )}
                  </div>
                );
              })}

            {/* Location fields for commands that have them */}
            {commandHasLocation(selectedWaypoint.command) && (
              <>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">{t('common:latitude')}</label>
                  <DraftNumberInput
                    value={selectedWaypoint.latitude}
                    onCommit={(v) => handleParamChange(selectedWaypoint.seq, 'latitude', v)}
                    min={-90}
                    max={90}
                    text
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">{t('common:longitude')}</label>
                  <DraftNumberInput
                    value={selectedWaypoint.longitude}
                    onCommit={(v) => handleParamChange(selectedWaypoint.seq, 'longitude', v)}
                    min={-180}
                    max={180}
                    text
                  />
                </div>
              </>
            )}
          </div>

          {/* Help text */}
          {missionCommandDescription(selectedWaypoint.command) && (
            <p className="mt-3 text-[11px] text-content-secondary italic">
              {missionCommandDescription(selectedWaypoint.command)}
            </p>
          )}
        </div>
      )}

      {/* Add waypoint button - hidden in readOnly mode */}
      {!readOnly && (
        <div className="p-2 border-t border-subtle">
          <button
            onClick={handleAddWaypoint}
            className="w-full py-2 text-sm text-content hover:text-content bg-surface-raised hover:bg-surface-raised rounded transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('mission:waypointTable.list.addWaypoint')}
          </button>
        </div>
      )}
    </div>
  );
}
