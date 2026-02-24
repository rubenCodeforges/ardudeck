import { useState, useRef, useEffect } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import {
  COMMAND_NAMES,
  COMMAND_DESCRIPTIONS,
  MAV_CMD,
  commandHasLocation,
  type MissionItem
} from '../../../shared/mission-types';
import { FenceListPanel } from '../geofence/FenceListPanel';
import { RallyListPanel } from '../rally/RallyListPanel';
import { useFenceStore } from '../../stores/fence-store';
import { useRallyStore } from '../../stores/rally-store';
import { useEditModeStore } from '../../stores/edit-mode-store';

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
      { value: MAV_CMD.NAV_LOITER_UNLIM, label: 'Loiter', desc: 'Circle until commanded' },
      { value: MAV_CMD.NAV_LOITER_TIME, label: 'Loiter Time', desc: 'Circle for set duration' },
      { value: MAV_CMD.NAV_LOITER_TURNS, label: 'Loiter Turns', desc: 'Circle N times' },
      { value: MAV_CMD.NAV_LOITER_TO_ALT, label: 'Loiter to Alt', desc: 'Loiter and change alt' },
      { value: MAV_CMD.NAV_LAND, label: 'Land', desc: 'Land at this location' },
      { value: MAV_CMD.NAV_RETURN_TO_LAUNCH, label: 'Return Home', desc: 'Fly back to launch' },
      { value: MAV_CMD.NAV_VTOL_TAKEOFF, label: 'VTOL Takeoff', desc: 'VTOL vertical takeoff' },
      { value: MAV_CMD.NAV_VTOL_LAND, label: 'VTOL Land', desc: 'VTOL vertical landing' },
      { value: MAV_CMD.NAV_DELAY, label: 'Wait', desc: 'Pause mission for time' },
      { value: MAV_CMD.NAV_PAYLOAD_PLACE, label: 'Payload Place', desc: 'Descend and release' },
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
      { value: MAV_CMD.DO_DIGICAM_CONTROL, label: 'Digicam Control', desc: 'Take a photo' },
      { value: MAV_CMD.DO_DIGICAM_CONFIGURE, label: 'Digicam Config', desc: 'Configure camera' },
      { value: MAV_CMD.DO_SET_ROI, label: 'Set ROI', desc: 'Point camera at location' },
      { value: MAV_CMD.DO_SET_ROI_LOCATION, label: 'ROI Location', desc: 'Point camera at GPS' },
      { value: MAV_CMD.DO_SET_ROI_NONE, label: 'ROI None', desc: 'Stop camera tracking' },
      { value: MAV_CMD.DO_MOUNT_CONTROL, label: 'Mount Control', desc: 'Set gimbal angles' },
    ],
  },
  {
    group: 'Actions',
    commands: [
      { value: MAV_CMD.DO_CHANGE_SPEED, label: 'Set Speed', desc: 'Change flight speed' },
      { value: MAV_CMD.DO_SET_HOME, label: 'Set Home', desc: 'Set new home position' },
      { value: MAV_CMD.DO_JUMP, label: 'Jump', desc: 'Jump to WP and repeat' },
      { value: MAV_CMD.DO_SET_SERVO, label: 'Set Servo', desc: 'Set servo PWM' },
      { value: MAV_CMD.DO_SET_RELAY, label: 'Set Relay', desc: 'Set relay on/off' },
      { value: MAV_CMD.DO_FENCE_ENABLE, label: 'Fence Enable', desc: 'Enable/disable geofence' },
      { value: MAV_CMD.DO_PARACHUTE, label: 'Parachute', desc: 'Deploy parachute' },
      { value: MAV_CMD.DO_GRIPPER, label: 'Gripper', desc: 'Open/close gripper' },
      { value: MAV_CMD.DO_VTOL_TRANSITION, label: 'VTOL Transition', desc: 'Switch VTOL/FW mode' },
      { value: MAV_CMD.DO_LAND_START, label: 'Land Start', desc: 'Begin landing sequence' },
      { value: MAV_CMD.DO_CHANGE_ALTITUDE, label: 'Change Alt', desc: 'Change altitude' },
    ],
  },
];

// Flat list of all available commands (for lookup)
const ALL_AVAILABLE_COMMANDS = COMMAND_GROUPS.flatMap(g => g.commands);

