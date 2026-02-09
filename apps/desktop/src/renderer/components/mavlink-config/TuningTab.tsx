/**
 * TuningTab
 *
 * Simplified tuning with presets for skill levels and mission types.
 * Hides PID complexity while giving users meaningful control.
 * Uses Lucide icons (no emojis) and DraggableSliders.
 */

import React, { useMemo, useCallback } from 'react';
import {
  Sliders,
  Shield,
  TrendingUp,
  Target,
  Map,
  Eye,
  Zap,
  Film,
  Wrench,
  Save,
  Lightbulb,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import {
  SKILL_PRESETS,
  MISSION_PRESETS,
  type SkillPreset,
  type MissionPreset,
} from './presets/mavlink-presets';

// Convert skill presets to PresetSelector format
const SKILL_PRESET_OPTIONS: Record<string, Preset> = {
  beginner: {
    name: 'Beginner',
    description: SKILL_PRESETS.beginner!.description,
    icon: Shield,
    iconColor: 'text-green-400',
    color: 'from-green-500/20 to-emerald-500/10 border-green-500/30',
  },
  intermediate: {
    name: 'Intermediate',
    description: SKILL_PRESETS.intermediate!.description,
    icon: TrendingUp,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  expert: {
    name: 'Expert',
    description: SKILL_PRESETS.expert!.description,
    icon: Target,
    iconColor: 'text-red-400',
    color: 'from-red-500/20 to-orange-500/10 border-red-500/30',
  },
};

// Convert mission presets to PresetSelector format
const MISSION_PRESET_OPTIONS: Record<string, Preset> = {
  mapping: {
    name: 'Mapping',
    description: MISSION_PRESETS.mapping!.description,
    icon: Map,
    iconColor: 'text-amber-400',
    color: 'from-amber-500/20 to-orange-500/10 border-amber-500/30',
  },
  surveillance: {
    name: 'Surveillance',
    description: MISSION_PRESETS.surveillance!.description,
    icon: Eye,
    iconColor: 'text-purple-400',
    color: 'from-purple-500/20 to-pink-500/10 border-purple-500/30',
  },
  sport: {
    name: 'Sport',
    description: MISSION_PRESETS.sport!.description,
    icon: Zap,
    iconColor: 'text-blue-400',
    color: 'from-blue-500/20 to-cyan-500/10 border-blue-500/30',
  },
  cinema: {
    name: 'Cinematic',
    description: MISSION_PRESETS.cinema!.description,
    icon: Film,
    iconColor: 'text-rose-400',
    color: 'from-rose-500/20 to-red-500/10 border-rose-500/30',
  },
};

const TuningTab: React.FC = () => {
  const { parameters, setParameter, modifiedCount, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

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
  const applySkillPreset = useCallback(async (presetKey: string) => {
    const preset = SKILL_PRESETS[presetKey];
    if (preset) {
      for (const [param, value] of Object.entries(preset.params)) {
        await setParameter(param, value);
      }
    }
  }, [setParameter]);

  // Apply mission preset
  const applyMissionPreset = useCallback(async (presetKey: string) => {
    const preset = MISSION_PRESETS[presetKey];
    if (preset) {
      for (const [param, value] of Object.entries(preset.params)) {
        await setParameter(param, value);
      }
    }
  }, [setParameter]);

  const modified = modifiedCount();

  // Helper to convert centidegrees to degrees
  const angleMaxDeg = tuningValues.angleMax / 100;

  return (
    <div className="p-6 space-y-6">
      {/* Parameters not loaded warning */}
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
              <p className="text-xs text-gray-500">Fetch parameters from the FC to use presets</p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters()}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading...' : 'Fetch Parameters'}
          </button>
        </div>
      )}

      {/* Help Card */}
      <InfoCard title="Tuning Made Simple" variant="info">
        Presets adjust multiple parameters at once for the best flying experience.
        Choose your skill level first, then optionally pick a mission type.
      </InfoCard>

      {/* Skill Level Presets */}
      <PresetSelector
        presets={SKILL_PRESET_OPTIONS}
        onApply={applySkillPreset}
        label="Skill Level"
        hint="How responsive should the aircraft be?"
      />

      {/* Mission Type Presets */}
      <PresetSelector
        presets={MISSION_PRESET_OPTIONS}
        onApply={applyMissionPreset}
        label="Mission Type"
        hint="What are you flying for?"
      />

      {/* Current Settings Overview */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4 space-y-4">
        <h3 className="text-sm font-medium text-zinc-300">Current Settings</h3>

        <div className="grid grid-cols-3 gap-4">
          {/* Responsiveness */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-purple-500/20 flex items-center justify-center">
                <Zap className="w-4 h-4 text-purple-400" />
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
                <Sliders className="w-4 h-4 text-blue-400" />
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
                <Target className="w-4 h-4 text-green-400" />
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

        <div className="grid grid-cols-2 gap-6">
          {/* Max Angle */}
          <DraggableSlider
            label="Max Tilt Angle"
            value={tuningValues.angleMax}
            onChange={(v) => setParameter('ANGLE_MAX', v)}
            min={1500}
            max={8000}
            step={100}
            color="#8B5CF6"
            hint={`${(tuningValues.angleMax / 100).toFixed(0)}° - Higher = more aggressive`}
          />

          {/* Loiter Speed */}
          <DraggableSlider
            label="Loiter Speed"
            value={tuningValues.loitSpeed}
            onChange={(v) => setParameter('LOIT_SPEED', v)}
            min={250}
            max={2000}
            step={50}
            color="#22C55E"
            hint={`${(tuningValues.loitSpeed / 100).toFixed(1)} m/s`}
          />

          {/* Waypoint Speed */}
          <DraggableSlider
            label="Waypoint Speed"
            value={tuningValues.wpnavSpeed}
            onChange={(v) => setParameter('WPNAV_SPEED', v)}
            min={100}
            max={2000}
            step={50}
            color="#3B82F6"
            hint={`${(tuningValues.wpnavSpeed / 100).toFixed(1)} m/s`}
          />

          {/* Acro Roll/Pitch Rate */}
          <DraggableSlider
            label="Acro Roll/Pitch Rate"
            value={tuningValues.acroRpRate}
            onChange={(v) => setParameter('ACRO_RP_RATE', v)}
            min={45}
            max={720}
            step={15}
            color="#F59E0B"
            hint={`${tuningValues.acroRpRate}°/s`}
          />
        </div>
      </div>

      {/* AutoTune Info */}
      <InfoCard title="AutoTune Available" variant="tip" icon={Wrench}>
        For best results, use ArduPilot's AutoTune flight mode. It will automatically
        tune your PID values by flying test maneuvers. Set one of your flight mode
        slots to AutoTune, then fly in a calm wind.
      </InfoCard>

      {/* Save Reminder */}
      {modified > 0 && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <Save className="w-5 h-5 text-amber-400" />
          <p className="text-sm text-amber-400">
            You have unsaved changes. Click <span className="font-medium">"Write to Flash"</span> in the header to save.
          </p>
        </div>
      )}
    </div>
  );
};

export default TuningTab;
