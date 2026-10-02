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
import { useTranslation, Trans } from 'react-i18next';
import { MoveHorizontal, MoveVertical, RefreshCw, Link, Lightbulb, AlertTriangle, Info } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { RateResponsePlot } from './RateResponsePlot';
import { PresetSelector, type Preset } from '../ui/PresetSelector';
import { ProfileManager } from '../ui/ProfileManager';
import { InfoCard } from '../ui/InfoCard';
import { RateCurve } from '../ui/RateCurve';
import { RATE_PRESETS } from './presets/mavlink-presets';
import { detectRateScheme, buildRatePresetParams, type RateScheme } from './mavlink-pid-schemes';

// Storage key for custom profiles
const RATE_PROFILES_KEY = 'ardudeck_mavlink_rate_profiles';

const RatesTab: React.FC = () => {
  const { t } = useTranslation();
  const { parameters, setParameter, fetchParameters, isLoading, downloadState } = useParameterStore();

  // A completed download, not just whatever parameters happen to be present:
  // connect-time batch reads leave a handful behind and the tab would render
  // its fields against those.
  const hasParameters = downloadState === 'complete' && parameters.size > 0;

  // Auto-detect rate scheme
  const scheme = useMemo((): RateScheme | null => {
    if (!hasParameters) return null;
    return detectRateScheme(parameters);
  }, [hasParameters, parameters]);
  const rateUnit = scheme?.rateUnitKey ? t(scheme.rateUnitKey) : (scheme?.rateUnit ?? '');
  const ratePresets = useMemo(
    () => Object.fromEntries(
      Object.entries(RATE_PRESETS).map(([key, preset]) => [key, { ...preset, name: t(preset.nameKey), description: t(preset.descriptionKey) }]),
    ) as Record<string, Preset>,
    [t],
  );

  const isUnknown = scheme?.id === 'unknown';

  // Get current rate values from parameters using detected scheme
  const rateValues = useMemo(() => {
    if (!scheme) return null;
    const get = (name: string, fallback: number) => parameters.get(name)?.value ?? fallback;
    return {
      rpRate: get(scheme.rollPitch.rate, scheme.defaults.rpRate),
      pitchRate: scheme.pitch ? get(scheme.pitch.rate, scheme.defaults.pitchRate ?? scheme.defaults.rpRate) : undefined,
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
              <p className="text-amber-300 font-medium">{t('mavlink-config:ratesTab.paramsNotLoaded')}</p>
              <p className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.fetchHint')}</p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters({ force: true })}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? t('common:loading') : t('mavlink-config:ratesTab.fetchParameters')}
          </button>
        </div>
      )}

      {/* Warning: No recognized rate scheme (suppress while still loading) */}
      {hasParameters && !isLoading && isUnknown && (
        <div className="bg-red-500/10 rounded-xl border-red-500/30 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-red-400" />
            </div>
            <div>
              <p className="text-red-300 font-medium">{t('mavlink-config:ratesTab.unrecognized')}</p>
              <p className="text-sm text-content-secondary mt-1">
                <Trans i18nKey="mavlink-config:ratesTab.couldNotDetect" components={{ b: <span className="font-mono text-content" /> }} />
              </p>
              <p className="text-sm text-content-secondary mt-1">
                <Trans i18nKey="mavlink-config:ratesTab.useAllParams" components={{ b: <span className="font-medium text-content" /> }} />
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Detected scheme badge */}
      {hasParameters && scheme && !isUnknown && (
        <div className="bg-blue-500/10 rounded-xl border-blue-500/20 p-3 flex items-center gap-3">
          <Info className="w-4 h-4 text-blue-400 shrink-0" />
          <p className="text-sm text-blue-300">
            <Trans i18nKey="mavlink-config:ratesTab.detected" values={{ label: scheme.label, unit: rateUnit }} components={{ b: <span className="font-medium" /> }} />
            {!scheme.hasExpo && <span className="text-blue-400/60">{t('mavlink-config:ratesTab.noExpo')}</span>}
          </p>
        </div>
      )}

      {/* Info card */}
      <InfoCard title={t('mavlink-config:ratesTab.whatAreRates')} variant="info">
        {t('mavlink-config:ratesTab.whatAreRatesBody')}{scheme?.hasExpo ? ` ${t('mavlink-config:ratesTab.whatAreRatesExpo')}` : ''}
      </InfoCard>

      {/* Controls disabled when scheme unknown */}
      <div className={isUnknown || !scheme ? 'opacity-40 pointer-events-none' : ''}>
      <div className="space-y-6">
      <PresetSelector
        presets={ratePresets}
        onApply={applyPreset}
        label={t('common:quickPresets')}
        hint={t('mavlink-config:ratesTab.presetsHint')}
      />

      <ProfileManager<Record<string, number>>
        storageKey={RATE_PROFILES_KEY}
        currentData={profileData}
        onLoad={loadProfile}
        onReset={resetToDefaults}
        label={t('common:myProfiles')}
      />

      {/* The two numbers as one picture, before the sliders that set them. */}
      {scheme && rateValues && scheme.hasExpo && (
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-2">
            <div className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.rollAndPitch')}</div>
            <RateResponsePlot
              maxRate={rateValues.rpRate}
              expo={rateValues.rpExpo}
              unit={rateUnit}
              axis="roll"
              accent="#3B82F6"
            />
          </div>
          <div className="space-y-2">
            <div className="text-xs text-content-secondary">{t('common:yaw')}</div>
            <RateResponsePlot
              maxRate={rateValues.yawRate}
              expo={rateValues.yawExpo}
              unit={rateUnit}
              axis="yaw"
              accent="#F97316"
            />
          </div>
        </div>
      )}

      {/* Rate controls - 3 column layout */}
      {scheme && rateValues && (
      <div className="grid grid-cols-3 gap-5">
        {/* Roll */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <MoveHorizontal className="w-5 h-5 text-blue-400" /> {t('common:roll')}
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={t('mavlink-config:ratesTab.maxRate', { unit: rateUnit })}
              value={rateValues.rpRate}
              onChange={(v) => setParameter(scheme.rollPitch.rate, v)}
              min={scheme.rpRateMin}
              max={scheme.rpRateMax}
              step={scheme.rpRateStep}
              color="#3B82F6"
              hint={scheme.hasExpo ? t('mavlink-config:ratesTab.atFullStick') : t('mavlink-config:ratesTab.rateMultiplier')}
            />
            {scheme.hasExpo && scheme.rollPitch.expo && (
              <DraggableSlider
                label={t('common:expo')}
                value={Math.round(rateValues.rpExpo * scheme.expoScale)}
                onChange={(v) => setParameter(scheme.rollPitch.expo!, v / scheme.expoScale)}
                min={0}
                max={100}
                step={5}
                color="#3B82F6"
                hint={t('mavlink-config:ratesTab.curveSoftness')}
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

        {/* Pitch */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <MoveVertical className="w-5 h-5 text-emerald-400" /> {t('common:pitch')}
            {scheme.rpLinked && (
              <span className="ml-auto flex items-center gap-1.5 px-2 py-1 bg-emerald-500/10 text-emerald-400 text-xs rounded-full">
                <Link className="w-3 h-3" /> {t('mavlink-config:ratesTab.linkedToRoll')}
              </span>
            )}
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={t('mavlink-config:ratesTab.maxRate', { unit: rateUnit })}
              value={!scheme.rpLinked && rateValues.pitchRate !== undefined ? rateValues.pitchRate : rateValues.rpRate}
              onChange={!scheme.rpLinked && scheme.pitch ? (v) => setParameter(scheme.pitch!.rate, v) : () => {}}
              min={scheme.rpRateMin}
              max={scheme.rpRateMax}
              step={scheme.rpRateStep}
              color="#10B981"
              hint={scheme.rpLinked ? t('mavlink-config:ratesTab.controlledByRoll') : t('mavlink-config:ratesTab.atFullStick')}
              disabled={scheme.rpLinked}
            />
            {scheme.hasExpo && scheme.rollPitch.expo && (
              <DraggableSlider
                label={t('common:expo')}
                value={Math.round(rateValues.rpExpo * scheme.expoScale)}
                onChange={() => {}}
                min={0}
                max={100}
                step={5}
                color="#10B981"
                hint={scheme.rpLinked ? t('mavlink-config:ratesTab.controlledByRoll') : ''}
                disabled={scheme.rpLinked}
              />
            )}
          </div>
          {scheme.hasExpo && (
            <div className="mt-4">
              <RateCurve
                rcRate={!scheme.rpLinked && rateValues.pitchRate !== undefined ? rateValues.pitchRate : rateValues.rpRate}
                superRate={0}
                expo={rateValues.rpExpo * scheme.expoScale}
                color="#10B981"
                ratesType="ardupilot"
              />
            </div>
          )}
        </div>

        {/* Yaw */}
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="text-lg font-medium text-content mb-4 flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-orange-400" /> {t('common:yaw')}
          </h3>
          <div className="space-y-4">
            <DraggableSlider
              label={t('mavlink-config:ratesTab.maxRate', { unit: rateUnit })}
              value={rateValues.yawRate}
              onChange={(v) => setParameter(scheme.yaw.rate, v)}
              min={scheme.yawRateMin}
              max={scheme.yawRateMax}
              step={scheme.yawRateStep}
              color="#F97316"
              hint={scheme.hasExpo ? t('mavlink-config:ratesTab.atFullStick') : t('mavlink-config:ratesTab.rateMultiplier')}
            />
            {scheme.hasExpo && scheme.yaw.expo && (
              <DraggableSlider
                label={t('common:expo')}
                value={Math.round(rateValues.yawExpo * scheme.expoScale)}
                onChange={(v) => setParameter(scheme.yaw.expo!, v / scheme.expoScale)}
                min={0}
                max={100}
                step={5}
                color="#F97316"
                hint={t('mavlink-config:ratesTab.curveSoftness')}
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
      <div className="bg-surface rounded-xl border border-subtle p-4">
        <h3 className="text-sm font-medium text-content mb-3">{t('mavlink-config:ratesTab.summary')}</h3>
        <div className={`grid ${scheme.hasExpo ? 'grid-cols-4' : scheme.rpLinked ? 'grid-cols-2' : 'grid-cols-3'} gap-4 text-center`}>
          <div>
            <div className="text-2xl font-mono text-blue-400">{rateValues.rpRate}</div>
            <div className="text-xs text-content-secondary">{scheme.rpLinked ? t('mavlink-config:ratesTab.rollPitchRate', { unit: rateUnit }) : t('mavlink-config:ratesTab.rollRate', { unit: rateUnit })}</div>
          </div>
          {!scheme.rpLinked && rateValues.pitchRate !== undefined && (
            <div>
              <div className="text-2xl font-mono text-emerald-400">{rateValues.pitchRate}</div>
              <div className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.pitchRate', { unit: rateUnit })}</div>
            </div>
          )}
          <div>
            <div className="text-2xl font-mono text-orange-400">{rateValues.yawRate}</div>
            <div className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.yawRate', { unit: rateUnit })}</div>
          </div>
          {scheme.hasExpo && (
            <>
              <div>
                <div className="text-2xl font-mono text-emerald-400">
                  {Math.round(rateValues.rpExpo * scheme.expoScale)}%
                </div>
                <div className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.rollPitchExpo')}</div>
              </div>
              <div>
                <div className="text-2xl font-mono text-amber-400">
                  {Math.round(rateValues.yawExpo * scheme.expoScale)}%
                </div>
                <div className="text-xs text-content-secondary">{t('mavlink-config:ratesTab.yawExpo')}</div>
              </div>
            </>
          )}
        </div>
      </div>
      )}
      </div>
      </div>

      {/* Tip */}
      <InfoCard title={t('mavlink-config:ratesTab.tipTitle')} variant="tip">
        {t('mavlink-config:ratesTab.tipBody')}
        {' '}
        {scheme?.hasExpo
          ? t('mavlink-config:ratesTab.tipExpo')
          : t('mavlink-config:ratesTab.tipNoExpo')
        }
      </InfoCard>
    </div>
  );
};

export default RatesTab;
