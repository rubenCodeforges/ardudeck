/**
 * PID Tuning Tab for MAVLink/ArduPilot
 *
 * Auto-detects the board's PID parameter scheme:
 * - Modern ArduCopter 3.5+: ATC_RAT_RLL_P etc. (with FF)
 * - Legacy ArduCopter <3.5: RATE_RLL_P etc. (no FF)
 * - ArduPlane: RLL2SRV_P etc.
 * - QuadPlane VTOL: Q_A_RAT_RLL_P etc. (with FF)
 *
 * Features:
 * - 3-column color-coded layout (Roll/Pitch/Yaw)
 * - DraggableSlider for all values
 * - Quick presets mapped to detected scheme
 * - Custom profile save/load
 */

import React, { useMemo, useCallback } from 'react';
import { MoveHorizontal, MoveVertical, RefreshCw, Lightbulb, AlertTriangle, Info } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { PresetSelector } from '../ui/PresetSelector';
import { ProfileManager } from '../ui/ProfileManager';
import { InfoCard } from '../ui/InfoCard';
import { PID_PRESETS } from './presets/mavlink-presets';
import { detectPidScheme, buildPresetParams, type PidScheme, type AxisParams } from './mavlink-pid-schemes';

// Storage key for custom profiles
const PID_PROFILES_KEY = 'ardudeck_mavlink_pid_profiles';

