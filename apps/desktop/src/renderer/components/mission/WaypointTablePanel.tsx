import { useState, useRef, useEffect, useCallback, useMemo, Fragment } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Clock, Gauge, Crosshair, RotateCw, RotateCcw,
  Repeat, Wrench, Ruler, ArrowUpDown, ChevronRight, MoreHorizontal,
  RefreshCw, Pencil, Upload, Save, Play,
  type LucideIcon,
} from 'lucide-react';
import { useMissionStore } from '../../stores/mission-store';
import { useSurveyStore } from '../../stores/survey-store';
import { type Group, isSurveyGroup, type SurveyGroup, GROUP_COLOR_PALETTE } from '../../../shared/mission-group-types';
import { isSurveyGroupStale } from '../survey/survey-group-signature';
import { regenerateSurveyGroup } from '../survey/survey-regen';
import { hasReplayData } from './plan-replay';
import { useReplayStore } from '../../stores/replay-store';
import { distanceLatLng } from '../survey/geo-math';
import { calculateGSD } from '../survey/survey-stats';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import {
  COMMAND_NAMES,
  COMMAND_DESCRIPTIONS,
  MAV_CMD,
  commandHasLocation,
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
import { computeRenderableIndices, renderableIndexOfSeq } from './waypoint-list-window';

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
  label: string;
  desc: string;
}
interface CommandGroup {
  group: string;
  commands: CommandOption[];
}
const COMMAND_GROUPS: CommandGroup[] = [
  {
    group: 'Navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: 'Takeoff', desc: 'Launch and climb to altitude' },
      { value: MAV_CMD.NAV_WAYPOINT, label: 'Waypoint', desc: 'Fly to this location' },
      { value: MAV_CMD.NAV_SPLINE_WAYPOINT, label: 'Spline WP', desc: 'Fly through smoothly' },
      { value: MAV_CMD.NAV_ARC_WAYPOINT, label: 'Arc WP', desc: 'Curved arc path' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: 'Loiter', desc: 'Circle until commanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: 'Loiter Time', desc: 'Circle for set duration' },
      { value: MAV_CMD.NAV_LOITER_TURNS, label: 'Loiter Turns', desc: 'Circle N times' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, label: 'Loiter to Alt', desc: 'Loiter and change alt' },
      { value: MAV_CMD.NAV_ALTITUDE_WAIT, label: 'Altitude Wait', desc: 'Wait at altitude (Plane)' },
      { value: MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT, label: 'Continue/Alt', desc: 'Continue and change alt' },
      { value: MAV_CMD.NAV_LAND, label: 'Land', desc: 'Land at this location' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: 'Return Home', desc: 'Fly back to launch' },
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, label: 'VTOL Takeoff', desc: 'VTOL vertical takeoff' },
      { value: MAV_CMD.NAV_VTOL_LAND, label: 'VTOL Land', desc: 'VTOL vertical landing' },
      { value: MAV_CMD.NAV_DELAY, label: 'Wait', desc: 'Pause mission for time' },
      { value: MAV_CMD.NAV_PAYLOAD_PLACE, label: 'Payload Place', desc: 'Descend and release' },
      { value: MAV_CMD.NAV_GUIDED_ENABLE, label: 'Guided Enable', desc: 'Enable guided mode' },
    ],
  },
  {
    group: 'Conditions',
    commands: [
      { value: MAV_CMD.CONDITION_DELAY, label: 'Delay', desc: 'Wait seconds' },
      { value: MAV_CMD.CONDITION_DISTANCE, label: 'Distance', desc: 'Wait until near next WP' },
      { value: MAV_CMD.CONDITION_CHANGE_ALT, label: 'Change Alt', desc: 'Reach alt then continue' },
      { value: MAV_CMD.CONDITION_YAW, label: 'Yaw', desc: 'Reach heading then continue' },
    ],
  },
  {
    group: 'Camera / Gimbal',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: 'Camera Trigger', desc: 'Trigger at distance' },
      { value: MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL, label: 'Camera Interval', desc: 'Trigger at time interval' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: 'Digicam Control', desc: 'Take a photo' },
      { value: MAV_CMD.DO_DIGICAM_CONFIGURE, label: 'Digicam Config', desc: 'Configure camera' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: 'Start Capture', desc: 'Start taking photos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: 'Stop Capture', desc: 'Stop taking photos' },
      { value: MAV_CMD.VIDEO_START_CAPTURE, label: 'Start Video', desc: 'Start recording' },
      { value: MAV_CMD.VIDEO_STOP_CAPTURE, label: 'Stop Video', desc: 'Stop recording' },
      { value: MAV_CMD.SET_CAMERA_ZOOM, label: 'Camera Zoom', desc: 'Set zoom level' },
      { value: MAV_CMD.SET_CAMERA_FOCUS, label: 'Camera Focus', desc: 'Set focus' },
      { value: MAV_CMD.SET_CAMERA_SOURCE, label: 'Camera Source', desc: 'Set video source' },
      { value: MAV_CMD.DO_SET_ROI, label: 'Set ROI', desc: 'Point camera at location' },
      { value: MAV_CMD.DO_SET_ROI_LOCATION, label: 'ROI Location', desc: 'Point camera at GPS' },
      { value: MAV_CMD.DO_SET_ROI_NONE, label: 'ROI None', desc: 'Stop camera tracking' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, label: 'Mount Control', desc: 'Set gimbal angles' },
      { value: MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW, label: 'Gimbal Pitch/Yaw', desc: 'Set gimbal pitch and yaw' },
    ],
  },
  {
    group: 'Actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: 'Set Speed', desc: 'Change flight speed' },
      { value: MAV_CMD.DO_SET_HOME, label: 'Set Home', desc: 'Set new home position' },
      { value: MAV_CMD.DO_JUMP, label: 'Jump', desc: 'Jump to WP and repeat' },
      { value: MAV_CMD.JUMP_TAG, label: 'Jump Tag', desc: 'Mark a tag label' },
      { value: MAV_CMD.DO_JUMP_TAG, label: 'Do Jump Tag', desc: 'Jump to tag label' },
      { value: MAV_CMD.DO_SET_SERVO, label: 'Set Servo', desc: 'Set servo PWM' },
      { value: MAV_CMD.DO_REPEAT_SERVO, label: 'Repeat Servo', desc: 'Cycle servo output' },
      { value: MAV_CMD.DO_SET_RELAY, label: 'Set Relay', desc: 'Set relay on/off' },
      { value: MAV_CMD.DO_REPEAT_RELAY, label: 'Repeat Relay', desc: 'Cycle relay on/off' },
      { value: MAV_CMD.DO_CHANGE_ALTITUDE, label: 'Change Alt', desc: 'Change altitude' },
      { value: MAV_CMD.DO_FENCE_ENABLE, label: 'Fence Enable', desc: 'Enable/disable geofence' },
      { value: MAV_CMD.DO_PARACHUTE, label: 'Parachute', desc: 'Deploy parachute' },
      { value: MAV_CMD.DO_GRIPPER, label: 'Gripper', desc: 'Open/close gripper' },
      { value: MAV_CMD.DO_SPRAYER, label: 'Sprayer', desc: 'Enable/disable sprayer' },
      { value: MAV_CMD.DO_WINCH, label: 'Winch', desc: 'Control winch motor' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, label: 'VTOL Transition', desc: 'Switch VTOL/FW mode' },
      { value: MAV_CMD.DO_LAND_START, label: 'Land Start', desc: 'Begin landing sequence' },
      { value: MAV_CMD.DO_ENGINE_CONTROL, label: 'Engine Control', desc: 'Start/stop engine' },
      { value: MAV_CMD.DO_AUX_FUNCTION, label: 'Aux Function', desc: 'Trigger RC aux function' },
      { value: MAV_CMD.DO_SEND_SCRIPT_MESSAGE, label: 'Script Message', desc: 'Send to Lua script' },
      { value: MAV_CMD.SET_YAW_SPEED, label: 'Yaw Speed', desc: 'Set yaw speed (Rover)' },
      { value: MAV_CMD.DO_SET_RESUME_REPEAT_DIST, label: 'Resume Repeat', desc: 'Resume dist after RTL' },
      { value: MAV_CMD.DO_AUTOTUNE_ENABLE, label: 'Autotune', desc: 'Enable/disable autotune' },
      { value: MAV_CMD.DO_INVERTED_FLIGHT, label: 'Inverted Flight', desc: 'Inverted flight on/off' },
    ],
  },
];

