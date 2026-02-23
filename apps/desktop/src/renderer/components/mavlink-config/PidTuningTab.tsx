/**
 * PID Tuning Tab for MAVLink/ArduPilot
 *
 * Beginner-friendly PID tuning with:
 * - 3-column color-coded layout (Roll/Pitch/Yaw)
 * - DraggableSlider for all values
 * - Quick presets (Beginner, Freestyle, Racing, Cinematic)
 * - Custom profile save/load
 * - Explanatory info cards
 */

import React, { useMemo, useCallback } from 'react';
import { MoveHorizontal, MoveVertical, RefreshCw, Lightbulb, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { PresetSelector } from '../ui/PresetSelector';
import { ProfileManager } from '../ui/ProfileManager';
import { InfoCard } from '../ui/InfoCard';
import {
  PID_PRESETS,
  DEFAULT_ARDUPILOT_PIDS,
  type PidPreset,
} from './presets/mavlink-presets';

// Storage key for custom profiles
const PID_PROFILES_KEY = 'ardudeck_mavlink_pid_profiles';

// PID parameter names for ArduPilot
const PID_PARAMS = {
  roll: { p: 'ATC_RAT_RLL_P', i: 'ATC_RAT_RLL_I', d: 'ATC_RAT_RLL_D', ff: 'ATC_RAT_RLL_FF' },
  pitch: { p: 'ATC_RAT_PIT_P', i: 'ATC_RAT_PIT_I', d: 'ATC_RAT_PIT_D', ff: 'ATC_RAT_PIT_FF' },
  yaw: { p: 'ATC_RAT_YAW_P', i: 'ATC_RAT_YAW_I', d: 'ATC_RAT_YAW_D', ff: 'ATC_RAT_YAW_FF' },
};

// Type for PID profile data
interface PidProfileData {
  ATC_RAT_RLL_P: number;
  ATC_RAT_RLL_I: number;
  ATC_RAT_RLL_D: number;
  ATC_RAT_RLL_FF: number;
  ATC_RAT_PIT_P: number;
  ATC_RAT_PIT_I: number;
  ATC_RAT_PIT_D: number;
  ATC_RAT_PIT_FF: number;
  ATC_RAT_YAW_P: number;
  ATC_RAT_YAW_I: number;
  ATC_RAT_YAW_D: number;
  ATC_RAT_YAW_FF: number;
}

const PidTuningTab: React.FC = () => {
  const { parameters, setParameter, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Check if expected PID params exist on this board
  // ATC_RAT_* params are ArduCopter 3.5+ - older boards use RATE_RLL_P etc.
  const hasPidParams = useMemo(() => {
    if (!hasParameters) return true; // Don't show warning until params are loaded
    return parameters.has('ATC_RAT_RLL_P');
  }, [hasParameters, parameters]);

  // Get current PID values from parameters
  const pidValues = useMemo(() => ({
    // Roll
    ATC_RAT_RLL_P: parameters.get('ATC_RAT_RLL_P')?.value ?? 0.135,
    ATC_RAT_RLL_I: parameters.get('ATC_RAT_RLL_I')?.value ?? 0.135,
    ATC_RAT_RLL_D: parameters.get('ATC_RAT_RLL_D')?.value ?? 0.0036,
    ATC_RAT_RLL_FF: parameters.get('ATC_RAT_RLL_FF')?.value ?? 0,
    // Pitch
    ATC_RAT_PIT_P: parameters.get('ATC_RAT_PIT_P')?.value ?? 0.135,
    ATC_RAT_PIT_I: parameters.get('ATC_RAT_PIT_I')?.value ?? 0.135,
    ATC_RAT_PIT_D: parameters.get('ATC_RAT_PIT_D')?.value ?? 0.0036,
    ATC_RAT_PIT_FF: parameters.get('ATC_RAT_PIT_FF')?.value ?? 0,
    // Yaw
    ATC_RAT_YAW_P: parameters.get('ATC_RAT_YAW_P')?.value ?? 0.18,
    ATC_RAT_YAW_I: parameters.get('ATC_RAT_YAW_I')?.value ?? 0.018,
    ATC_RAT_YAW_D: parameters.get('ATC_RAT_YAW_D')?.value ?? 0,
    ATC_RAT_YAW_FF: parameters.get('ATC_RAT_YAW_FF')?.value ?? 0,
  }), [parameters]);

  // Apply a preset
  const applyPreset = useCallback(async (presetKey: string) => {
    const preset = PID_PRESETS[presetKey];
    if (preset) {
      for (const [param, value] of Object.entries(preset.params)) {
        await setParameter(param, value);
      }
    }
  }, [setParameter]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    Object.entries(DEFAULT_ARDUPILOT_PIDS).forEach(([param, value]) => {
      setParameter(param, value);
    });
  }, [setParameter]);

  // Load profile
  const loadProfile = useCallback((data: PidProfileData) => {
    Object.entries(data).forEach(([param, value]) => {
      setParameter(param, value);
    });
  }, [setParameter]);

  // Handle individual PID change
  const handlePidChange = useCallback((param: string, value: number) => {
    setParameter(param, value);
  }, [setParameter]);

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
              <p className="text-xs text-gray-500">Fetch parameters from the FC to use presets and adjust values</p>
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

      {/* Warning: PID params not found on this board */}
      {hasParameters && !hasPidParams && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-medium">Incompatible PID Parameters</p>
              <p className="text-sm text-gray-400 mt-1">
                This board does not have <span className="font-mono text-gray-300">ATC_RAT_*</span> parameters.
                Your firmware may use different PID parameter names (e.g. <span className="font-mono text-gray-300">RATE_RLL_P</span> for older ArduCopter,
                or <span className="font-mono text-gray-300">RLL2SRV_P</span> for ArduPlane).
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Use the <span className="font-medium text-gray-300">Parameters</span> list view to find and edit your board's PID parameters directly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <InfoCard title="What are PIDs?" variant="info">
        PIDs control how your aircraft responds to commands. P = how quickly it reacts,
        I = how well it holds position, D = how smoothly it stops. Start with a preset!
      </InfoCard>

      {/* Quick Presets, Custom Profiles, and PID Sliders - disabled when params don't exist */}
      <div className={!hasPidParams ? 'opacity-40 pointer-events-none' : ''}>
      <div className="space-y-6">
      <PresetSelector
        presets={PID_PRESETS}
        onApply={applyPreset}
        label="Quick Presets"
        hint="Click to apply a tuning style"
      />

      <ProfileManager<PidProfileData>
        storageKey={PID_PROFILES_KEY}
        currentData={pidValues}
        onLoad={loadProfile}
        onReset={resetToDefaults}
        label="My Profiles"
      />

      {/* PID Sliders - 3 column layout */}
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 rounded-xl border border-blue-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <MoveHorizontal className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Roll</h3>
              <p className="text-xs text-gray-500">Left/right tilt</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider
              label="P - Response"
              value={Math.round(pidValues.ATC_RAT_RLL_P * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_RLL_P', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#3B82F6"
              hint="Higher = snappier"
            />
            <DraggableSlider
              label="I - Stability"
              value={Math.round(pidValues.ATC_RAT_RLL_I * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_RLL_I', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#10B981"
              hint="Higher = more stable"
            />
            <DraggableSlider
              label="D - Smoothness"
              value={Math.round(pidValues.ATC_RAT_RLL_D * 10000)}
              onChange={(v) => handlePidChange('ATC_RAT_RLL_D', v / 10000)}
              min={0}
              max={100}
              step={1}
              color="#8B5CF6"
              hint="Higher = smoother"
            />
            <DraggableSlider
              label="FF - Feedforward"
              value={Math.round(pidValues.ATC_RAT_RLL_FF * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_RLL_FF', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#F59E0B"
              hint="Anticipates commands"
            />
          </div>
        </div>

        {/* Pitch */}
        <div className="bg-gradient-to-br from-emerald-500/10 to-emerald-600/5 rounded-xl border border-emerald-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
              <MoveVertical className="w-5 h-5 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Pitch</h3>
              <p className="text-xs text-gray-500">Forward/back tilt</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider
              label="P - Response"
              value={Math.round(pidValues.ATC_RAT_PIT_P * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_PIT_P', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#3B82F6"
              hint="Higher = snappier"
            />
            <DraggableSlider
              label="I - Stability"
              value={Math.round(pidValues.ATC_RAT_PIT_I * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_PIT_I', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#10B981"
              hint="Higher = more stable"
            />
            <DraggableSlider
              label="D - Smoothness"
              value={Math.round(pidValues.ATC_RAT_PIT_D * 10000)}
              onChange={(v) => handlePidChange('ATC_RAT_PIT_D', v / 10000)}
              min={0}
              max={100}
              step={1}
              color="#8B5CF6"
              hint="Higher = smoother"
            />
            <DraggableSlider
              label="FF - Feedforward"
              value={Math.round(pidValues.ATC_RAT_PIT_FF * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_PIT_FF', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#F59E0B"
              hint="Anticipates commands"
            />
          </div>
        </div>

        {/* Yaw */}
        <div className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 rounded-xl border border-orange-500/20 p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
              <RefreshCw className="w-5 h-5 text-orange-400" />
            </div>
            <div>
              <h3 className="text-lg font-medium text-white">Yaw</h3>
              <p className="text-xs text-gray-500">Rotation</p>
            </div>
          </div>
          <div className="space-y-5">
            <DraggableSlider
              label="P - Response"
              value={Math.round(pidValues.ATC_RAT_YAW_P * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_YAW_P', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#3B82F6"
              hint="Higher = snappier"
            />
            <DraggableSlider
              label="I - Stability"
              value={Math.round(pidValues.ATC_RAT_YAW_I * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_YAW_I', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#10B981"
              hint="Higher = more stable"
            />
            <DraggableSlider
              label="D - Smoothness"
              value={Math.round(pidValues.ATC_RAT_YAW_D * 10000)}
              onChange={(v) => handlePidChange('ATC_RAT_YAW_D', v / 10000)}
              min={0}
              max={100}
              step={1}
              color="#8B5CF6"
              hint="Higher = smoother"
            />
            <DraggableSlider
              label="FF - Feedforward"
              value={Math.round(pidValues.ATC_RAT_YAW_FF * 1000)}
              onChange={(v) => handlePidChange('ATC_RAT_YAW_FF', v / 1000)}
              min={0}
              max={500}
              step={1}
              color="#F59E0B"
              hint="Anticipates commands"
            />
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* Explanation card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h4 className="font-medium text-gray-300 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400" /> What do these numbers mean?
        </h4>
        <div className="grid grid-cols-4 gap-6 text-sm">
          <div>
            <span className="text-blue-400 font-medium">P (Proportional)</span>
            <p className="text-gray-500 mt-1">
              How quickly your aircraft reacts to errors. Too high = oscillation/vibration. Too low = mushy feeling.
            </p>
          </div>
          <div>
            <span className="text-emerald-400 font-medium">I (Integral)</span>
            <p className="text-gray-500 mt-1">
              Keeps your aircraft on target over time. Helps fight wind and drift. Too high = slow wobbles.
            </p>
          </div>
          <div>
            <span className="text-purple-400 font-medium">D (Derivative)</span>
            <p className="text-gray-500 mt-1">
              Dampens overshooting and oscillation. Too high = hot motors and noise. Too low = bouncy stops.
            </p>
          </div>
          <div>
            <span className="text-amber-400 font-medium">FF (Feedforward)</span>
            <p className="text-gray-500 mt-1">
              Anticipates stick movements for faster response. Useful for agile flying but can cause overshoot.
            </p>
          </div>
        </div>
      </div>

      {/* AutoTune tip */}
      <InfoCard title="Use AutoTune for Best Results" variant="tip">
        For optimal performance, use ArduPilot's AutoTune flight mode. It will automatically
        tune your PID values by flying test maneuvers. Set one of your flight mode slots to
        AutoTune, then fly in calm conditions.
      </InfoCard>
    </div>
  );
};

export default PidTuningTab;
