/**
 * Rates Tab for MAVLink/ArduPilot
 *
 * Controls how fast the aircraft rotates when sticks are moved.
 * Features:
 * - Per-axis rate curve visualization
 * - Sliders for rate and expo
 * - Quick presets
 * - Custom profile save/load
 */

import React, { useMemo, useCallback } from 'react';
import { MoveHorizontal, MoveVertical, RefreshCw, Link, Lightbulb, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { PresetSelector } from '../ui/PresetSelector';
import { ProfileManager } from '../ui/ProfileManager';
import { InfoCard } from '../ui/InfoCard';
import { RateCurve } from '../ui/RateCurve';
import {
  RATE_PRESETS,
  DEFAULT_ARDUPILOT_RATES,
} from './presets/mavlink-presets';

// Storage key for custom profiles
const RATE_PROFILES_KEY = 'ardudeck_mavlink_rate_profiles';

// Type for rate profile data
interface RateProfileData {
  ACRO_RP_RATE: number;
  ACRO_Y_RATE: number;
  ACRO_RP_EXPO: number;
  ACRO_Y_EXPO: number;
}

const RatesTab: React.FC = () => {
  const { parameters, setParameter, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Check if expected rate params exist on this board
  const hasRateParams = useMemo(() => {
    if (!hasParameters) return true; // Don't show warning until params are loaded
    return parameters.has('ACRO_RP_RATE');
  }, [hasParameters, parameters]);

  // Get current rate values from parameters
  const rateValues = useMemo(() => ({
    ACRO_RP_RATE: parameters.get('ACRO_RP_RATE')?.value ?? 180,
    ACRO_Y_RATE: parameters.get('ACRO_Y_RATE')?.value ?? 90,
    ACRO_RP_EXPO: parameters.get('ACRO_RP_EXPO')?.value ?? 0,
    ACRO_Y_EXPO: parameters.get('ACRO_Y_EXPO')?.value ?? 0,
  }), [parameters]);

  // Apply a preset
  const applyPreset = useCallback(async (presetKey: string) => {
    const preset = RATE_PRESETS[presetKey];
    if (preset) {
      for (const [param, value] of Object.entries(preset.params)) {
        await setParameter(param, value);
      }
    }
  }, [setParameter]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    Object.entries(DEFAULT_ARDUPILOT_RATES).forEach(([param, value]) => {
      setParameter(param, value);
    });
  }, [setParameter]);

  // Load profile
  const loadProfile = useCallback((data: RateProfileData) => {
    Object.entries(data).forEach(([param, value]) => {
      setParameter(param, value);
    });
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

      {/* Warning: Rate params not found on this board */}
      {hasParameters && !hasRateParams && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-medium">Incompatible Rate Parameters</p>
              <p className="text-sm text-gray-400 mt-1">
                This board does not have <span className="font-mono text-gray-300">ACRO_RP_RATE</span> / <span className="font-mono text-gray-300">ACRO_Y_RATE</span> parameters.
                Your firmware may use different rate parameter names.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Use the <span className="font-medium text-gray-300">Parameters</span> list view to find and edit your board's rate parameters directly.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Info card */}
      <InfoCard title="What are rates?" variant="info">
        Rates control how fast your aircraft spins when you move the sticks.
        Higher rates = faster rotation. Expo adds a curve so small stick movements are slower.
      </InfoCard>

      {/* Controls disabled when params don't exist */}
      <div className={!hasRateParams ? 'opacity-40 pointer-events-none' : ''}>
      <div className="space-y-6">
      <PresetSelector
        presets={RATE_PRESETS}
        onApply={applyPreset}
        label="Quick Presets"
        hint="Click to apply a rate style"
      />

      <ProfileManager<RateProfileData>
        storageKey={RATE_PROFILES_KEY}
        currentData={rateValues}
        onLoad={loadProfile}
        onReset={resetToDefaults}
        label="My Profiles"
      />

      {/* Rate controls - 3 column layout */}
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <MoveHorizontal className="w-5 h-5 text-blue-400" /> Roll
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label="Max Rate"
              value={rateValues.ACRO_RP_RATE}
              onChange={(v) => setParameter('ACRO_RP_RATE', v)}
              min={45}
              max={720}
              step={5}
              color="#3B82F6"
              hint="Degrees per second at full stick"
            />
            <DraggableSlider
              label="Expo"
              value={Math.round(rateValues.ACRO_RP_EXPO * 100)}
              onChange={(v) => setParameter('ACRO_RP_EXPO', v / 100)}
              min={0}
              max={100}
              step={5}
              color="#3B82F6"
              hint="Curve softness near center"
            />
          </div>
          <div className="mt-4">
            <RateCurve
              rcRate={rateValues.ACRO_RP_RATE}
              superRate={0}
              expo={rateValues.ACRO_RP_EXPO * 100}
              color="#3B82F6"
              ratesType="ardupilot"
            />
          </div>
        </div>

        {/* Pitch (shares rates with Roll in ArduPilot) */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <MoveVertical className="w-5 h-5 text-emerald-400" /> Pitch
            <span className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
              <Link className="w-3 h-3" /> Linked to Roll
            </span>
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label="Max Rate"
              value={rateValues.ACRO_RP_RATE}
              onChange={() => {}}
              min={45}
              max={720}
              step={5}
              color="#10B981"
              hint="Controlled by Roll settings"
              disabled
            />
            <DraggableSlider
              label="Expo"
              value={Math.round(rateValues.ACRO_RP_EXPO * 100)}
              onChange={() => {}}
              min={0}
              max={100}
              step={5}
              color="#10B981"
              hint="Controlled by Roll settings"
              disabled
            />
          </div>
          <div className="mt-4">
            <RateCurve
              rcRate={rateValues.ACRO_RP_RATE}
              superRate={0}
              expo={rateValues.ACRO_RP_EXPO * 100}
              color="#10B981"
              ratesType="ardupilot"
            />
          </div>
        </div>

        {/* Yaw */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-400" /> Yaw
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label="Max Rate"
              value={rateValues.ACRO_Y_RATE}
              onChange={(v) => setParameter('ACRO_Y_RATE', v)}
              min={30}
              max={360}
              step={5}
              color="#F97316"
              hint="Degrees per second at full stick"
            />
            <DraggableSlider
              label="Expo"
              value={Math.round(rateValues.ACRO_Y_EXPO * 100)}
              onChange={(v) => setParameter('ACRO_Y_EXPO', v / 100)}
              min={0}
              max={100}
              step={5}
              color="#F97316"
              hint="Curve softness near center"
            />
          </div>
          <div className="mt-4">
            <RateCurve
              rcRate={rateValues.ACRO_Y_RATE}
              superRate={0}
              expo={rateValues.ACRO_Y_EXPO * 100}
              color="#F97316"
              ratesType="ardupilot"
            />
          </div>
        </div>
      </div>

      {/* Current settings summary */}
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Current Settings Summary</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <div className="text-2xl font-mono text-blue-400">{rateValues.ACRO_RP_RATE}</div>
            <div className="text-xs text-zinc-500">Roll/Pitch Rate (°/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-orange-400">{rateValues.ACRO_Y_RATE}</div>
            <div className="text-xs text-zinc-500">Yaw Rate (°/s)</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-emerald-400">
              {Math.round(rateValues.ACRO_RP_EXPO * 100)}%
            </div>
            <div className="text-xs text-zinc-500">Roll/Pitch Expo</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-amber-400">
              {Math.round(rateValues.ACRO_Y_EXPO * 100)}%
            </div>
            <div className="text-xs text-zinc-500">Yaw Expo</div>
          </div>
        </div>
      </div>
      </div>
      </div>

      {/* Tip */}
      <InfoCard title="Finding the right rates" variant="tip">
        Start with a Beginner preset and gradually increase rates as you get comfortable.
        Most pilots use 180-360°/s for roll/pitch and 90-180°/s for yaw. Add expo (20-40%)
        if you want smoother control near center while keeping fast response at full stick.
      </InfoCard>
    </div>
  );
};

export default RatesTab;