const PidTuningTab: React.FC = () => {
  const { parameters, setParameter, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Auto-detect PID scheme from loaded parameters
  const scheme = useMemo(() => {
    if (!hasParameters) return null;
    return detectPidScheme(parameters);
  }, [hasParameters, parameters]);

  const isUnknown = scheme?.id === 'unknown';

  // Get current PID values from parameters using the detected scheme
  const pidValues = useMemo(() => {
    if (!scheme) return null;
    const get = (name: string, fallback: number) => parameters.get(name)?.value ?? fallback;
    return {
      roll: {
        p: get(scheme.roll.p, scheme.defaults.roll.p),
        i: get(scheme.roll.i, scheme.defaults.roll.i),
        d: get(scheme.roll.d, scheme.defaults.roll.d),
        ff: scheme.roll.ff ? get(scheme.roll.ff, scheme.defaults.roll.ff ?? 0) : 0,
      },
      pitch: {
        p: get(scheme.pitch.p, scheme.defaults.pitch.p),
        i: get(scheme.pitch.i, scheme.defaults.pitch.i),
        d: get(scheme.pitch.d, scheme.defaults.pitch.d),
        ff: scheme.pitch.ff ? get(scheme.pitch.ff, scheme.defaults.pitch.ff ?? 0) : 0,
      },
      yaw: {
        p: get(scheme.yaw.p, scheme.defaults.yaw.p),
        i: get(scheme.yaw.i, scheme.defaults.yaw.i),
        d: get(scheme.yaw.d, scheme.defaults.yaw.d),
        ff: scheme.yaw.ff ? get(scheme.yaw.ff, scheme.defaults.yaw.ff ?? 0) : 0,
      },
    };
  }, [scheme, parameters]);

  // Build profile data as a flat Record for save/load
  const profileData = useMemo(() => {
    if (!scheme || !pidValues) return {};
    return buildPresetParams(scheme, pidValues);
  }, [scheme, pidValues]);

  // Apply a preset
  const applyPreset = useCallback(async (presetKey: string) => {
    if (!scheme) return;
    const preset = PID_PRESETS[presetKey];
    if (preset) {
      const params = buildPresetParams(scheme, preset.values);
      for (const [param, value] of Object.entries(params)) {
        await setParameter(param, value);
      }
    }
  }, [scheme, setParameter]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    if (!scheme) return;
    const params = buildPresetParams(scheme, scheme.defaults);
    Object.entries(params).forEach(([param, value]) => {
      setParameter(param, value);
    });
  }, [scheme, setParameter]);

  // Load profile
  const loadProfile = useCallback((data: Record<string, number>) => {
    Object.entries(data).forEach(([param, value]) => {
      setParameter(param, value);
    });
  }, [setParameter]);

  // Handle individual PID change
  const handlePidChange = useCallback((param: string, value: number) => {
    setParameter(param, value);
  }, [setParameter]);

  // Render PID sliders for one axis
  const renderAxisSliders = (axis: AxisParams, axisScheme: PidScheme, values: { p: number; i: number; d: number; ff: number }) => (
    <div className="space-y-5">
      <DraggableSlider
        label="P - Response"
        value={Math.round(values.p * axisScheme.pScale)}
        onChange={(v) => handlePidChange(axis.p, v / axisScheme.pScale)}
        min={0}
        max={axisScheme.pMax}
        step={1}
        color="#3B82F6"
        hint="Higher = snappier"
      />
      <DraggableSlider
        label="I - Stability"
        value={Math.round(values.i * axisScheme.iScale)}
        onChange={(v) => handlePidChange(axis.i, v / axisScheme.iScale)}
        min={0}
        max={axisScheme.iMax}
        step={1}
        color="#10B981"
        hint="Higher = more stable"
      />
      <DraggableSlider
        label="D - Smoothness"
        value={Math.round(values.d * axisScheme.dScale)}
        onChange={(v) => handlePidChange(axis.d, v / axisScheme.dScale)}
        min={0}
        max={axisScheme.dMax}
        step={1}
        color="#8B5CF6"
        hint="Higher = smoother"
      />
      {axisScheme.hasFF && axis.ff && (
        <DraggableSlider
          label="FF - Feedforward"
          value={Math.round(values.ff * axisScheme.ffScale)}
          onChange={(v) => handlePidChange(axis.ff!, v / axisScheme.ffScale)}
          min={0}
          max={axisScheme.ffMax}
          step={1}
          color="#F59E0B"
          hint="Anticipates commands"
        />
      )}
    </div>
  );

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

      {/* Warning: No recognized PID scheme found (suppress while still loading) */}
      {hasParameters && !isLoading && isUnknown && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-medium">Unrecognized PID Parameters</p>
              <p className="text-sm text-gray-400 mt-1">
                Could not detect a known PID parameter scheme on this board.
                Expected <span className="font-mono text-gray-300">ATC_RAT_*</span>,
                <span className="font-mono text-gray-300"> RATE_RLL_*</span>,
                <span className="font-mono text-gray-300"> RLL2SRV_*</span>, or
                <span className="font-mono text-gray-300"> Q_A_RAT_*</span> parameters.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Use the <span className="font-medium text-gray-300">All Parameters</span> tab to find and edit your board's PID parameters directly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Detected scheme badge */}
      {hasParameters && scheme && !isUnknown && (
        <div className="bg-blue-500/10 rounded-xl border border-blue-500/20 p-3 flex items-center gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">
            Detected <span className="font-medium">{scheme.label}</span> PID parameters
            {!scheme.hasFF && <span className="text-blue-400/60"> (no feedforward on this firmware)</span>}
          </p>
        </div>
      )}

      {/* Info card */}
      <InfoCard title="What are PIDs?" variant="info">
        PIDs control how your aircraft responds to commands. P = how quickly it reacts,
        I = how well it holds position, D = how smoothly it stops. Start with a preset!
      </InfoCard>

      {/* Quick Presets, Custom Profiles, and PID Sliders - disabled when scheme unknown */}
      <div className={isUnknown || !scheme ? 'opacity-40 pointer-events-none' : ''}>
      <div className="space-y-6">
      <PresetSelector
        presets={PID_PRESETS}
        onApply={applyPreset}
        label="Quick Presets"
        hint="Click to apply a tuning style"
      />

      <ProfileManager<Record<string, number>>
        storageKey={PID_PROFILES_KEY}
        currentData={profileData}
        onLoad={loadProfile}
        onReset={resetToDefaults}
        label="My Profiles"
      />

      {/* PID Sliders - 3 column layout */}
      {scheme && pidValues && (
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
          {renderAxisSliders(scheme.roll, scheme, pidValues.roll)}
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
          {renderAxisSliders(scheme.pitch, scheme, pidValues.pitch)}
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
          {renderAxisSliders(scheme.yaw, scheme, pidValues.yaw)}
        </div>
      </div>
      )}
      </div>
      </div>

      {/* Explanation card */}
      <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
        <h4 className="font-medium text-gray-300 mb-3 flex items-center gap-2">
          <Lightbulb className="w-4 h-4 text-yellow-400" /> What do these numbers mean?
        </h4>
        <div className={`grid ${scheme?.hasFF !== false ? 'grid-cols-4' : 'grid-cols-3'} gap-6 text-sm`}>
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
          {scheme?.hasFF !== false && (
          <div>
            <span className="text-amber-400 font-medium">FF (Feedforward)</span>
            <p className="text-gray-500 mt-1">
              Anticipates stick movements for faster response. Useful for agile flying but can cause overshoot.
            </p>
          </div>
          )}
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
