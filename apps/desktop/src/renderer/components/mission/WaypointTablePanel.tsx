import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useSettingsStore } from '../../stores/settings-store';
import {
  COMMAND_NAMES,
  COMMAND_DESCRIPTIONS,
  MAV_CMD,
  commandHasLocation,
  isNavigationCommand,
  type MissionItem
} from '../../../shared/mission-types';
import { FenceListPanel } from '../geofence/FenceListPanel';
import { RallyListPanel } from '../rally/RallyListPanel';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useConnectionStore } from '../../stores/connection-store';
import { computeItemColors, SEGMENT_COLORS } from '../../utils/mission-segment-colors';

// Helper to get GPS state without subscribing (avoids re-renders)
function getGpsState() {
  const gps = useTelemetryStore.getState().gps;
  return {
    hasGpsFix: gps.fixType >= 2 && gps.lat !== 0 && gps.lon !== 0,
    lat: gps.lat,
    lon: gps.lon,
  };
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
        className="w-full flex items-center justify-between bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 hover:border-gray-500 focus:border-blue-500 focus:outline-none"
      >
        <span className="truncate">{currentLabel}</span>
        <svg className={`w-4 h-4 shrink-0 ml-1 text-gray-400 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && createPortal(
        <div ref={popupRef} className="z-[9999] bg-gray-800 border border-gray-600 rounded-lg shadow-xl flex flex-col overflow-hidden" style={popupStyle}>
          {/* Search input */}
          <div className="p-1.5 border-b border-gray-700/50 shrink-0">
            <div className="relative">
              <svg className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
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
                className="w-full bg-gray-700/60 text-gray-200 text-xs pl-7 pr-2 py-1.5 rounded border border-gray-600/50 focus:border-blue-500/50 focus:outline-none placeholder-gray-500"
              />
            </div>
          </div>

          {/* Results */}
          <div className="overflow-auto flex-1 min-h-0">
            {filteredGroups.length === 0 ? (
              <div className="px-3 py-4 text-xs text-gray-500 text-center">No commands match "{search}"</div>
            ) : (
              filteredGroups.map((group) => (
                <div key={group.group}>
                  <div className="px-2 py-1 text-[10px] font-semibold text-gray-500 uppercase tracking-wider sticky top-0 bg-gray-800">
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
                          : 'text-gray-300 hover:bg-gray-700'
                      }`}
                    >
                      <span className="font-medium whitespace-nowrap" title={advanced ? cmd.desc : undefined}>{cmd.label}</span>
                      {!advanced && <span className="text-xs text-gray-500 truncate">{cmd.desc}</span>}
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
function getWaypointSummary(wp: MissionItem, advanced: boolean): string {
  const radiusSuffix = wp.param3 > 0 ? ` (${wp.param3}m radius)` : '';

  switch (wp.command) {
    // Navigation
    case MAV_CMD.NAV_TAKEOFF:
      return `Takeoff to ${wp.altitude}m`;
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
      return `Loiter to ${wp.altitude}m${radiusSuffix}`;
    case MAV_CMD.NAV_LAND:
      if (advanced) return 'Land';
      return 'Land here';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      if (advanced) return 'RTL';
      return 'Return to home';
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return `VTOL Takeoff to ${wp.altitude}m`;
    case MAV_CMD.NAV_VTOL_LAND:
      if (advanced) return 'VTOL Land';
      return 'VTOL Land here';
    case MAV_CMD.NAV_DELAY:
      return `Wait ${wp.param1}s`;
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return wp.param1 > 0 ? `Place payload (max ${wp.param1}m desc)` : 'Place payload';
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return `Continue, change to ${wp.altitude}m`;
    case MAV_CMD.NAV_ARC_WAYPOINT:
      if (advanced) return 'Arc WP';
      return 'Curved path';
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return `Wait at ${wp.altitude}m`;
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
      return `Climb/descend at ${wp.param1} m/s`;
    case MAV_CMD.CONDITION_DISTANCE:
      return `Wait until ${wp.param1}m from next WP`;
    case MAV_CMD.CONDITION_YAW:
      return `Turn to ${wp.param1} deg`;

    // Camera / Gimbal
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      if (advanced) return wp.param1 > 0 ? `CAM_TRIGG_DIST ${wp.param1}m` : 'CAM_TRIGG off';
      return wp.param1 > 0 ? `Camera every ${wp.param1}m` : 'Camera trigger off';
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
      return `Set speed to ${wp.param2} m/s`;
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
      return `Change alt to ${wp.param1}m`;
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
      return `Resume repeat ${wp.param1}m`;
    case MAV_CMD.DO_AUX_FUNCTION:
      return `Aux function ${wp.param1}`;

    default:
      return COMMAND_NAMES[wp.command] || `Unknown CMD ${wp.command}`;
  }
}

// Get the parameters config for each command type
function getCommandParams(cmd: number): Array<{
  key: keyof MissionItem;
  label: string;
  unit: string;
  min?: number;
  max?: number;
  step?: number;
  show: boolean;
}> {
  const baseLocation = [
    { key: 'altitude' as const, label: 'Altitude', unit: 'm', min: 0, max: 1000, step: 5, show: true },
  ];

  switch (cmd) {
    case MAV_CMD.NAV_TAKEOFF:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', min: 1, max: 500, step: 5, show: true },
        { key: 'param1' as const, label: 'Pitch Angle', unit: '°', min: 0, max: 90, step: 5, show: true },
      ];
    case MAV_CMD.NAV_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 0, max: 300, step: 1, show: true },
        { key: 'param2' as const, label: 'Acceptance Radius', unit: 'm', min: 0, max: 50, step: 1, show: false },
      ];
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 0, max: 300, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_UNLIM:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: 'Radius', unit: 'm', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TIME:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Duration', unit: 's', min: 1, max: 600, step: 5, show: true },
        { key: 'param3' as const, label: 'Radius', unit: 'm', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TURNS:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Number of Turns', unit: '', min: 1, max: 100, step: 1, show: true },
        { key: 'param3' as const, label: 'Radius', unit: 'm', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_LAND:
      return [
        { key: 'param1' as const, label: 'Abort Altitude', unit: 'm', min: 0, max: 100, step: 5, show: true },
      ];
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return []; // No params needed
    case MAV_CMD.NAV_DELAY:
      return [
        { key: 'param1' as const, label: 'Wait Time', unit: 's', min: 1, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.DO_CHANGE_SPEED:
      return [
        { key: 'param2' as const, label: 'Target Speed', unit: 'm/s', min: 1, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return [
        ...baseLocation,
        { key: 'param3' as const, label: 'Radius', unit: 'm', min: 10, max: 500, step: 10, show: true },
      ];
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', min: 1, max: 500, step: 5, show: true },
      ];
    case MAV_CMD.NAV_VTOL_LAND:
      return [
        { key: 'param3' as const, label: 'Approach Alt', unit: 'm', min: 0, max: 200, step: 5, show: true },
      ];
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return [
        ...baseLocation,
        { key: 'param1' as const, label: 'Max Descend', unit: 'm', min: 0, max: 50, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_DELAY:
      return [
        { key: 'param1' as const, label: 'Time', unit: 's', min: 0, max: 3600, step: 1, show: true },
      ];
    case MAV_CMD.CONDITION_CHANGE_ALT:
      return [
        { key: 'param1' as const, label: 'Rate', unit: 'm/s', min: 0, max: 10, step: 0.5, show: true },
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', min: 0, max: 1000, step: 5, show: true },
      ];
    case MAV_CMD.CONDITION_DISTANCE:
      return [
        { key: 'param1' as const, label: 'Distance', unit: 'm', min: 0, max: 10000, step: 10, show: true },
      ];
    case MAV_CMD.CONDITION_YAW:
      return [
        { key: 'param1' as const, label: 'Heading', unit: 'deg', min: 0, max: 360, step: 5, show: true },
        { key: 'param2' as const, label: 'Speed', unit: 'deg/s', min: 0, max: 180, step: 5, show: true },
      ];
    case MAV_CMD.DO_JUMP:
      return [
        { key: 'param1' as const, label: 'Waypoint #', unit: '', min: 1, max: 999, step: 1, show: true },
        { key: 'param2' as const, label: 'Repeat Count', unit: '', min: -1, max: 100, step: 1, show: true },
      ];
    case MAV_CMD.DO_SET_CAM_TRIGG_DIST:
      return [
        { key: 'param1' as const, label: 'Distance', unit: 'm', min: 0, max: 1000, step: 1, show: true },
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
        { key: 'param1' as const, label: 'Altitude', unit: 'm', min: 0, max: 1000, step: 5, show: true },
        { key: 'param2' as const, label: 'Frame', unit: '', min: 0, max: 10, step: 1, show: false },
      ];
    // New commands
    case MAV_CMD.NAV_ARC_WAYPOINT:
      return [
        ...baseLocation,
      ];
    case MAV_CMD.NAV_ALTITUDE_WAIT:
      return [
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', min: 0, max: 1000, step: 5, show: true },
        { key: 'param1' as const, label: 'Climb Rate', unit: 'm/s', min: 0, max: 10, step: 0.5, show: true },
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
        { key: 'param1' as const, label: 'Distance', unit: 'm', min: 0, max: 10000, step: 10, show: true },
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
        { key: 'altitude' as const, label: 'Target Altitude', unit: 'm', min: 0, max: 1000, step: 5, show: true },
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
    <div className="h-full flex flex-col bg-gray-900/50">
      {/* Content based on active mode - no tabs, controlled by toolbar */}
      <div className="flex-1 overflow-hidden">
        {activeMode === 'mission' && <WaypointListContent readOnly={readOnly} />}
        {activeMode === 'geofence' && <FenceListPanel readOnly={readOnly} />}
        {activeMode === 'rally' && <RallyListPanel readOnly={readOnly} />}
      </div>
    </div>
  );
}

// Extracted waypoint list content (original WaypointTablePanel content)
function WaypointListContent({ readOnly = false }: { readOnly?: boolean }) {
  const {
    missionItems,
    selectedSeq,
    currentSeq,
    setSelectedSeq,
    updateWaypoint,
    removeWaypoint,
    addWaypoint,
    reorderWaypoints,
  } = useMissionStore();

  const advancedLabels = useSettingsStore((s) => s.missionDefaults.advancedMissionLabels);
  const settingsFirmware = useSettingsStore((s) => s.missionDefaults.missionFirmware);
  const connectionState = useConnectionStore((s) => s.connectionState);

  const showSegmentColors = useSettingsStore((s) => s.missionDefaults.showSegmentColors);

  // Segment colors for sidebar indicators (matches map line colors)
  const itemColors = useMemo(() => computeItemColors(missionItems), [missionItems]);

  // When connected, auto-detect firmware from protocol. When disconnected, use setting.
  const effectiveFirmware: 'ardupilot' | 'inav' = connectionState.isConnected
    ? (connectionState.protocol === 'msp' && connectionState.fcVariant === 'INAV' ? 'inav' : 'ardupilot')
    : settingsFirmware;

  const [draggedSeq, setDraggedSeq] = useState<number | null>(null);
  const [dropTargetSeq, setDropTargetSeq] = useState<number | null>(null);
  const tableRef = useRef<HTMLDivElement>(null);

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

  return (
    <div className="h-full flex flex-col bg-gray-900/50">
      {/* Waypoint list */}
      <div className="flex-1 overflow-auto" ref={tableRef}>
        {missionItems.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500 p-4">
            <svg className="w-12 h-12 mb-3 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            {readOnly ? (
              <>
                <p className="text-sm font-medium mb-1">No mission loaded</p>
                <p className="text-xs text-gray-600 text-center">No mission on flight controller</p>
              </>
            ) : (
              <>
                <p className="text-sm font-medium mb-1">No waypoints yet</p>
                <p className="text-xs text-gray-600 text-center">Click "Add" below or click on the map to add waypoints</p>
              </>
            )}
          </div>
        ) : (
          <div className="divide-y divide-gray-800/50">
            {missionItems.map((wp) => {
              const isSelected = wp.seq === selectedSeq;
              const isCurrent = wp.seq === currentSeq;
              const isDragging = wp.seq === draggedSeq;
              const isDropTarget = wp.seq === dropTargetSeq;
              const isChild = !isNavigationCommand(wp.command);
              const segColor = showSegmentColors && !isCurrent && !(isSelected && !readOnly)
                ? (itemColors.get(wp.seq) ?? SEGMENT_COLORS.default)
                : undefined;

              return (
                <div
                  key={wp.seq}
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
                    readOnly ? '' : 'cursor-pointer'
                  } ${
                    isDropTarget ? 'border-t-2 border-t-blue-500' : ''
                  } ${
                    isDragging
                      ? 'opacity-50 bg-gray-800/50'
                      : isCurrent
                      ? 'bg-orange-500/10 border-l-2 border-l-orange-500'
                      : isSelected && !readOnly
                      ? 'bg-blue-500/20 border-l-2 border-l-blue-500'
                      : isChild
                      ? 'border-l-2 border-l-gray-700/50 ml-[14px] hover:bg-gray-800/20'
                      : readOnly
                      ? 'border-l-2 border-l-transparent'
                      : 'hover:bg-gray-800/30 border-l-2 border-l-transparent'
                  }`}
                >
                  {/* Drag handle - hidden in readOnly mode */}
                  {!readOnly && (
                    <div className="text-gray-600 cursor-grab active:cursor-grabbing">
                      <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                        <path d="M7 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM7 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 8a2 2 0 1 0 0 4 2 2 0 0 0 0-4zM13 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4z" />
                      </svg>
                    </div>
                  )}

                  {/* Badge: numbered circle for nav commands, small dot for child commands */}
                  {isChild ? (
                    <div className="w-5 h-5 rounded flex items-center justify-center shrink-0">
                      <div
                        className={`w-1.5 h-1.5 rounded-full ${
                          isCurrent ? 'bg-orange-400' : isSelected && !readOnly ? 'bg-blue-400' : !segColor ? 'bg-gray-500' : ''
                        }`}
                        style={segColor ? { backgroundColor: segColor } : undefined}
                      />
                    </div>
                  ) : (
                    <div
                      className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-orange-500 text-white'
                          : isSelected && !readOnly
                          ? 'bg-blue-500 text-white'
                          : segColor
                          ? 'text-white'
                          : 'bg-gray-700 text-gray-300'
                      }`}
                      style={segColor ? { backgroundColor: segColor } : undefined}
                    >
                      {wp.seq + 1}
                    </div>
                  )}

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className={`truncate ${
                      isChild ? 'text-xs text-gray-400' : 'text-sm text-gray-200'
                    }`}>
                      {getWaypointSummary(wp, advancedLabels)}
                    </div>
                    {commandHasLocation(wp.command) && (
                      <div className="text-[10px] text-gray-500 font-mono">
                        {wp.latitude.toFixed(5)}, {wp.longitude.toFixed(5)}
                      </div>
                    )}
                  </div>

                  {/* Delete button - hidden in readOnly mode */}
                  {!readOnly && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(wp.seq);
                      }}
                      className="p-1 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors shrink-0"
                      title="Delete"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Details panel for selected waypoint */}
      {selectedWaypoint && (
        <div className="border-t border-gray-700/50 bg-gray-800/40 p-3">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium text-gray-400">
              Editing Waypoint {selectedWaypoint.seq + 1}
            </span>
            <button
              onClick={() => setSelectedSeq(null)}
              className="text-gray-500 hover:text-gray-300"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Command selector */}
          <div className="mb-3">
            <label className="block text-[11px] text-gray-500 mb-1">Action</label>
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
              .map((param) => (
                <div key={param.key}>
                  <label className="block text-[11px] text-gray-500 mb-1">
                    {param.label} {param.unit && <span className="text-gray-600">({param.unit})</span>}
                  </label>
                  <input
                    type="number"
                    value={selectedWaypoint[param.key] as number}
                    onChange={(e) => handleParamChange(selectedWaypoint.seq, param.key, Number(e.target.value))}
                    min={param.min}
                    max={param.max}
                    step={param.step}
                    className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              ))}

            {/* Location fields for commands that have them */}
            {commandHasLocation(selectedWaypoint.command) && (
              <>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Latitude</label>
                  <input
                    type="number"
                    value={selectedWaypoint.latitude}
                    onChange={(e) => handleParamChange(selectedWaypoint.seq, 'latitude', Number(e.target.value))}
                    step={0.00001}
                    className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-gray-500 mb-1">Longitude</label>
                  <input
                    type="number"
                    value={selectedWaypoint.longitude}
                    onChange={(e) => handleParamChange(selectedWaypoint.seq, 'longitude', Number(e.target.value))}
                    step={0.00001}
                    className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none font-mono"
                  />
                </div>
              </>
            )}
          </div>

          {/* Help text */}
          {COMMAND_DESCRIPTIONS[selectedWaypoint.command] && (
            <p className="mt-3 text-[11px] text-gray-500 italic">
              {COMMAND_DESCRIPTIONS[selectedWaypoint.command]}
            </p>
          )}
        </div>
      )}

      {/* Add waypoint button - hidden in readOnly mode */}
      {!readOnly && (
        <div className="p-2 border-t border-gray-700/50">
          <button
            onClick={handleAddWaypoint}
            className="w-full py-2 text-sm text-gray-300 hover:text-white bg-gray-700/50 hover:bg-gray-600/50 rounded transition-colors flex items-center justify-center gap-2"
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