// Simple mode: only the most common commands
const SIMPLE_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: 'Navigation',
    commands: [
      { value: MAV_CMD.NAV_TAKEOFF, label: 'Takeoff', desc: 'Launch and climb to altitude' },
      { value: MAV_CMD.NAV_WAYPOINT, label: 'Waypoint', desc: 'Fly to this location' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: 'Loiter', desc: 'Circle until commanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: 'Loiter Time', desc: 'Circle for set duration' },
      { value: MAV_CMD.NAV_LAND, label: 'Land', desc: 'Land at this location' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: 'Return Home', desc: 'Fly back to launch' },
    ],
  },
  {
    group: 'Camera',
    commands: [
      { value: MAV_CMD.DO_SET_CAM_TRIGG_DIST, label: 'Camera Trigger', desc: 'Trigger at distance' },
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: 'Take Photo', desc: 'Trigger camera shutter' },
      { value: MAV_CMD.IMAGE_START_CAPTURE, label: 'Start Capture', desc: 'Start taking photos' },
      { value: MAV_CMD.IMAGE_STOP_CAPTURE, label: 'Stop Capture', desc: 'Stop taking photos' },
    ],
  },
  {
    group: 'Actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: 'Set Speed', desc: 'Change flight speed' },
      { value: MAV_CMD.DO_JUMP, label: 'Jump', desc: 'Jump to WP and repeat' },
      { value: MAV_CMD.DO_SET_SERVO, label: 'Set Servo', desc: 'Set servo PWM' },
    ],
  },
];

// iNav MSP: only 8 waypoint types supported
const INAV_COMMAND_GROUPS: CommandGroup[] = [
  {
    group: 'Navigation',
    commands: [
      { value: MAV_CMD.NAV_WAYPOINT, label: 'Waypoint', desc: 'Fly to location' },
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: 'Poshold', desc: 'Hold position indefinitely' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: 'Poshold Time', desc: 'Hold position for duration' },
      { value: MAV_CMD.NAV_LAND, label: 'Land', desc: 'Land at location' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: 'RTH', desc: 'Return to home' },
    ],
  },
  {
    group: 'Actions',
    commands: [
      { value: MAV_CMD.DO_SET_ROI, label: 'Set POI', desc: 'Point of interest for camera' },
      { value: MAV_CMD.DO_JUMP, label: 'Jump', desc: 'Jump to WP and repeat' },
      { value: MAV_CMD.CONDITION_YAW, label: 'Set Heading', desc: 'Lock heading direction' },
    ],
  },
];