// Get friendly description for a waypoint
function getWaypointSummary(wp: MissionItem): string {
  const radiusSuffix = wp.param3 > 0 ? ` (${wp.param3}m radius)` : '';

  switch (wp.command) {
    // Navigation
    case MAV_CMD.NAV_TAKEOFF:
      return `Takeoff to ${wp.altitude}m`;
    case MAV_CMD.NAV_WAYPOINT:
      return wp.param1 > 0 ? `Fly here, wait ${wp.param1}s` : 'Fly here';
    case MAV_CMD.NAV_SPLINE_WAYPOINT:
      return wp.param1 > 0 ? `Smooth path, wait ${wp.param1}s` : 'Smooth path';
    case MAV_CMD.NAV_LOITER_UNLIM:
      return `Circle here${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TIME:
      return `Circle for ${wp.param1}s${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TURNS:
      return `Circle ${wp.param1}x${radiusSuffix}`;
    case MAV_CMD.NAV_LOITER_TO_ALT:
      return `Loiter to ${wp.altitude}m${radiusSuffix}`;
    case MAV_CMD.NAV_LAND:
      return 'Land here';
    case MAV_CMD.NAV_RETURN_TO_LAUNCH:
      return 'Return to home';
    case MAV_CMD.NAV_VTOL_TAKEOFF:
      return `VTOL Takeoff to ${wp.altitude}m`;
    case MAV_CMD.NAV_VTOL_LAND:
      return 'VTOL Land here';
    case MAV_CMD.NAV_DELAY:
      return `Wait ${wp.param1}s`;
    case MAV_CMD.NAV_PAYLOAD_PLACE:
      return wp.param1 > 0 ? `Place payload (max ${wp.param1}m desc)` : 'Place payload';
    case MAV_CMD.NAV_CONTINUE_AND_CHANGE_ALT:
      return `Continue, change to ${wp.altitude}m`;
    case MAV_CMD.NAV_GUIDED_ENABLE:
      return wp.param1 > 0 ? 'Enable guided mode' : 'Disable guided mode';

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
      return wp.param1 > 0 ? `Camera every ${wp.param1}m` : 'Camera trigger off';
    case MAV_CMD.DO_DIGICAM_CONTROL:
      return 'Take photo';
    case MAV_CMD.DO_DIGICAM_CONFIGURE:
      return 'Configure camera';
    case MAV_CMD.DO_SET_ROI:
    case MAV_CMD.DO_SET_ROI_LOCATION:
      return 'Point camera here';
    case MAV_CMD.DO_SET_ROI_NONE:
      return 'Stop camera tracking';
    case MAV_CMD.DO_MOUNT_CONTROL:
      return 'Set gimbal angles';
    case MAV_CMD.DO_MOUNT_CONFIGURE:
      return 'Configure gimbal';
    case MAV_CMD.DO_CONTROL_VIDEO:
      return 'Control video';

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

    default:
      return COMMAND_NAMES[wp.command] || `Command ${wp.command}`;
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
    // Get GPS state without subscribing (avoids re-renders)
    const gpsState = getGpsState();

    // Use GPS position if available, otherwise last waypoint, otherwise default
    const baseLat = lastWp?.latitude ?? (gpsState.hasGpsFix ? gpsState.lat : 0);
    const baseLon = lastWp?.longitude ?? (gpsState.hasGpsFix ? gpsState.lon : 0);
    const alt = lastWp?.altitude ?? 100;

    // Offset slightly from last position
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

  const getCommandName = (cmd: number) => COMMAND_NAMES[cmd] || `CMD ${cmd}`;
  const getCommandInfo = (cmd: number) => ALL_AVAILABLE_COMMANDS.find(c => c.value === cmd);

  return (
    <div className="h-full flex flex-col bg-gray-900/50">
      {/* Simple table - just # and description */}
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
              const cmdInfo = getCommandInfo(wp.command);

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
                  className={`flex items-center gap-2 px-2 py-2 transition-colors ${
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

                  {/* Number badge */}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${
                    isCurrent
                      ? 'bg-orange-500 text-white'
                      : isSelected && !readOnly
                      ? 'bg-blue-500 text-white'
                      : 'bg-gray-700 text-gray-300'
                  }`}>
                    {wp.seq + 1}
                  </div>

                  {/* Description */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 truncate">
                      {getWaypointSummary(wp)}
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
            <select
              value={selectedWaypoint.command}
              onChange={(e) => handleCommandChange(selectedWaypoint.seq, Number(e.target.value))}
              className="w-full bg-gray-700 text-gray-200 text-sm px-2 py-1.5 rounded border border-gray-600 focus:border-blue-500 focus:outline-none"
            >
              {COMMAND_GROUPS.map((group) => (
                <optgroup key={group.group} label={group.group}>
                  {group.commands.map((cmd) => (
                    <option key={cmd.value} value={cmd.value}>
                      {cmd.label} -- {cmd.desc}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
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
