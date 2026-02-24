/**
 * Rates Tab for MAVLink/ArduPilot
 *
 * Auto-detects rate parameter scheme:
 * - Modern ArduCopter 3.5+: ACRO_RP_RATE (deg/s) + ACRO_RP_EXPO
 * - Legacy ArduCopter <3.5: ACRO_RP_P (multiplier), no expo
 *
 * Features:
 * - Per-axis rate curve visualization
 * - Sliders for rate and expo
 * - Quick presets mapped to detected scheme
 * - Custom profile save/load
 */

import React, { useMemo, useCallback } from 'react';
import { MoveHorizontal, MoveVertical, RefreshCw, Link, Lightbulb, AlertTriangle, Info } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { PresetSelector } from '../ui/PresetSelector';
import { ProfileManager } from '../ui/ProfileManager';
import { InfoCard } from '../ui/InfoCard';
import { RateCurve } from '../ui/RateCurve';
import { RATE_PRESETS } from './presets/mavlink-presets';
import { detectRateScheme, buildRatePresetParams, type RateScheme } from './mavlink-pid-schemes';

// Storage key for custom profiles
const RATE_PROFILES_KEY = 'ardudeck_mavlink_rate_profiles';

const RatesTab: React.FC = () => {
  const { parameters, setParameter, fetchParameters, isLoading } = useParameterStore();

  // Check if parameters are loaded
  const hasParameters = parameters.size > 0;

  // Auto-detect rate scheme
  const scheme = useMemo((): RateScheme | null => {
    if (!hasParameters) return null;
    return detectRateScheme(parameters);
  }, [hasParameters, parameters]);

  const isUnknown = scheme?.id === 'unknown';

  // Get current rate values from parameters using detected scheme
  const rateValues = useMemo(() => {
    if (!scheme) return null;
    const get = (name: string, fallback: number) => parameters.get(name)?.value ?? fallback;
    return {
      rpRate: get(scheme.rollPitch.rate, scheme.defaults.rpRate),
      yawRate: get(scheme.yaw.rate, scheme.defaults.yawRate),
      rpExpo: scheme.rollPitch.expo ? get(scheme.rollPitch.expo, scheme.defaults.rpExpo) : 0,
      yawExpo: scheme.yaw.expo ? get(scheme.yaw.expo, scheme.defaults.yawExpo) : 0,
    };
  }, [scheme, parameters]);

  // Build profile data as flat Record
  const profileData = useMemo(() => {
    if (!scheme || !rateValues) return {};
    return buildRatePresetParams(scheme, rateValues);
  }, [scheme, rateValues]);

  // Apply a preset
  const applyPreset = useCallback(async (presetKey: string) => {
    if (!scheme) return;
    const preset = RATE_PRESETS[presetKey];
    if (preset) {
      const params = buildRatePresetParams(scheme, preset.values);
      for (const [param, value] of Object.entries(params)) {
        await setParameter(param, value);
      }
    }
  }, [scheme, setParameter]);

  // Reset to defaults
  const resetToDefaults = useCallback(() => {
    if (!scheme) return;
    const params = buildRatePresetParams(scheme, scheme.defaults);
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

      {/* Warning: No recognized rate scheme */}
      {hasParameters && isUnknown && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-medium">Unrecognized Rate Parameters</p>
              <p className="text-sm text-gray-400 mt-1">
                Could not detect <span className="font-mono text-gray-300">ACRO_RP_RATE</span> or
                <span className="font-mono text-gray-300"> ACRO_RP_P</span> parameters on this board.
              </p>
              <p className="text-sm text-gray-500 mt-1">
                Use the <span className="font-medium text-gray-300">All Parameters</span> tab to find and edit rate parameters directly.
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
            Detected <span className="font-medium">{scheme.label}</span> rate parameters
            ({scheme.rateUnit})
            {!scheme.hasExpo && <span className="text-blue-400/60"> (no expo on this firmware)</span>}
          </p>
        </div>
      )}

      {/* Info card */}
      <InfoCard title="What are rates?" variant="info">
        Rates control how fast your aircraft spins when you move the sticks.
        Higher rates = faster rotation.{scheme?.hasExpo ? ' Expo adds a curve so small stick movements are slower.' : ''}
      </InfoCard>

      {/* Controls disabled when scheme unknown */}
      <div className={isUnknown || !scheme ? 'opacity-40 pointer-events-none' : ''}>
      <div className="space-y-6">
      <PresetSelector
        presets={RATE_PRESETS}
        onApply={applyPreset}
        label="Quick Presets"
        hint="Click to apply a rate style"
      />

      <ProfileManager<Record<string, number>>
        storageKey={RATE_PROFILES_KEY}
        currentData={profileData}
        onLoad={loadProfile}
        onReset={resetToDefaults}
        label="My Profiles"
      />

      {/* Rate controls - 3 column layout */}
      {scheme && rateValues && (
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <MoveHorizontal className="w-5 h-5 text-blue-400" /> Roll
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={`Max Rate (${scheme.rateUnit})`}
              value={rateValues.rpRate}
              onChange={(v) => setParameter(scheme.rollPitch.rate, v)}
              min={scheme.rpRateMin}
              max={scheme.rpRateMax}
              step={scheme.rpRateStep}
              color="#3B82F6"
              hint={scheme.hasExpo ? 'At full stick deflection' : 'Rate multiplier'}
            />
            {scheme.hasExpo && scheme.rollPitch.expo && (
              <DraggableSlider
                label="Expo"
                value={Math.round(rateValues.rpExpo * scheme.expoScale)}
                onChange={(v) => setParameter(scheme.rollPitch.expo!, v / scheme.expoScale)}
                min={0}
                max={100}
                step={5}
                color="#3B82F6"
                hint="Curve softness near center"
              />
            )}
          </div>
          {scheme.hasExpo && (
            <div className="mt-4">
              <RateCurve
                rcRate={rateValues.rpRate}
                superRate={0}
                expo={rateValues.rpExpo * scheme.expoScale}
                color="#3B82F6"
                ratesType="ardupilot"
              />
            </div>
          )}
        </div>

        {/* Pitch (shares rates with Roll in ArduPilot) */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <MoveVertical className="w-5 h-5 text-emerald-400" /> Pitch
            {scheme.rpLinked && (
              <span className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                <Link className="w-3 h-3" /> Linked to Roll
              </span>
            )}
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={`Max Rate (${scheme.rateUnit})`}
              value={rateValues.rpRate}
              onChange={() => {}}
              min={scheme.rpRateMin}
              max={scheme.rpRateMax}
              step={scheme.rpRateStep}
              color="#10B981"
              hint={scheme.rpLinked ? 'Controlled by Roll settings' : ''}
              disabled={scheme.rpLinked}
            />
            {scheme.hasExpo && scheme.rollPitch.expo && (
              <DraggableSlider
                label="Expo"
                value={Math.round(rateValues.rpExpo * scheme.expoScale)}
                onChange={() => {}}
                min={0}
                max={100}
                step={5}
                color="#10B981"
                hint={scheme.rpLinked ? 'Controlled by Roll settings' : ''}
                disabled={scheme.rpLinked}
              />
            )}
          </div>
          {scheme.hasExpo && (
            <div className="mt-4">
              <RateCurve
                rcRate={rateValues.rpRate}
                superRate={0}
                expo={rateValues.rpExpo * scheme.expoScale}
                color="#10B981"
                ratesType="ardupilot"
              />
            </div>
          )}
        </div>

        {/* Yaw */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5">
          <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-400" /> Yaw
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={`Max Rate (${scheme.rateUnit})`}
              value={rateValues.yawRate}
              onChange={(v) => setParameter(scheme.yaw.rate, v)}
              min={scheme.yawRateMin}
              max={scheme.yawRateMax}
              step={scheme.yawRateStep}
              color="#F97316"
              hint={scheme.hasExpo ? 'At full stick deflection' : 'Rate multiplier'}
            />
            {scheme.hasExpo && scheme.yaw.expo && (
              <DraggableSlider
                label="Expo"
                value={Math.round(rateValues.yawExpo * scheme.expoScale)}
                onChange={(v) => setParameter(scheme.yaw.expo!, v / scheme.expoScale)}
                min={0}
                max={100}
                step={5}
                color="#F97316"
                hint="Curve softness near center"
              />
            )}
          </div>
          {scheme.hasExpo && (
            <div className="mt-4">
              <RateCurve
                rcRate={rateValues.yawRate}
                superRate={0}
                expo={rateValues.yawExpo * scheme.expoScale}
                color="#F97316"
                ratesType="ardupilot"
              />
            </div>
          )}
        </div>
      </div>
      )}

      {/* Current settings summary */}
      {scheme && rateValues && (
      <div className="bg-zinc-900/50 rounded-xl border border-zinc-800/50 p-4">
        <h3 className="text-sm font-medium text-zinc-300 mb-3">Current Settings Summary</h3>
        <div className={`grid ${scheme.hasExpo ? 'grid-cols-4' : 'grid-cols-2'} gap-4 text-center`}>
          <div>
            <div className="text-2xl font-mono text-blue-400">{rateValues.rpRate}</div>
            <div className="text-xs text-zinc-500">Roll/Pitch Rate ({scheme.rateUnit})</div>
          </div>
          <div>
            <div className="text-2xl font-mono text-orange-400">{rateValues.yawRate}</div>
            <div className="text-xs text-zinc-500">Yaw Rate ({scheme.rateUnit})</div>
          </div>
          {scheme.hasExpo && (
            <>
              <div>
                <div className="text-2xl font-mono text-emerald-400">
                  {Math.round(rateValues.rpExpo * scheme.expoScale)}%
                </div>
                <div className="text-xs text-zinc-500">Roll/Pitch Expo</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-amber-400">
                  {Math.round(rateValues.yawExpo * scheme.expoScale)}%
                </div>
                <div className="text-xs text-zinc-500">Yaw Expo</div>
              </div>
            </>
          )}
        </div>
      </div>
      )}
      </div>
      </div>

      {/* Tip */}
      <InfoCard title="Finding the right rates" variant="tip">
        Start with a Beginner preset and gradually increase rates as you get comfortable.
        {scheme?.hasExpo
          ? ' Most pilots use 180-360 deg/s for roll/pitch and 90-180 deg/s for yaw. Add expo (20-40%) if you want smoother control near center while keeping fast response at full stick.'
          : ' Adjust the multiplier to control how aggressively the aircraft responds to stick inputs.'
        }
      </InfoCard>
    </div>
  );
};

export default RatesTab;
