/**
 * FlightModesTab
 *
 * Visual editor for ArduPilot flight mode configuration.
 * Shows 6 mode slots with dropdown selectors and PWM ranges.
 */

import React, { useMemo } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import {
  COPTER_MODES,
  FLIGHT_MODE_PRESETS,
  getModeInfo,
  isModeSafe,
  type FlightModePreset,
} from './presets/mavlink-presets';

// PWM ranges for each mode slot (standard 3-position switch mapping)
const MODE_PWM_RANGES = [
  { slot: 1, min: 900, max: 1230, label: 'Position 1 (Low)' },
  { slot: 2, min: 1231, max: 1360, label: 'Position 2' },
  { slot: 3, min: 1361, max: 1490, label: 'Position 3 (Mid)' },
  { slot: 4, min: 1491, max: 1620, label: 'Position 4' },
  { slot: 5, min: 1621, max: 1749, label: 'Position 5' },
  { slot: 6, min: 1750, max: 2100, label: 'Position 6 (High)' },
];

const FlightModesTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount } = useParameterStore();

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

  // Handle mode change
  const handleModeChange = (slot: number, modeNum: number) => {
    setParameter(`FLTMODE${slot}`, modeNum);
  };

  // Handle channel change
  const handleChannelChange = (channel: number) => {
    setParameter('FLTMODE_CH', channel);
  };

  // Apply preset
  const applyPreset = (preset: FlightModePreset) => {
    preset.modes.forEach((mode, index) => {
      setParameter(`FLTMODE${index + 1}`, mode);
    });
  };

  // Check if current config matches a preset
  const matchesPreset = (preset: FlightModePreset): boolean => {
    return preset.modes.every((mode, index) => flightModes[index] === mode);
  };

  const modified = modifiedCount();

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🎮</span>
        <div>
          <p className="text-blue-400 font-medium">How Flight Modes Work</p>
          <p className="text-sm text-zinc-400 mt-1">
            Your transmitter's mode switch sends different PWM values. Each slot below activates
            when the switch is in that position. Most pilots use a 3-position switch (slots 1, 3, 6).
          </p>
        </div>
      </div>

      {/* Quick Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Quick Presets</h3>
          <span className="text-xs text-zinc-500">Click to apply</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(FLIGHT_MODE_PRESETS).map(([key, preset]) => {
            const isActive = matchesPreset(preset);
            return (
              <button
                key={key}
                onClick={() => applyPreset(preset)}
                className={`p-4 rounded-xl border text-left transition-all hover:scale-[1.02] ${
                  isActive
                    ? 'bg-gradient-to-br border-blue-500/50 shadow-lg shadow-blue-500/20 ' + preset.color
                    : 'bg-gradient-to-br border-zinc-700/50 hover:border-zinc-600 ' + preset.color
                }`}
              >
                <div className="text-2xl mb-2">{preset.icon}</div>
                <div className={`font-medium ${isActive ? 'text-blue-300' : 'text-white'}`}>
                  {preset.name}
                </div>
                <div className="text-xs text-zinc-400 mt-1">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

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

      {/* Mode Slots Grid */}
      <div className="space-y-3">
        <h3 className="text-sm font-medium text-zinc-300">Flight Mode Slots</h3>
        <div className="grid grid-cols-2 gap-4">
          {MODE_PWM_RANGES.map((range) => {
            const currentMode = flightModes[range.slot - 1] ?? 0;
            const modeInfo = getModeInfo(currentMode);
            const isSafe = isModeSafe(currentMode);

            return (
              <div
                key={range.slot}
                className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-3"
              >
                {/* Header */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-xl ${
                      isSafe ? 'bg-green-500/20' : 'bg-orange-500/20'
                    }`}>
                      {modeInfo.icon}
                    </div>
                    <div>
                      <div className="text-sm font-medium text-white">Slot {range.slot}</div>
                      <div className="text-xs text-zinc-500">{range.label}</div>
                    </div>
                  </div>
                  {!isSafe && (
                    <span className="px-2 py-0.5 text-[10px] bg-orange-500/20 text-orange-400 rounded-full">
                      Advanced
                    </span>
                  )}
                </div>

                {/* PWM Range Indicator */}
                <div className="relative h-2 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="absolute h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
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
                  {Object.entries(COPTER_MODES).map(([num, mode]) => (
                    <option key={num} value={num}>
                      {mode.icon} {mode.name} {!mode.safe ? '⚠️' : ''}
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

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <span className="text-xl">💾</span>
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
            {Object.entries(COPTER_MODES)
              .filter(([, mode]) => mode.safe)
              .slice(0, 9)
              .map(([num, mode]) => (
                <div key={num} className="flex items-center gap-2 text-sm">
                  <span>{mode.icon}</span>
                  <span className="text-zinc-300">{mode.name}</span>
                  <span className="text-zinc-600">-</span>
                  <span className="text-xs text-zinc-500 truncate">{mode.description}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FlightModesTab;