// Flat list of all available commands (for lookup)
const ALL_AVAILABLE_COMMANDS = [
  ...COMMAND_GROUPS.flatMap(g => g.commands),
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
  firmware: 'ardupilot' | 'inav';
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties>({});
  const dropdownRef = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  // iNav has only 8 commands total, no need for simple/advanced split
  const groups = firmware === 'inav'
    ? INAV_COMMAND_GROUPS
    : advanced ? COMMAND_GROUPS : SIMPLE_COMMAND_GROUPS;

  // Current command label
  const currentCmd = ALL_AVAILABLE_COMMANDS.find(c => c.value === value);
  const currentLabel = currentCmd?.label || COMMAND_NAMES[value] || `CMD ${value}`;

  // Filter groups by search
  const filteredGroups = search.trim()
    ? groups
        .map(g => ({
          ...g,
          commands: g.commands.filter(
            c => c.label.toLowerCase().includes(search.toLowerCase())
              || c.desc.toLowerCase().includes(search.toLowerCase()),
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
        <div ref={popupRef} className="z-[9999] bg-surface-raised border border-default rounded-lg shadow-xl flex flex-col overflow-hidden" style={popupStyle}>
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
                placeholder="Search commands..."
                className="w-full bg-surface-input text-content text-xs pl-7 pr-2 py-1.5 rounded border border-subtle focus:border-blue-500/50 focus:outline-none placeholder-content-secondary"
              />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-auto flex-1 min-h-0">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-content-secondary text-center">No commands match "{search}"</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.group}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-content-secondary uppercase tracking-wider sticky top-0 bg-surface-raised">
                    {group.group}
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
                      <span className="font-medium whitespace-nowrap" title={advanced ? cmd.desc : undefined}>{cmd.label}</span>
                      {!advanced && <span className="text-xs text-content-secondary truncate">{cmd.desc}</span>}
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
): string {
  const radiusSuffix = wp.param3 > 0 ? ` (${formatDistanceFromMeters(wp.param3, distanceUnit)} radius)` : '';

  switch (wp.command) {
    // Navigation
    case MAV_CMD.NAV_TAKEOFF:
      return `Takeoff to ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? `WP (hold ${wp.param1}s)` : 'WP';
      return wp.param1 > 0 ? `Fly here, wait ${wp.param1}s` : 'Fly here';
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      if (advanced) return wp.param1 > 0 ? `Spline WP (hold ${wp.param1}s)` : 'Spline WP';
      return wp.param1 > 0 ? `Smooth path, wait ${wp.param1}s` : 'Smooth path';
    case MAV_CMD.NAV_LOITER_UNLIM:
      if (advanced) return `Loiter Unlim${radiusSuffix}`;
      return `Circle here${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TIME:
      if (advanced) return `Loiter ${wp.param1}s${radiusSuffix}`;
      return `Circle for ${wp.param1}s${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TURNS:
      if (advanced) return `Loiter ${wp.param1}x${radiusSuffix}`;
      return `Circle ${wp.param1}x${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return `Loiter to ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}${radiusSuffix}`;
    case MAV_CMD.NAV_LAND:
      if (advanced) return 'Land';
      return 'Land here';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      if (advanced) return 'RTL';
      return 'Return to home';
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return `VTOL Takeoff to ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_VTOL_LAND:
      if (advanced) return 'VTOL Land';
      return 'VTOL Land here';
    case MAV_CMD.NAV_DELAY:
      return `Wait ${wp.param1}s`;
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return wp.param1 > 0 ? `Place payload (max ${formatAltitudeFromMeters(wp.param1, altitudeUnit)} desc)` : 'Place payload';
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return `Continue, change to ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_ARC_WAYPOINT:
      if (advanced) return 'Arc WP';
      return 'Curved path';
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return `Wait at ${formatAltitudeFromMeters(wp.altitude, altitudeUnit)}`;
    case MAV_CMD.NAV_GUIDED_ENABLE:
      return wp.param1 > 0 ? 'Enable guided mode' : 'Disable guided mode';
    case MAV_CMD.NAV_SCRIPT_TIME:
      return `Script for ${wp.param1}s`;
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return `Hold attitude ${wp.param1}s`;

    // Conditions
    case MAV_CMD.CONDITION_DELAY:
      return `Wait ${wp.param1}s`;
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return `Climb/descend at ${formatVerticalSpeedFromMetersPerSecond(wp.param1, verticalSpeedUnit)}`;
    case MAV_CMD.CONDITION_DISTANCE:
      return `Wait until ${formatDistanceFromMeters(wp.param1, distanceUnit)} from next WP`;
    case MAV_CMD.CONDITION_YAW: {
      const isRelative = wp.param4 !== 0;
      return isRelative
        ? `Turn by ${wp.param1} deg`
        : `Turn to ${wp.param1} deg`;
    }

    // Camera / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_DIST ${formatDistanceFromMeters(wp.param1, distanceUnit)}` : 'CAM_TRIGG off';
      return wp.param1 > 0 ? `Camera every ${formatDistanceFromMeters(wp.param1, distanceUnit)}` : 'Camera trigger off';
    case MAV_CMD.DO_DIGICAM_CONTROL:
      if (advanced) return 'DIGICAM_CONTROL';
      return 'Take photo';
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
      if (advanced) return 'DIGICAM_CONFIGURE';
      return 'Configure camera';
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      if (advanced) return 'SET_ROI';
      return 'Point camera here';
    case MAV_CMD.DO_SET_ROI_NONE:
      if (advanced) return 'ROI_NONE';
      return 'Stop camera tracking';
    case MAV_CMD.DO_MOUNT_CONTROL:
      if (advanced) return 'MOUNT_CONTROL';
      return 'Set gimbal angles';
    case MAV_CMD.DO_MOUNT_CONFIGURE:
      if (advanced) return 'MOUNT_CONFIGURE';
      return 'Configure gimbal';
    case MAV_CMD.DO_CONTROL_VIDEO:
      return 'Control video';
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_INT ${wp.param1}s` : 'CAM_TRIGG_INT off';
      return wp.param1 > 0 ? `Camera every ${wp.param1}s` : 'Camera interval off';
    case MAV_CMD.IMAGE_START_CAPTURE:
      if (advanced) return wp.param2 > 0 ? `IMG_START (${wp.param2}s int)` : 'IMG_START';
      return wp.param2 > 0 ? `Start photos every ${wp.param2}s` : 'Start taking photos';
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      if (advanced) return 'IMG_STOP';
      return 'Stop taking photos';
    case MAV_CMD.VIDEO_START_CAPTURE:
      if (advanced) return 'VID_START';
      return 'Start recording video';
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      if (advanced) return 'VID_STOP';
      return 'Stop recording video';
    case MAV_CMD.SET_CAMERA_ZOOM:
      return `Camera zoom ${wp.param2}`;
    case MAV_CMD.SET_CAMERA_FOCUS:
      return `Camera focus ${wp.param2}`;
    case MAV_CMD.SET_CAMERA_SOURCE:
      return 'Set camera source';
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return `Gimbal pitch ${wp.param1} yaw ${wp.param2}`;

    // Actions
    case MAV_CMD.DO_CHANGE_SPEED:
      return `Set speed to ${formatSpeedFromMetersPerSecond(wp.param2, speedUnit)}`;
    case MAV_CMD.DO_SET_HOME:
      return wp.param1 === 1 ? 'Set home (current)' : 'Set home (location)';
    case MAV_CMD.DO_JUMP:
      return `Jump to WP ${wp.param1}` + (wp.param2 > 0 ? ` (${wp.param2}x)` : ' (forever)');
    case MAV_CMD.DO_SET_SERVO:
      return `Servo ${wp.param1} = ${wp.param2}`;
    case MAV_CMD.DO_REPEAT_SERVO:
      return `Cycle servo ${wp.param1}`;
    case MAV_CMD.DO_SET_RELAY:
      return `Relay ${wp.param1} ${wp.param2 > 0 ? 'ON' : 'OFF'}`;
    case MAV_CMD.DO_REPEAT_RELAY:
      return `Cycle relay ${wp.param1}`;
    case MAV_CMD.DO_FENCE_ENABLE:
      return wp.param1 > 0 ? 'Enable geofence' : 'Disable geofence';
    case MAV_CMD.DO_PARACHUTE:
      return 'Deploy parachute';
    case MAV_CMD.DO_GRIPPER:
      return wp.param2 === 0 ? 'Release gripper' : 'Grab gripper';
    case MAV_CMD.DO_VTOL_TRANSITION:
      return wp.param1 === 3 ? 'Transition to FW' : 'Transition to MC';
    case MAV_CMD.DO_LAND_START:
      return 'Begin landing sequence';
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return `Change alt to ${formatAltitudeFromMeters(wp.param1, altitudeUnit)}`;
    case MAV_CMD.DO_SET_MODE:
      return `Set mode ${wp.param1}`;
    case MAV_CMD.DO_PAUSE_CONTINUE:
      return wp.param1 > 0 ? 'Resume mission' : 'Pause mission';
    case MAV_CMD.DO_SET_REVERSE:
      return wp.param1 > 0 ? 'Drive in reverse' : 'Drive forward';
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return wp.param1 > 0 ? 'Inverted flight ON' : 'Inverted flight OFF';
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return wp.param1 > 0 ? 'Autotune ON' : 'Autotune OFF';
    case MAV_CMD.DO_ENGINE_CONTROL:
      return wp.param1 > 0 ? 'Start engine' : 'Stop engine';
    case MAV_CMD.DO_FLIGHTTERMINATION:
      return 'Flight termination';
    case MAV_CMD.DO_SET_PARAMETER:
      return `Set param ${wp.param1} = ${wp.param2}`;
    case MAV_CMD.JUMP_TAG:
      return `Tag ${wp.param1}`;
    case MAV_CMD.DO_JUMP_TAG:
      return `Jump to tag ${wp.param1}` + (wp.param2 > 0 ? ` (${wp.param2}x)` : ' (forever)');
    case MAV_CMD.DO_SPRAYER:
      return wp.param1 > 0 ? 'Sprayer ON' : 'Sprayer OFF';
    case MAV_CMD.DO_WINCH:
      return 'Control winch';
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return `Script msg ${wp.param1}`;
    case MAV_CMD.SET_YAW_SPEED:
      return `Yaw ${wp.param1} at ${wp.param2} deg/s`;
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return `Resume repeat ${formatDistanceFromMeters(wp.param1, distanceUnit)}`;
    case MAV_CMD.DO_AUX_FUNCTION:
      return `Aux function ${wp.param1}`;

    default:
      return COMMAND_NAMES[wp.command] || `Unknown CMD ${wp.command}`;
  }
}

type CommandParamConfig = {
  key: keyof MissionItem;
  label: string;
  unit: string;
  unitKind?: 'distance' | 'altitude' | 'speed' | 'verticalSpeed';
  min?: number;
  max?: number;
  step?: number;
  show: boolean;
};

// Get the parameters config for each command type
export function getCommandParams(cmd: number): CommandParamConfig[] {
  const baseLocation: CommandParamConfig[] = [
    { key: 'altitude' as const, label: 'Altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
  ];

  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
        { key: 'param1' as const, label: 'Pitch Angle', unit: '°', min: 0, max: 90, step: 5, show: true },
      ];
    case MAV_CMD.NAV_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 0, max: 300, step: 1, show: true },
        { key: 'param2' as const, label: 'Acceptance Radius', unit: 'm', unitKind: 'distance', min: 0, max: 50, step: 1, show: false },
      ];
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 0, max: 300, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_UNLIM:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: 'Radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TIME:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Duration', unit: 's', min: 1, max: 600, step: 5, show: true },
        { key: 'param3' as const, label: 'Radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TURNS:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Number of Turns', unit: '', min: 1, max: 100, step: 1, show: true },
        { key: 'param3' as const, label: 'Radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LAND:
      return [
        { key: 'param1' as const, label: 'Abort Altitude', unit: 'm', unitKind: 'altitude', min: 0, max: 100, step: 5, show: true },
      ];
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return []; // No params needed
    case MAV_CMD.NAV_DELAY:
      return [
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 1, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_SPEED:
      return [
        { key: 'param2' as const, label: 'Target Speed', unit: 'm/s', unitKind: 'speed', min: 1, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: 'Radius', unit: 'm', unitKind: 'distance', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', unitKind: 'altitude', min: 1, step: 5, show: true },
      ];
    case MAV_CMD.NAV_VTOL_LAND:
      return [
        { key: 'param3' as const, label: 'Approach Alt', unit: 'm', unitKind: 'altitude', min: 0, max: 200, step: 5, show: true },
      ];
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Max Descend', unit: 'm', unitKind: 'altitude', min: 0, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_DELAY:
      return [
        { key: 'param1' as const, label: 'Time', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return [
        { key: 'param1' as const, label: 'Rate', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
      ];
    case MAV_CMD.CONDITION_DISTANCE:
      return [
        { key: 'param1' as const, label: 'Distance', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.CONDITION_YAW:
      return [
        { key: 'param1' as const, label: 'Angle', unit: 'deg', min: 0, max: 360, step: 5, show: true },
        { key: 'param2' as const, label: 'Speed', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
        { key: 'param3' as const, label: 'Direction', unit: '-1=CCW 0=auto 1=CW', min: -1, max: 1, step: 1, show: true },
        { key: 'param4' as const, label: 'Relative', unit: '0=abs 1=rel', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP:
      return [
        { key: 'param1' as const, label: 'Waypoint #', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Repeat Count', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      return [
        { key: 'param1' as const, label: 'Distance', unit: 'm', unitKind: 'distance', min: 0, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_SERVO:
      return [
        { key: 'param1' as const, label: 'Servo #', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, label: 'PWM', unit: 'us', min: 500, max: 2500, step: 10, show: true },
      ];
    case MAV_CMD.DO_SET_RELAY:
      return [
        { key: 'param1' as const, label: 'Relay #', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, label: 'On/Off', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_SERVO:
      return [
        { key: 'param1' as const, label: 'Servo #', unit: '', min: 1, max: 16, step: 1, show: true },
        { key: 'param2' as const, label: 'PWM', unit: 'us', min: 500, max: 2500, step: 10, show: true },
        { key: 'param3' as const, label: 'Count', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_REPEAT_RELAY:
      return [
        { key: 'param1' as const, label: 'Relay #', unit: '', min: 0, max: 15, step: 1, show: true },
        { key: 'param2' as const, label: 'Count', unit: '', min: 1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return baseLocation;
    case MAV_CMD.DO_MOUNT_CONTROL:
      return [
        { key: 'param1' as const, label: 'Pitch', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, label: 'Roll', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param3' as const, label: 'Yaw', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_FENCE_ENABLE:
      return [
        { key: 'param1' as const, label: 'Enable', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_GRIPPER:
      return [
        { key: 'param1' as const, label: 'Gripper #', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, label: 'Action', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_VTOL_TRANSITION:
      return [
        { key: 'param1' as const, label: 'State', unit: '', min: 1, max: 4, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_ALTITUDE:
      return [
        { key: 'param1' as const, label: 'Altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param2' as const, label: 'Frame', unit: '', min: 0, max: 10, step: 1, show: false },
      ];
    // New commands
    case MAV_CMD.NAV_ARC_WAYPOINT:
      return [
        ...baseLocation,
      ];
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
        { key: 'param1' as const, label: 'Climb Rate', unit: 'm/s', unitKind: 'verticalSpeed', min: 0, max: 10, step: 0.5, show: true },
      ];
    case MAV_CMD.NAV_SCRIPT_TIME:
      return [
        { key: 'param1' as const, label: 'Command', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Timeout', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.NAV_ATTITUDE_TIME:
      return [
        { key: 'param1' as const, label: 'Time', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_INTERVAL:
      return [
        { key: 'param1' as const, label: 'Interval', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param2' as const, label: 'Count', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_START_CAPTURE:
      return [
        { key: 'param2' as const, label: 'Interval', unit: 's', min: 0, max: 3600, step: 1, show: true },
        { key: 'param3' as const, label: 'Total Images', unit: '', min: 0, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.IMAGE_STOP_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_START_CAPTURE:
      return [];
    case MAV_CMD.VIDEO_STOP_CAPTURE:
      return [];
    case MAV_CMD.SET_CAMERA_ZOOM:
      return [
        { key: 'param1' as const, label: 'Zoom Type', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, label: 'Zoom Value', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.SET_CAMERA_FOCUS:
      return [
        { key: 'param1' as const, label: 'Focus Type', unit: '', min: 0, max: 2, step: 1, show: true },
        { key: 'param2' as const, label: 'Focus Value', unit: '', min: 0, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_GIMBAL_MANAGER_PITCHYAW:
      return [
        { key: 'param1' as const, label: 'Pitch', unit: 'deg', min: -90, max: 90, step: 5, show: true },
        { key: 'param2' as const, label: 'Yaw', unit: 'deg', min: -180, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.JUMP_TAG:
      return [
        { key: 'param1' as const, label: 'Tag #', unit: '', min: 1, max: 999, step: 1, show: true },
      ];
    case MAV_CMD.DO_JUMP_TAG:
      return [
        { key: 'param1' as const, label: 'Tag #', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Repeat Count', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SPRAYER:
      return [
        { key: 'param1' as const, label: 'Enable', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_WINCH:
      return [
        { key: 'param1' as const, label: 'Instance', unit: '', min: 1, max: 4, step: 1, show: true },
        { key: 'param2' as const, label: 'Action', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SEND_SCRIPT_MESSAGE:
      return [
        { key: 'param1' as const, label: 'ID', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Param 1', unit: '', min: -1000, max: 1000, step: 1, show: true },
        { key: 'param3' as const, label: 'Param 2', unit: '', min: -1000, max: 1000, step: 1, show: true },
      ];
    case MAV_CMD.SET_YAW_SPEED:
      return [
        { key: 'param1' as const, label: 'Yaw Angle', unit: 'deg', min: -180, max: 180, step: 5, show: true },
        { key: 'param2' as const, label: 'Speed', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_AUX_FUNCTION:
      return [
        { key: 'param1' as const, label: 'Function', unit: '', min: 0, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Switch Pos', unit: '', min: 0, max: 2, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_RESUME_REPEAT_DIST:
      return [
        { key: 'param1' as const, label: 'Distance', unit: 'm', unitKind: 'distance', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.DO_ENGINE_CONTROL:
      return [
        { key: 'param1' as const, label: 'Start/Stop', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_AUTOTUNE_ENABLE:
      return [
        { key: 'param1' as const, label: 'Enable', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.DO_INVERTED_FLIGHT:
      return [
        { key: 'param1' as const, label: 'Inverted', unit: '', min: 0, max: 1, step: 1, show: true },
      ];
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', unitKind: 'altitude', min: 0, step: 5, show: true },
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
}) {
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
      className={`flex flex-col select-none cursor-pointer transition-colors ${
        isSelected ? 'bg-surface-raised/80' : 'bg-surface-raised/40 hover:bg-surface-raised/60'
      }`}
      style={{ borderLeft: `3px solid ${group.color}` }}
      onClick={onSelect}
    >
      <div className="flex items-center gap-2 px-2 pt-1.5 pb-0.5">
      {!readOnly && (
        <div
          onClick={(e) => {
            e.stopPropagation();
            onToggleVisible();
          }}
          onMouseDown={(e) => e.stopPropagation()}
          className="shrink-0 flex items-center justify-center w-5 h-5"
          data-tip={group.visible ? 'Visible on map (click to hide)' : 'Hidden on map (click to show)'}
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
        data-tip={group.collapsed ? `Expand (${count} items)` : 'Collapse group'}
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
          data-tip={readOnly ? undefined : 'Change color'}
          aria-label="Group color"
        />
        {colorOpen && !readOnly && colorPos &&
          createPortal(
            <>
              <div className="fixed inset-0 z-[9998]" onClick={() => setColorOpen(false)} />
              <div
                className="fixed z-[9999] p-1.5 bg-surface-raised border border-subtle rounded-lg shadow-2xl grid grid-cols-4 gap-1"
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
                    aria-label={`Set color ${c}`}
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
            className={`text-xs font-medium text-content truncate ${readOnly ? '' : 'cursor-text hover:text-blue-300'}`}
            onDoubleClick={() => !readOnly && setEditing(true)}
            title={readOnly ? group.name : 'Double-click to rename'}
          >
            {group.name}
          </span>
        )}
        <span className="text-[10px] text-content-secondary shrink-0">
          {count} {count === 1 ? 'WP' : 'WPs'}
        </span>
        {isStaleSurvey && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-amber-500/15 text-amber-300 shrink-0"
            title="Polygon or config changed since last generation"
          >
            modified
          </span>
        )}
        {onVehicleState === 'on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title="This group's waypoints are on the vehicle (matches last upload)"
          >
            on vehicle
          </span>
        )}
        {onVehicleState === 'stale-on-vehicle' && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-yellow-500/15 text-yellow-300 shrink-0"
            title="This group was uploaded earlier but has been edited since. The vehicle is out of date."
          >
            stale on vehicle
          </span>
        )}
        {isEditing && (
          <span
            className="text-[10px] px-1.5 py-0 rounded bg-emerald-500/15 text-emerald-300 shrink-0"
            title="Survey panel is editing this group live; vertex / config changes flow into the mission"
          >
            editing
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
            data-tip="Assign this group to a fleet vehicle (sets its colour and upload target)"
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: assignedVehicle?.color ?? 'transparent', border: assignedVehicle ? 'none' : '1px solid var(--border-subtle, #555)' }}
            />
            <span className="truncate">{assignedVehicle ? assignedVehicle.label : 'Assign'}</span>
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
                    Unassigned
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
              ? 'No waypoints in this group'
              : connected
                ? 'Upload only this group to the vehicle (replaces its mission)'
                : 'Save only this group to a file'
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
          data-tip="Edit this survey (loads its polygon + config back into the Survey panel)"
        >
          <Pencil className="w-3 h-3" />
          Edit
        </button>
      )}
      {!readOnly && onReplay && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onReplay();
          }}
          className="shrink-0 w-6 h-6 flex items-center justify-center text-sky-300 hover:text-sky-200 hover:bg-sky-500/15 rounded transition-colors"
          data-tip="Replay the coverage plan"
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
          data-tip="Regenerate this survey from current polygon + config"
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
            data-tip="Group actions"
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
                    Rename
                  </button>
                  <button
                    onClick={() => {
                      setMenuOpen(false);
                      onDelete();
                    }}
                    className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-surface-raised hover:text-red-300 transition-colors"
                  >
                    Delete group
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
        {stats && stats.distanceM > 0 && (
          <>
            <span>· {formatBlockDistance(stats.distanceM, distanceUnit)}</span>
            {stats.timeS > 0 && <span>· {formatBlockDuration(stats.timeS)}</span>}
            {stats.gsd != null && stats.gsd > 0 && <span>· {stats.gsd.toFixed(1)} cm/px</span>}
          </>
        )}
      </div>
    </div>
  );
}

// Extracted waypoint list content (original WaypointTablePanel content)
function WaypointListContent({ readOnly = false }: { readOnly?: boolean }) {
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
    addWaypoint,
    reorderWaypoints,
    renameGroup,
    setGroupColor,
    setGroupVehicle,
    deleteGroup,
    toggleGroupCollapsed,
    setGroupVisible,
    focusWaypoint,
    uploadGroup,
    uploadGroupToVehicle,
    saveGroupToFile,
    lastUploadedAt,
    lastUploadedGroupIds,
  } = useMissionStore();

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
  const validation = useMemo(
    () => validateMission(missionItems, groups, { isAir: true, altitudeUnit }),
    [missionItems, groups, altitudeUnit],
  );

  // When connected, auto-detect firmware from protocol. When disconnected, use setting.
  const effectiveFirmware: 'ardupilot' | 'inav' = connectionState.isConnected
    ? (connectionState.protocol === 'msp' && connectionState.fcVariant === 'INAV' ? 'inav' : 'ardupilot')
    : settingsFirmware;

  const [draggedSeq, setDraggedSeq] = useState<number | null>(null);
  const [dropTargetSeq, setDropTargetSeq] = useState<number | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<number>>(new Set());
  const [multiSelected, setMultiSelected] = useState<Set<number>>(new Set());
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

  // [MISSION DIAG] TEMP: one-shot structural dump of the grouped mission so we can
  // tell WHY one group holds thousands of WPs and collapse spills across groups:
  // duplicate group ids, orphaned items merged into one "Recovered" group,
  // non-contiguous group runs (fragmented headers), or a flat FC import. Logs
  // only when the structure signature changes (not on every telemetry tick).
  const diagSigRef = useRef<string>('');
  useEffect(() => {
    const gIds = groups.map((g) => g.id);
    const dupGroupIds = gIds.filter((id, i) => gIds.indexOf(id) !== i);
    const idSet = new Set(gIds);
    const counts = new Map<string, number>();
    let noGroup = 0;
    const orphanSeqs: number[] = [];
    for (const it of missionItems) {
      if (!it.groupId) { noGroup++; continue; }
      counts.set(it.groupId, (counts.get(it.groupId) ?? 0) + 1);
      if (!idSet.has(it.groupId)) orphanSeqs.push(it.seq);
    }
    // Count separate contiguous runs per groupId in array order (>1 = fragmented).
    const runs = new Map<string, number>();
    let prev: string | null = null;
    for (const it of missionItems) {
      const g = it.groupId ?? '(none)';
      if (g !== prev) { runs.set(g, (runs.get(g) ?? 0) + 1); prev = g; }
    }
    const fragmented = [...runs.entries()].filter(([, n]) => n > 1).map(([id, n]) => ({ id: id.slice(0, 8), runs: n }));
    const sig = `${missionItems.length}|${groups.length}|${gIds.join(',')}|${[...counts.values()].join(',')}`;
    if (sig === diagSigRef.current) return;
    diagSigRef.current = sig;
    // eslint-disable-next-line no-console
    console.log('[MISSION DIAG]', {
      totalItems: missionItems.length,
      groupCount: groups.length,
      groups: groups
        .slice()
        .sort((a, b) => a.order - b.order)
        .map((g) => ({ id: g.id.slice(0, 8), kind: g.kind, name: g.name, order: g.order, collapsed: g.collapsed === true, items: counts.get(g.id) ?? 0 })),
      dupGroupIds,
      itemsWithNoGroup: noGroup,
      orphanItemSeqs: orphanSeqs.slice(0, 12),
      orphanCount: orphanSeqs.length,
      fragmentedGroups: fragmented,
    });
  }, [groups, missionItems]);

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

  const getCommandName = (cmd: number) => COMMAND_NAMES[cmd] || `Unknown CMD ${cmd}`;
  const getCommandInfo = (cmd: number) => ALL_AVAILABLE_COMMANDS.find(c => c.value === cmd);

  // Virtualization for large missions. Collapsed children don't render, so we
  // virtualize over the list of ACTUALLY-rendered indices (otherwise measured
  // heights would be wrong). Below the threshold we render the list normally so
  // typical missions behave exactly as before.
  const VIRTUALIZE_THRESHOLD = 250;
  const renderableIndices = useMemo(
    () => computeRenderableIndices(missionItems, collapsedGroups),
    [missionItems, collapsedGroups],
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
    const child = !isNavigationCommand(wp.command) || wp.command === MAV_CMD.NAV_DELAY;
    const prev = idx > 0 ? missionItems[idx - 1] : undefined;
    const showHeader = !prev || prev.groupId !== wp.groupId;
    // Generous so the estimate is >= the real height: a too-small estimate would
    // overlap rows, while a slightly large one just adds a little spacing.
    // Survey rows are uniform, so cumulative drift is negligible.
    return (child ? 40 : 52) + (showHeader ? 48 : 0);
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
        <div className="shrink-0 px-3 py-1.5 border-b border-subtle flex items-center justify-between">
          {!readOnly && multiSelected.size > 0 ? (
            <>
              <span className="text-[10px] text-content-secondary">
                {multiSelected.size} of {missionItems.length} selected
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSelectAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="Select all waypoints"
                >
                  Select all
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleClearSelection}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="Clear selection"
                >
                  Clear
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={handleDeleteSelected}
                  className="text-[10px] text-red-400 hover:text-red-300 transition-colors font-medium"
                  title={`Delete ${multiSelected.size} selected waypoint${multiSelected.size === 1 ? '' : 's'}`}
                >
                  Delete selected
                </button>
              </div>
            </>
          ) : (
            <>
              <span className="text-[10px] text-content-secondary">{missionItems.length} items</span>
              <div className="flex items-center gap-2">
                <button
                  onClick={collapseAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="Collapse all groups"
                >
                  Collapse all
                </button>
                <span className="text-content-tertiary text-[10px]">|</span>
                <button
                  onClick={expandAll}
                  className="text-[10px] text-content-secondary hover:text-content transition-colors"
                  title="Expand all groups"
                >
                  Expand all
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Pre-flight validation strip */}
      {!readOnly && missionItems.length > 0 && (
        <div className="border-b border-subtle shrink-0">
          <MissionValidationBadge result={validation} />
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
                <p className="text-sm font-medium mb-1">No mission loaded</p>
                <p className="text-xs text-content-tertiary text-center">No mission on flight controller</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">No waypoints yet</p>
                <p className="text-xs text-content-tertiary text-center">Click "Add" below or click on the map to add waypoints</p>
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
              const prevWp = idx > 0 ? missionItems[idx - 1] : null;
              const showGroupHeader = !prevWp || prevWp.groupId !== wp.groupId;
              const group = wp.groupId ? groupById.get(wp.groupId) : undefined;
              const hideByGroupCollapse = group?.collapsed === true;
              const headerNode =
                showGroupHeader && group ? (
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
                    assignedVehicleKey={group.assignedVehicleKey}
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
                      group.assignedVehicleKey
                        ? uploadGroupToVehicle(group.id, group.assignedVehicleKey)
                        : connectionState.isConnected
                          ? uploadGroup(group.id)
                          : saveGroupToFile(group.id)
                    }
                    connected={connectionState.isConnected || !!group.assignedVehicleKey}
                    onRename={(name) => renameGroup(group.id, name)}
                    onSetColor={(color) => setGroupColor(group.id, color)}
                    onDelete={() => deleteGroup(group.id)}
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
                  className={`flex items-center gap-2 py-2 transition-colors ${
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
                      title="Shift+click to select range"
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
                      title={isCollapsed ? `Expand (${childCount} items)` : 'Collapse'}
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
                      <span className="truncate">{getWaypointSummary(wp, advancedLabels, distanceUnit, altitudeUnit, speedUnit, verticalSpeedUnit)}</span>
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
                      <div className="text-[10px] text-content-secondary font-mono">
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
                      className="p-1 text-content-secondary hover:text-blue-400 hover:bg-blue-500/10 rounded transition-colors shrink-0"
                      data-tip="Focus map on this waypoint"
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
                      className="p-1 text-content-secondary hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0"
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
          </div>
        )}
      </div>

      {/* Details panel for selected waypoint */}
      {selectedWaypoint && (
        <div className="border-t border-subtle bg-surface p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-content-secondary">
              Editing Waypoint {groupWaypointNumbers.get(selectedWaypoint.seq) ?? selectedWaypoint.seq + 1}
            </span>
            <button
              onClick={() => setSelectedSeq(null)}
              className="text-content-secondary hover:text-content"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Command selector */}
          <div className="mb-3">
            <label className="block text-[11px] text-content-secondary mb-1">Action</label>
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
                      {param.label} {displayUnit && <span className="text-content-tertiary">({displayUnit})</span>}
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
                      <input
                        type="number"
                        value={selectedWaypoint[param.key] as number}
                        onChange={(e) => handleParamChange(selectedWaypoint.seq, param.key, Number(e.target.value))}
                        min={param.min}
                        max={param.max}
                        step={param.step}
                        className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
                      />
                    )}
                  </div>
                );
              })}

            {/* Location fields for commands that have them */}
            {commandHasLocation(selectedWaypoint.command) && (
              <>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">Latitude</label>
                  <input
                    type="number"
                    value={selectedWaypoint.latitude}
                    onChange={(e) => handleParamChange(selectedWaypoint.seq, 'latitude', Number(e.target.value))}
                    step={0.00001}
                    className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-content-secondary mb-1">Longitude</label>
                  <input
                    type="number"
                    value={selectedWaypoint.longitude}
                    onChange={(e) => handleParamChange(selectedWaypoint.seq, 'longitude', Number(e.target.value))}
                    step={0.00001}
                    className="w-full bg-surface-input text-content text-sm px-2 py-1.5 rounded border border-default focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Help text */}
          {COMMAND_DESCRIPTIONS[selectedWaypoint.command] && (
            <p className="mt-3 text-[11px] text-content-secondary italic">
              {COMMAND_DESCRIPTIONS[selectedWaypoint.command]}
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
            Add Waypoint
          </button>
        </div>
      )}
    </div>
  );
}
