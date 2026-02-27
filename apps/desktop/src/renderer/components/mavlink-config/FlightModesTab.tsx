/**
 * FlightModesTab
 *
 * Visual editor for ArduPilot flight mode configuration.
 * Shows 6 mode slots with dropdown selectors, PWM ranges, and live RC visualization.
 */

import React, { useMemo, useEffect, useState } from 'react';
import {
  Settings,
  Shield,
  TrendingUp,
  Map,
  Hand,
  Gamepad2,
  Ruler,
  Navigation,
  MapPin,
  Lock,
  Home,
  Circle,
  PlaneLanding,
  Wind,
  Dumbbell,
  RotateCcw,
  Wrench,
  Pin,
  Octagon,
  Rocket,
  Plane,
  Users,
  Zap,
  Move,
  AlertTriangle,
  HelpCircle,
  Activity,
  ToggleLeft,
  ToggleRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';

import { InfoCard } from '../ui/InfoCard';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import {
  FLIGHT_MODE_PRESETS,
  PLANE_FLIGHT_MODE_PRESETS,
  type FlightModePreset,
} from './presets/mavlink-presets';

// PWM ranges for each mode slot (standard 3-position switch mapping)
const MODE_PWM_RANGES = [
  { slot: 1, min: 900, max: 1230, label: 'Position 1 (Low)', position: 'low', group: 1 },
  { slot: 2, min: 1231, max: 1360, label: 'Position 2', position: 'low', group: 1 },
  { slot: 3, min: 1361, max: 1490, label: 'Position 3 (Mid)', position: 'mid', group: 2 },
  { slot: 4, min: 1491, max: 1620, label: 'Position 4', position: 'mid', group: 2 },
  { slot: 5, min: 1621, max: 1749, label: 'Position 5', position: 'high', group: 3 },
  { slot: 6, min: 1750, max: 2100, label: 'Position 6 (High)', position: 'high', group: 3 },
];

// Switch position groupings (for 3-position switch)
const SWITCH_POSITIONS = [
  { name: 'Low', label: 'Switch Down', slots: [1, 2], color: 'bg-blue-500' },
  { name: 'Mid', label: 'Switch Center', slots: [3, 4], color: 'bg-purple-500' },
  { name: 'High', label: 'Switch Up', slots: [5, 6], color: 'bg-orange-500' },
];

// Primary slots for simple mode (most commonly used with 3-position switch)
const PRIMARY_SLOTS = [1, 3, 6];

// ArduCopter flight modes with proper icons
const COPTER_MODES: Record<number, { name: string; description: string; icon: React.ElementType; safe: boolean }> = {
  0: { name: 'Stabilize', description: 'Manual flight with self-leveling', icon: Hand, safe: true },
  1: { name: 'Acro', description: 'Full manual control, no self-leveling', icon: Gamepad2, safe: false },
  2: { name: 'AltHold', description: 'Altitude hold with manual position', icon: Ruler, safe: true },
  3: { name: 'Auto', description: 'Follow mission waypoints', icon: Map, safe: true },
  4: { name: 'Guided', description: 'Fly to GCS-commanded points', icon: Navigation, safe: true },
  5: { name: 'Loiter', description: 'Hold position and altitude', icon: Lock, safe: true },
  6: { name: 'RTL', description: 'Return to launch point', icon: Home, safe: true },
  7: { name: 'Circle', description: 'Circle around a point', icon: Circle, safe: true },
  9: { name: 'Land', description: 'Automatic landing', icon: PlaneLanding, safe: true },
  11: { name: 'Drift', description: 'Like Stabilize but with drift', icon: Wind, safe: false },
  13: { name: 'Sport', description: 'Stabilize with higher rates', icon: Dumbbell, safe: false },
  14: { name: 'Flip', description: 'Automatic flip maneuver', icon: RotateCcw, safe: false },
  15: { name: 'AutoTune', description: 'Automatic PID tuning', icon: Wrench, safe: true },
  16: { name: 'PosHold', description: 'Position hold like Loiter', icon: Pin, safe: true },
  17: { name: 'Brake', description: 'Stop immediately', icon: Octagon, safe: true },
  18: { name: 'Throw', description: 'Throw to start', icon: Rocket, safe: false },
  19: { name: 'Avoid_ADSB', description: 'Avoid other aircraft', icon: Plane, safe: true },
  20: { name: 'Guided_NoGPS', description: 'Guided without GPS', icon: Navigation, safe: false },
  21: { name: 'Smart_RTL', description: 'Return via original path', icon: Home, safe: true },
  22: { name: 'FlowHold', description: 'Position hold with optical flow', icon: Move, safe: true },
  23: { name: 'Follow', description: 'Follow another vehicle', icon: Users, safe: true },
  24: { name: 'ZigZag', description: 'Zigzag survey pattern', icon: Zap, safe: true },
  25: { name: 'SystemID', description: 'System identification', icon: Activity, safe: false },
};

// ArduPlane flight modes with proper icons
const PLANE_MODES: Record<number, { name: string; description: string; icon: React.ElementType; safe: boolean }> = {
  0: { name: 'Manual', description: 'Full manual control', icon: Hand, safe: false },
  1: { name: 'Circle', description: 'Circle around a point', icon: Circle, safe: true },
  2: { name: 'Stabilize', description: 'Level flight with manual throttle', icon: Hand, safe: true },
  3: { name: 'Training', description: 'Limits roll/pitch but allows recovery', icon: Dumbbell, safe: true },
  4: { name: 'Acro', description: 'Rate-controlled aerobatics', icon: Gamepad2, safe: false },
  5: { name: 'FBWA', description: 'Fly By Wire A - stabilized manual', icon: Plane, safe: true },
  6: { name: 'FBWB', description: 'Fly By Wire B - speed/altitude hold', icon: Plane, safe: true },
  7: { name: 'Cruise', description: 'Throttle and roll hold heading/alt', icon: Navigation, safe: true },
  8: { name: 'AutoTune', description: 'Automatic PID tuning', icon: Wrench, safe: true },
  10: { name: 'Auto', description: 'Follow mission waypoints', icon: Map, safe: true },
  11: { name: 'RTL', description: 'Return to launch point', icon: Home, safe: true },
  12: { name: 'Loiter', description: 'Circle and hold position', icon: Lock, safe: true },
  13: { name: 'Takeoff', description: 'Automatic takeoff', icon: Rocket, safe: true },
  14: { name: 'Avoid_ADSB', description: 'Avoid other aircraft', icon: AlertTriangle, safe: true },
  15: { name: 'Guided', description: 'Fly to GCS-commanded points', icon: Navigation, safe: true },
  17: { name: 'QStabilize', description: 'VTOL stabilize mode', icon: Hand, safe: true },
  18: { name: 'QHover', description: 'VTOL hover in place', icon: Pin, safe: true },
  19: { name: 'QLoiter', description: 'VTOL position hold', icon: Lock, safe: true },
  20: { name: 'QLand', description: 'VTOL automatic landing', icon: PlaneLanding, safe: true },
  21: { name: 'QRTL', description: 'VTOL return to launch', icon: Home, safe: true },
  22: { name: 'QAutotune', description: 'VTOL automatic PID tuning', icon: Wrench, safe: true },
  23: { name: 'QAcro', description: 'VTOL rate-controlled aerobatics', icon: Gamepad2, safe: false },
  24: { name: 'Thermal', description: 'Soaring thermal detection', icon: Wind, safe: true },
  25: { name: 'Loiter to QLand', description: 'Loiter then VTOL land', icon: PlaneLanding, safe: true },
};

// ArduRover drive modes
const ROVER_MODES: Record<number, { name: string; description: string; icon: React.ElementType; safe: boolean }> = {
  0: { name: 'Manual', description: 'Full manual throttle and steering', icon: Hand, safe: true },
  1: { name: 'Acro', description: 'Manual with turn rate control', icon: Gamepad2, safe: false },
  3: { name: 'Steering', description: 'Manual steering, speed controlled', icon: Navigation, safe: true },
  4: { name: 'Hold', description: 'Stop and hold position', icon: Lock, safe: true },
  5: { name: 'Loiter', description: 'Hold position using GPS', icon: Pin, safe: true },
  6: { name: 'Follow', description: 'Follow another vehicle', icon: Users, safe: true },
  7: { name: 'Simple', description: 'Simplified control relative to home', icon: Home, safe: true },
  10: { name: 'Auto', description: 'Follow mission waypoints', icon: Map, safe: true },
  11: { name: 'RTL', description: 'Return to launch point', icon: Home, safe: true },
  12: { name: 'Smart RTL', description: 'Return via original path', icon: Home, safe: true },
  15: { name: 'Guided', description: 'Drive to GCS-commanded points', icon: Navigation, safe: true },
  16: { name: 'Initialising', description: 'System initializing', icon: Activity, safe: false },
};

// Convert FLIGHT_MODE_PRESETS to PresetSelector format
const COPTER_PRESET_SELECTOR: Record<string, Preset> = {
  beginner: {
    name: 'Beginner',
    description: FLIGHT_MODE_PRESETS.beginner!.description,
    icon: Shield,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  intermediate: {
    name: 'Intermediate',
    description: FLIGHT_MODE_PRESETS.intermediate!.description,
    icon: TrendingUp,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  advanced: {
    name: 'Advanced',
    description: FLIGHT_MODE_PRESETS.advanced!.description,
    icon: Settings,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30',
  },
  mapping: {
    name: 'Mapping',
    description: FLIGHT_MODE_PRESETS.mapping!.description,
    icon: Map,
    iconColor: 'text-amber-400',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  },
};

const PLANE_PRESET_SELECTOR: Record<string, Preset> = {
  beginner: {
    name: 'Beginner',
    description: PLANE_FLIGHT_MODE_PRESETS.beginner!.description,
    icon: Shield,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  intermediate: {
    name: 'Intermediate',
    description: PLANE_FLIGHT_MODE_PRESETS.intermediate!.description,
    icon: TrendingUp,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  advanced: {
    name: 'Advanced',
    description: PLANE_FLIGHT_MODE_PRESETS.advanced!.description,
    icon: Settings,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30',
  },
  vtol: {
    name: 'VTOL',
    description: PLANE_FLIGHT_MODE_PRESETS.vtol!.description,
    icon: Plane,
    iconColor: 'text-amber-400',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  },
};

type VehicleCategory = 'copter' | 'plane' | 'rover';

function getModesForCategory(category: VehicleCategory) {
  switch (category) {
    case 'plane': return PLANE_MODES;
    case 'rover': return ROVER_MODES;
    default: return COPTER_MODES;
  }
}

function getModeInfo(modeNum: number, category: VehicleCategory = 'copter') {
  const modes = getModesForCategory(category);
  return modes[modeNum] ?? { name: 'Unknown', description: 'Unknown mode', icon: HelpCircle, safe: false };
}

interface FlightModesTabProps {
  vehicleCategory?: VehicleCategory;
}

const FlightModesTab: React.FC<FlightModesTabProps> = ({ vehicleCategory = 'copter' }) => {
  const isRover = vehicleCategory === 'rover';
  const { parameters, setParameter, modifiedCount } = useParameterStore();
  const rcChannels = null as number[] | null;
  const [liveRcValue, setLiveRcValue] = useState<number>(1500);
  const [advancedMode, setAdvancedMode] = useState<boolean>(true);
  const [showRcBar, setShowRcBar] = useState<boolean>(false);

  // Get current flight mode values
  const flightModes = useMemo(() => {
    const modes: number[] = [];
    for (let i = 1; i <= 6; i++) {
      const param = parameters.get(`FLTMODE${i}`);
      modes.push(param?.value ?? 0);
    }
    return modes;
  }, [parameters]);

  // Get mode channel
  const modeChannel = useMemo(() => {
    const param = parameters.get('FLTMODE_CH');
    return param?.value ?? 5;
  }, [parameters]);

  // Update live RC value from telemetry
  useEffect(() => {
    if (rcChannels && modeChannel >= 1 && modeChannel <= rcChannels.length) {
      setLiveRcValue(rcChannels[modeChannel - 1] ?? 1500);
    }
  }, [rcChannels, modeChannel]);

  // Determine which mode slot is currently active
  const activeSlot = useMemo(() => {
    for (const range of MODE_PWM_RANGES) {
      if (liveRcValue >= range.min && liveRcValue <= range.max) {
        return range.slot;
      }
    }
    return null;
  }, [liveRcValue]);

  // Handle mode change
  const handleModeChange = (slot: number, modeNum: number) => {
    setParameter(`FLTMODE${slot}`, modeNum);
  };

  // Handle channel change
  const handleChannelChange = (channel: number) => {
    setParameter('FLTMODE_CH', channel);
  };

  // Get presets for current vehicle category
  const presetData = vehicleCategory === 'plane' ? PLANE_FLIGHT_MODE_PRESETS : FLIGHT_MODE_PRESETS;
  const presetSelectorPresets = vehicleCategory === 'plane' ? PLANE_PRESET_SELECTOR : COPTER_PRESET_SELECTOR;

  // Apply preset
  const applyPreset = (presetKey: string) => {
    const preset = presetData[presetKey];
    if (preset) {
      preset.modes.forEach((mode, index) => {
        setParameter(`FLTMODE${index + 1}`, mode);
      });
    }
  };

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Header with View Mode Toggle */}
      <div className="flex items-center justify-between">
        <InfoCard title={isRover ? "Drive Mode Configuration" : vehicleCategory === 'plane' ? "Plane Mode Configuration" : "Flight Mode Configuration"} variant="info" className="flex-1">
          {advancedMode
            ? `Configure all 6 mode slots for fine-grained control with multi-position switches.`
            : `Configure the 3 primary switch positions. Most transmitters use a 3-position switch.`}
        </InfoCard>
        <button
          onClick={() => setAdvancedMode(!advancedMode)}
          className={`ml-4 flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
            advancedMode
              ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
          }`}
        >
          {advancedMode ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
          {advancedMode ? 'Advanced' : 'Simple'}
        </button>
      </div>

      {/* Visual Switch Position Diagram */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Switch Position Diagram</h3>
        <div className="flex items-center justify-center gap-8">
          {/* Physical switch representation */}
          <div className="flex flex-col items-center">
            <div className="w-12 h-32 bg-zinc-800 rounded-lg relative border border-zinc-700">
              {/* Switch positions markers */}
              <div className="absolute top-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-orange-500/50 rounded" />
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-1 bg-purple-500/50 rounded" />
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 w-8 h-1 bg-blue-500/50 rounded" />
              {/* Active position indicator */}
              {activeSlot && (
                <div
                  className={`absolute left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-cyan-500 shadow-lg shadow-cyan-500/50 transition-all duration-300 ${
                    activeSlot <= 2 ? 'bottom-1' : activeSlot <= 4 ? 'top-1/2 -translate-y-1/2' : 'top-1'
                  }`}
                />
              )}
            </div>
            <span className="text-xs text-zinc-500 mt-2">Mode Switch</span>
          </div>

          {/* Position to modes mapping */}
          <div className="flex-1 space-y-2">
            {SWITCH_POSITIONS.map((pos, idx) => {
              const isPositionActive = activeSlot !== null && pos.slots.includes(activeSlot);
              const primarySlot = pos.slots[idx === 2 ? 1 : 0]!;
              const modeInfo = getModeInfo(flightModes[primarySlot - 1] ?? 0, vehicleCategory);
              const IconComponent = modeInfo.icon;

              return (
                <div
                  key={pos.name}
                  className={`flex items-center gap-3 p-3 rounded-lg transition-colors ${
                    isPositionActive
                      ? 'bg-cyan-500/10 border border-cyan-500/30'
                      : 'bg-zinc-800/50 border border-transparent'
                  }`}
                >
                  <div className={`w-3 h-3 rounded-full ${pos.color}`} />
                  <div className="w-16">
                    <div className={`text-sm font-medium ${isPositionActive ? 'text-cyan-400' : 'text-zinc-300'}`}>
                      {pos.name}
                    </div>
                    <div className="text-[10px] text-zinc-500">{pos.label}</div>
                  </div>
                  <div className="flex-1 flex items-center gap-2">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                      isPositionActive ? 'bg-cyan-500/20' : 'bg-zinc-700/50'
                    }`}>
                      <IconComponent className={`w-4 h-4 ${isPositionActive ? 'text-cyan-400' : 'text-zinc-400'}`} />
                    </div>
                    <span className={`text-sm ${isPositionActive ? 'text-cyan-300' : 'text-zinc-400'}`}>
                      {modeInfo.name}
                    </span>
                  </div>
                  <span className="text-xs text-zinc-600">
                    Slots {pos.slots.join(', ')}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Quick Presets */}
      <PresetSelector
        presets={presetSelectorPresets}
        onApply={applyPreset}
        label="Quick Presets"
        hint="Click to apply a mode configuration"
      />

      {/* Collapsible Live RC Channel Visualization */}
      {rcChannels && rcChannels.length > 0 && (
        <div className="bg-gradient-to-r from-cyan-500/10 to-blue-500/5 rounded-xl border border-cyan-500/20">
          <button
            onClick={() => setShowRcBar(!showRcBar)}
            className="w-full p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <span className="text-sm text-cyan-300">Live RC: Channel {modeChannel}</span>
              <span className="text-lg font-mono text-cyan-400">{liveRcValue}</span>
              {activeSlot && (
                <span className="px-2 py-0.5 bg-cyan-500/20 text-cyan-400 rounded text-xs">
                  {getModeInfo(flightModes[activeSlot - 1] ?? 0, vehicleCategory).name}
                </span>
              )}
            </div>
            {showRcBar ? <ChevronUp className="w-4 h-4 text-cyan-400" /> : <ChevronDown className="w-4 h-4 text-cyan-400" />}
          </button>

          {showRcBar && (
            <div className="px-4 pb-4">
              {/* PWM bar with mode zones */}
              <div className="relative h-6 bg-zinc-800 rounded-full overflow-hidden">
                {MODE_PWM_RANGES.map((range, idx) => {
                  const left = ((range.min - 900) / 1200) * 100;
                  const width = ((range.max - range.min) / 1200) * 100;
                  const isActive = activeSlot === range.slot;
                  return (
                    <div
                      key={range.slot}
                      className={`absolute top-0 h-full transition-colors ${
                        isActive ? 'bg-cyan-500/40' : idx % 2 === 0 ? 'bg-zinc-700/30' : 'bg-zinc-700/50'
                      }`}
                      style={{ left: `${left}%`, width: `${width}%` }}
                    >
                      <span className={`absolute inset-0 flex items-center justify-center text-xs ${
                        isActive ? 'text-cyan-300 font-medium' : 'text-zinc-500'
                      }`}>
                        {range.slot}
                      </span>
                    </div>
                  );
                })}
                <div
                  className="absolute top-0 h-full w-1 bg-yellow-400 shadow-lg shadow-yellow-400/50 transition-all"
                  style={{ left: `${Math.max(0, Math.min(100, ((liveRcValue - 900) / 1200) * 100))}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-[10px] text-zinc-500">
                <span>900</span>
                <span>1500</span>
                <span>2100</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Mode Channel Selector */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-zinc-300">Mode Switch Channel</h3>
            <p className="text-xs text-zinc-500 mt-0.5">Which RC channel controls flight modes</p>
          </div>
          <select
            value={modeChannel}
            onChange={(e) => handleChannelChange(Number(e.target.value))}
            className="px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
          >
            {[5, 6, 7, 8, 9, 10, 11, 12].map((ch) => (
              <option key={ch} value={ch}>
                Channel {ch}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Mode Slots - Simple Mode (Primary 3 positions) */}
      {!advancedMode && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">{isRover ? 'Drive' : 'Flight'} Modes (3-Position Switch)</h3>
          <div className="grid grid-cols-3 gap-4">
            {SWITCH_POSITIONS.map((pos) => {
              const primarySlot = pos.name === 'High' ? 6 : pos.name === 'Mid' ? 3 : 1;
              const currentMode = flightModes[primarySlot - 1] ?? 0;
              const modeInfo = getModeInfo(currentMode, vehicleCategory);
              const isSafe = modeInfo.safe;
              const isActive = activeSlot !== null && pos.slots.includes(activeSlot);
              const IconComponent = modeInfo.icon;

              return (
                <div
                  key={pos.name}
                  className={`bg-zinc-900/50 rounded-xl border p-4 space-y-3 transition-all ${
                    isActive
                      ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                      : 'border-zinc-800/50'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                      isActive ? 'bg-cyan-500/20' : isSafe ? 'bg-green-500/20' : 'bg-orange-500/20'
                    }`}>
                      <IconComponent className={`w-5 h-5 ${
                        isActive ? 'text-cyan-400' : isSafe ? 'text-green-400' : 'text-orange-400'
                      }`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${pos.color}`} />
                        <span className="text-sm font-medium text-white">{pos.name}</span>
                      </div>
                      <div className="text-xs text-zinc-500">{pos.label}</div>
                    </div>
                    {isActive && (
                      <span className="ml-auto px-2 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-400 rounded-full">
                        ACTIVE
                      </span>
                    )}
                  </div>

                  {/* Mode Selector */}
                  <select
                    value={currentMode}
                    onChange={(e) => {
                      const newMode = Number(e.target.value);
                      // Set both slots in this position group
                      pos.slots.forEach(slot => handleModeChange(slot, newMode));
                    }}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(getModesForCategory(vehicleCategory)).map(([num, mode]) => (
                      <option key={num} value={num}>
                        {mode.name} {!mode.safe ? '(Advanced)' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Mode Description */}
                  <p className="text-xs text-zinc-500">{modeInfo.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Mode Slots - Advanced Mode (All 6 slots) */}
      {advancedMode && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium text-zinc-300">{isRover ? 'Drive' : 'Flight'} Mode Slots (All 6)</h3>
          <div className="grid grid-cols-2 gap-4">
            {MODE_PWM_RANGES.map((range) => {
              const currentMode = flightModes[range.slot - 1] ?? 0;
              const modeInfo = getModeInfo(currentMode, vehicleCategory);
              const isSafe = modeInfo.safe;
              const isActive = activeSlot === range.slot;
              const IconComponent = modeInfo.icon;
              const positionInfo = SWITCH_POSITIONS.find(p => p.slots.includes(range.slot));

              return (
                <div
                  key={range.slot}
                  className={`bg-zinc-900/50 rounded-xl border p-4 space-y-3 transition-all ${
                    isActive
                      ? 'border-cyan-500/50 shadow-lg shadow-cyan-500/10'
                      : 'border-zinc-800/50'
                  }`}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                        isActive ? 'bg-cyan-500/20' : isSafe ? 'bg-green-500/20' : 'bg-orange-500/20'
                      }`}>
                        <IconComponent className={`w-5 h-5 ${
                          isActive ? 'text-cyan-400' : isSafe ? 'text-green-400' : 'text-orange-400'
                        }`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-white">Slot {range.slot}</span>
                          {positionInfo && (
                            <span className={`w-2 h-2 rounded-full ${positionInfo.color}`} />
                          )}
                        </div>
                        <div className="text-xs text-zinc-500">{range.label}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {isActive && (
                        <span className="px-2 py-0.5 text-[10px] bg-cyan-500/20 text-cyan-400 rounded-full">
                          ACTIVE
                        </span>
                      )}
                      {!isSafe && (
                        <span className="px-2 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded-full">
                          Advanced
                        </span>
                      )}
                    </div>
                  </div>

                  {/* PWM Range Indicator */}
                  <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                    <div
                      className={`absolute h-full rounded-full ${
                        isActive ? 'bg-cyan-500' : 'bg-gradient-to-r from-blue-500 to-blue-400'
                      }`}
                      style={{
                        left: `${((range.min - 900) / 1200) * 100}%`,
                        width: `${((range.max - range.min) / 1200) * 100}%`,
                      }}
                    />
                  </div>
                  <div className="flex justify-between text-[10px] text-zinc-500 font-mono">
                    <span>{range.min}</span>
                    <span>{range.max}</span>
                  </div>

                  {/* Mode Selector */}
                  <select
                    value={currentMode}
                    onChange={(e) => handleModeChange(range.slot, Number(e.target.value))}
                    className="w-full px-3 py-2.5 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
                  >
                    {Object.entries(getModesForCategory(vehicleCategory)).map(([num, mode]) => (
                      <option key={num} value={num}>
                        {mode.name} {!mode.safe ? '(Advanced)' : ''}
                      </option>
                    ))}
                  </select>

                  {/* Mode Description */}
                  <p className="text-xs text-zinc-500">{modeInfo.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}

      {/* Mode Reference */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Mode Reference</h3>
        <div className="bg-zinc-900/30 rounded-xl border border-zinc-800/30 p-4">
          <div className="grid grid-cols-3 gap-3">
            {Object.entries(getModesForCategory(vehicleCategory))
              .filter(([, mode]) => mode.safe)
              .slice(0, 9)
              .map(([num, mode]) => {
                const IconComponent = mode.icon;
                return (
                  <div key={num} className="flex items-center gap-2 text-sm">
                    <IconComponent className="w-4 h-4 text-zinc-400" />
                    <span className="text-zinc-300">{mode.name}</span>
                    <span className="text-zinc-600">-</span>
                    <span className="text-xs text-zinc-500 truncate">{mode.description}</span>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightModesTab;
