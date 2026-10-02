/**
 * Px4LoggingConfig
 *
 * PX4 logging setup that mirrors the ArduPilot LoggingTab UX (same cards, icon
 * boxes and switches) bound to PX4's SDLOG_* parameters. PX4 has no logging
 * backend bitmask: SDLOG_MODE alone decides both whether the vehicle logs and
 * when, with -1 meaning never, so "no card fitted" is the -1 case here.
 *
 * Profile bits come from the board's own metadata when it is loaded, with a
 * fallback table for boards whose metadata has not arrived.
 */

import { useCallback, useMemo, useState } from 'react';
import { HardDrive, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';
import { InfoCard } from '../ui/InfoCard';
import { useTranslation } from 'react-i18next';

/** SDLOG_MODE: when the logger runs. -1 is "never", which is the no-card case. */
const MODE_OPTIONS = [
  { value: 0, labelKey: 'mavlink-config:px4LoggingConfig.modeArmToDisarm', hintKey: 'mavlink-config:px4LoggingConfig.modeArmToDisarmHint' },
  { value: 1, labelKey: 'mavlink-config:px4LoggingConfig.modeBootToDisarm', hintKey: 'mavlink-config:px4LoggingConfig.modeBootToDisarmHint' },
  { value: 2, labelKey: 'mavlink-config:px4LoggingConfig.modeBootToShutdown', hintKey: 'mavlink-config:px4LoggingConfig.modeBootToShutdownHint' },
  { value: 3, labelKey: 'mavlink-config:px4LoggingConfig.modeAux1', hintKey: 'mavlink-config:px4LoggingConfig.modeAux1Hint' },
  { value: 4, labelKey: 'mavlink-config:px4LoggingConfig.modeFirstArmToShutdown', hintKey: 'mavlink-config:px4LoggingConfig.modeFirstArmToShutdownHint' },
];

/** SDLOG_MODE default, and what "logging on" restores. */
const MODE_DEFAULT = 0;

/** SDLOG_PROFILE bits, used when the vehicle's metadata is not loaded. */
// Mirrors PX4 SDLOG_PROFILE metadata, which stays English.
const PROFILE_FALLBACK: Record<number, string> = {
  0: 'Default set', // i18n-exempt
  1: 'Estimator replay', // i18n-exempt
  2: 'Thermal calibration', // i18n-exempt
  3: 'System identification', // i18n-exempt
  4: 'High rate', // i18n-exempt
  5: 'Debug', // i18n-exempt
  6: 'Sensor comparison', // i18n-exempt
  7: 'Computer vision and avoidance', // i18n-exempt
  8: 'Raw FIFO high-rate IMU', // i18n-exempt
  9: 'Raw FIFO high-rate magnetometer', // i18n-exempt
};

export default function Px4LoggingConfig(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter, getParameterMetadata } = useParameterStore();
  const [busy, setBusy] = useState(false);

  const mode = (parameters.get('SDLOG_MODE')?.value as number) ?? MODE_DEFAULT;
  const profile = (parameters.get('SDLOG_PROFILE')?.value as number) ?? 1;
  const dirsMax = (parameters.get('SDLOG_DIRS_MAX')?.value as number) ?? 0;
  const missionLog = (parameters.get('SDLOG_MISSION')?.value as number) ?? 0;

  const supported = parameters.has('SDLOG_MODE');
  const loggingOff = mode < 0;

  const categories = useMemo(() => {
    const meta = getParameterMetadata('SDLOG_PROFILE');
    const bits = meta?.bitmask && Object.keys(meta.bitmask).length > 0
      ? meta.bitmask
      : PROFILE_FALLBACK;
    return Object.entries(bits)
      .map(([bit, label]) => ({ bit: Number(bit), label: String(label) }))
      .sort((a, b) => a.bit - b.bit);
  }, [getParameterMetadata]);

  const write = useCallback(async (param: string, value: number) => {
    setBusy(true);
    try {
      await setParameter(param, value);
    } finally {
      setBusy(false);
    }
  }, [setParameter]);

  const toggleCategory = (bit: number) => write('SDLOG_PROFILE', profile ^ (1 << bit));

  if (!supported) {
    return (
      <div className="p-6">
        <InfoCard title={t('mavlink-config:px4LoggingConfig.logging')} variant="info">
          {t('mavlink-config:px4LoggingConfig.notExposed')}
        </InfoCard>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-4">
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg bg-sky-500/20 flex items-center justify-center">
            <HardDrive className="w-5 h-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('mavlink-config:px4LoggingConfig.flightLogs')}</h3>
            <p className="text-xs text-content-secondary">
              {loggingOff
                ? t('mavlink-config:px4LoggingConfig.offSubtitle')
                : t('mavlink-config:px4LoggingConfig.onSubtitle')}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => write('SDLOG_MODE', MODE_DEFAULT)}
              disabled={busy || !loggingOff}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                loggingOff
                  ? 'bg-sky-500/20 text-sky-300 hover:bg-sky-500/30'
                  : 'bg-surface-overlay text-content-tertiary'
              }`}
            >
              {t('mavlink-config:px4LoggingConfig.loggingOn')}
            </button>
            <button
              onClick={() => write('SDLOG_MODE', -1)}
              disabled={busy || loggingOff}
              className={`rounded-md px-3 py-1.5 text-xs transition-colors disabled:opacity-40 ${
                loggingOff
                  ? 'bg-surface-overlay text-content-tertiary'
                  : 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
              }`}
            >
              {t('mavlink-config:px4LoggingConfig.noLogging')}
            </button>
          </div>
        </div>

        {loggingOff ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div>
                <p className="text-amber-300">{t('mavlink-config:px4LoggingConfig.nothingRecorded')}</p>
                <p className="mt-1">
                  {t('mavlink-config:px4LoggingConfig.noCardHint')}
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="text-xs text-content-secondary">{t('mavlink-config:px4LoggingConfig.whenToRecord')}</div>
            {MODE_OPTIONS.map((o) => (
              <button
                key={o.value}
                onClick={() => write('SDLOG_MODE', o.value)}
                disabled={busy}
                className={`flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors disabled:opacity-40 ${
                  mode === o.value
                    ? 'border-sky-500/40 bg-sky-500/15'
                    : 'border-subtle bg-surface-raised hover:bg-surface-overlay'
                }`}
              >
                <span className={`text-xs ${mode === o.value ? 'text-sky-300' : 'text-content'}`}>
                  {t(o.labelKey)}
                </span>
                <span className="text-[11px] text-content-tertiary">{t(o.hintKey)}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {!loggingOff && (
        <div className="bg-surface rounded-xl border border-subtle p-5">
          <h3 className="mb-1 font-medium text-content">{t('mavlink-config:px4LoggingConfig.whatGetsRecorded')}</h3>
          <p className="mb-3 text-xs text-content-secondary">
            {t('mavlink-config:px4LoggingConfig.profilesHint')}
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {categories.map((c) => {
              const on = (profile & (1 << c.bit)) !== 0;
              return (
                <button
                  key={c.bit}
                  onClick={() => toggleCategory(c.bit)}
                  disabled={busy}
                  className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40 ${
                    on
                      ? 'border-sky-500/40 bg-sky-500/15 text-sky-300'
                      : 'border-subtle bg-surface-raised text-content-secondary hover:text-content'
                  }`}
                >
                  <span className="w-3">{on ? '✓' : ''}</span>
                  <span className="min-w-0 truncate">{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {!loggingOff && (
        <div className="bg-surface rounded-xl border border-subtle p-5 space-y-4">
          <h3 className="font-medium text-content">{t('mavlink-config:px4LoggingConfig.cardHousekeeping')}</h3>

          {parameters.has('SDLOG_DIRS_MAX') && (
            <DraggableSlider
              label={t('mavlink-config:px4LoggingConfig.keepAtMost')}
              value={dirsMax}
              min={0}
              max={100}
              step={1}
              unit={dirsMax === 0 ? '' : t('mavlink-config:px4LoggingConfig.logFoldersUnit')}
              onChange={(v) => write('SDLOG_DIRS_MAX', Math.round(v))}
              disabled={busy}
            />
          )}
          <p className="text-[11px] text-content-tertiary">
            {dirsMax === 0
              ? t('mavlink-config:px4LoggingConfig.unlimited')
              : t('mavlink-config:px4LoggingConfig.oldestDeleted', { count: dirsMax })}
          </p>

          {parameters.has('SDLOG_MISSION') && (
            <div>
              <div className="mb-2 text-xs text-content-secondary">{t('mavlink-config:px4LoggingConfig.missionLog')}</div>
              <div className="flex gap-2">
                {[
                  { value: 0, label: t('common:off') },
                  { value: 1, label: t('mavlink-config:px4LoggingConfig.allMissionMessages') },
                  { value: 2, label: t('mavlink-config:px4LoggingConfig.geotaggingOnly') },
                ].map((o) => (
                  <button
                    key={o.value}
                    onClick={() => write('SDLOG_MISSION', o.value)}
                    disabled={busy}
                    className={`flex-1 rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
                      missionLog === o.value
                        ? 'bg-sky-500/20 text-sky-300 ring-1 ring-sky-500/40'
                        : 'bg-surface-overlay text-content-secondary hover:text-content'
                    }`}
                  >
                    {o.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
