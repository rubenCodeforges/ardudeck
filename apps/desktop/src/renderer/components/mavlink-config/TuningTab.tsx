/**
 * TuningTab
 *
 * Simplified tuning with presets for skill levels and mission types.
 * Hides PID complexity while giving users meaningful control.
 */

import React, { useMemo } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import {
  SKILL_PRESETS,
  MISSION_PRESETS,
  type SkillPreset,
  type MissionPreset,
} from './presets/mavlink-presets';

const TuningTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount } = useParameterStore();

  // Get current tuning values
  const tuningValues = useMemo(() => ({
    // Acro rates
    acroRpRate: parameters.get('ACRO_RP_RATE')?.value ?? 180,
    acroYRate: parameters.get('ACRO_Y_RATE')?.value ?? 90,
    // Angle limits
    angleMax: parameters.get('ANGLE_MAX')?.value ?? 4500,
    // Position controller
    pscVelxyP: parameters.get('PSC_VELXY_P')?.value ?? 4.0,
    pscPosxyP: parameters.get('PSC_POSXY_P')?.value ?? 1.0,
    // Loiter
    loitSpeed: parameters.get('LOIT_SPEED')?.value ?? 1000,
    loitAccMax: parameters.get('LOIT_ACC_MAX')?.value ?? 400,
    // Waypoint nav
    wpnavSpeed: parameters.get('WPNAV_SPEED')?.value ?? 1000,
    wpnavAccel: parameters.get('WPNAV_ACCEL')?.value ?? 250,
    wpnavRadius: parameters.get('WPNAV_RADIUS')?.value ?? 200,
  }), [parameters]);

  // Apply skill preset
  const applySkillPreset = (preset: SkillPreset) => {
    Object.entries(preset.params).forEach(([param, value]) => {
      setParameter(param, value);
    });
  };

  // Apply mission preset
  const applyMissionPreset = (preset: MissionPreset) => {
    Object.entries(preset.params).forEach(([param, value]) => {
      setParameter(param, value);
    });
  };

  // Check if current config matches a skill preset
  const matchesSkillPreset = (preset: SkillPreset): boolean => {
    return Object.entries(preset.params).every(
      ([param, value]) => parameters.get(param)?.value === value
    );
  };

  // Check if current config matches a mission preset
  const matchesMissionPreset = (preset: MissionPreset): boolean => {
    return Object.entries(preset.params).every(
      ([param, value]) => parameters.get(param)?.value === value
    );
  };

  const modified = modifiedCount();

  // Helper to convert centidegrees to degrees
  const angleMaxDeg = tuningValues.angleMax / 100;

  return (
    <div className="p-6 space-y-6">
      {/* Help Card */}
      <div className="bg-blue-500/10 rounded-xl border border-blue-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🎛️</span>
        <div>
          <p className="text-blue-400 font-medium">Tuning Made Simple</p>
          <p className="text-sm text-zinc-400 mt-1">
            Presets adjust multiple parameters at once for the best flying experience.
            Choose your skill level first, then optionally pick a mission type.
          </p>
        </div>
      </div>

      {/* Skill Level Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Skill Level</h3>
          <span className="text-xs text-zinc-500">How responsive should the aircraft be?</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {Object.entries(SKILL_PRESETS).map(([key, preset]) => {
            const isActive = matchesSkillPreset(preset);
            return (
              <button
                key={key}
                onClick={() => applySkillPreset(preset)}
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

      {/* Mission Type Presets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Mission Type</h3>
          <span className="text-xs text-zinc-500">What are you flying for?</span>
        </div>
        <div className="grid grid-cols-4 gap-3">
          {Object.entries(MISSION_PRESETS).map(([key, preset]) => {
            const isActive = matchesMissionPreset(preset);
            return (
              <button
                key={key}
                onClick={() => applyMissionPreset(preset)}
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
                <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{preset.description}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Current Settings Overview */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300">Current Settings</h3>

        <div className="grid grid-cols-3 gap-4">
          {/* Responsiveness */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <span className="text-sm">⚡</span>
              </div>
              <span className="text-xs text-zinc-400">Responsiveness</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Max Angle</span>
                <span className="text-white font-mono">{angleMaxDeg}°</span>
              </div>
              <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-purple-500 to-purple-400 rounded-full"
                  style={{ width: `${(tuningValues.angleMax / 8000) * 100}%` }}
                />
              </div>
            </div>
          </div>

          {/* Acro Rates */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-blue-500/20 flex items-center justify-center">
                <span className="text-sm">🔄</span>
              </div>
              <span className="text-xs text-zinc-400">Acro Rates</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Roll/Pitch</span>
                <span className="text-white font-mono">{tuningValues.acroRpRate}°/s</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Yaw</span>
                <span className="text-white font-mono">{tuningValues.acroYRate}°/s</span>
              </div>
            </div>
          </div>

          {/* Speeds */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-green-500/20 flex items-center justify-center">
                <span className="text-sm">🚀</span>
              </div>
              <span className="text-xs text-zinc-400">Navigation Speed</span>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Waypoint</span>
                <span className="text-white font-mono">{(tuningValues.wpnavSpeed / 100).toFixed(0)} m/s</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-zinc-500">Loiter</span>
                <span className="text-white font-mono">{(tuningValues.loitSpeed / 100).toFixed(0)} m/s</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Fine Tuning */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-zinc-300">Fine Tuning</h3>
          <span className="text-xs text-zinc-500">Adjust individual values</span>
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* Max Angle */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-xs text-zinc-400">Max Tilt Angle</label>
              <span className="text-xs text-zinc-500 font-mono">{angleMaxDeg}°</span>
            </div>
            <input
              type="range"
              value={tuningValues.angleMax}
              onChange={(e) => setParameter('ANGLE_MAX', Number(e.target.value))}
              min={1500}
              max={8000}
              step={100}
              className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Gentle (15°)</span>
              <span>Aggressive (80°)</span>
            </div>
          </div>

          {/* Loiter Speed */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-xs text-zinc-400">Loiter Speed</label>
              <span className="text-xs text-zinc-500 font-mono">{(tuningValues.loitSpeed / 100).toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              value={tuningValues.loitSpeed}
              onChange={(e) => setParameter('LOIT_SPEED', Number(e.target.value))}
              min={250}
              max={2000}
              step={50}
              className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Slow (2.5 m/s)</span>
              <span>Fast (20 m/s)</span>
            </div>
          </div>

          {/* Waypoint Speed */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-xs text-zinc-400">Waypoint Speed</label>
              <span className="text-xs text-zinc-500 font-mono">{(tuningValues.wpnavSpeed / 100).toFixed(1)} m/s</span>
            </div>
            <input
              type="range"
              value={tuningValues.wpnavSpeed}
              onChange={(e) => setParameter('WPNAV_SPEED', Number(e.target.value))}
              min={100}
              max={2000}
              step={50}
              className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Slow (1 m/s)</span>
              <span>Fast (20 m/s)</span>
            </div>
          </div>

          {/* Acro Roll/Pitch Rate */}
          <div className="space-y-2">
            <div className="flex justify-between">
              <label className="text-xs text-zinc-400">Acro Roll/Pitch Rate</label>
              <span className="text-xs text-zinc-500 font-mono">{tuningValues.acroRpRate}°/s</span>
            </div>
            <input
              type="range"
              value={tuningValues.acroRpRate}
              onChange={(e) => setParameter('ACRO_RP_RATE', Number(e.target.value))}
              min={45}
              max={720}
              step={15}
              className="w-full h-2 bg-zinc-700 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:bg-blue-500 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:shadow-lg"
            />
            <div className="flex justify-between text-[10px] text-zinc-600">
              <span>Slow (45°/s)</span>
              <span>Fast (720°/s)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AutoTune Info */}
      <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-start gap-4">
        <span className="text-2xl">🔧</span>
        <div>
          <p className="text-amber-400 font-medium">AutoTune Available</p>
          <p className="text-sm text-zinc-400 mt-1">
            For best results, use ArduPilot's AutoTune flight mode. It will automatically
            tune your PID values by flying test maneuvers. Set one of your flight mode
            slots to AutoTune, then fly in a calm wind.
          </p>
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
    </div>
  );
};

export default TuningTab;
