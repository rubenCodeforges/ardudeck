/**
 * Calibration for a vehicle that described its own.
 *
 * ArduDeck knows nothing about this routine and must not pretend to. Everything drawn
 * here came from the vehicle: the title, the warning, the poses, the tracks and their
 * targets. Progress is only ever what the vehicle last reported.
 */

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, CheckCircle2, XCircle, Play, Check, X } from 'lucide-react';
import { OrientationScene } from './shared/OrientationScene';
import { AD_CAL_REQ, type VehicleCalibration, type VehicleProfile } from '../../../shared/vehicle-profile';
import { useVehicleCalibrationStore } from '../../stores/vehicle-calibration-store';
import { useTelemetryStore } from '../../stores/telemetry-store';

const REQUIREMENT_TEXT: [number, string][] = [
  [AD_CAL_REQ.MOTORS_LIVE, 'calibration:vehicleCalibrationPanel.reqMotorsLive'],
  [AD_CAL_REQ.PROPS_OFF, 'calibration:vehicleCalibrationPanel.reqPropsOff'],
  [AD_CAL_REQ.DISARMED, 'calibration:vehicleCalibrationPanel.reqDisarmed'],
  [AD_CAL_REQ.STATIONARY, 'calibration:vehicleCalibrationPanel.reqStationary'],
  [AD_CAL_REQ.LEVEL_SURFACE, 'calibration:vehicleCalibrationPanel.reqLevelSurface'],
];

function requirementsFor(cal: VehicleCalibration): string[] {
  return REQUIREMENT_TEXT.filter(([bit]) => (cal.requirements & bit) !== 0).map(([, text]) => text);
}

function TrackBar({ label, unit, value, needed }: { label: string; unit: string; value: number; needed: number }) {
  const pct = needed > 0 ? Math.min(100, Math.max(0, (value / needed) * 100)) : 0;
  const done = value >= needed;
  return (
    <div>
      <div className="flex items-baseline justify-between text-xs mb-1">
        <span className="text-content-secondary">{label}</span>
        <span className={`font-mono ${done ? 'text-emerald-400' : 'text-content-tertiary'}`}>
          {value.toFixed(value < 10 ? 2 : 0)} / {needed}{unit && ` ${unit}`}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-surface-raised overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${done ? 'bg-emerald-500' : 'bg-blue-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function VehicleCalibrationPanel({ profile }: { profile: VehicleProfile }) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<VehicleCalibration | null>(null);
  const { activeId, progress, result, start, accept, cancel, save, reset } = useVehicleCalibrationStore();
  const attitude = useTelemetryStore((s) => s.attitude);

  useEffect(() => () => { void cancel(); }, [cancel]);

  if (profile.calibrations.length === 0) {
    return (
      <div className="p-6 rounded-xl bg-surface-raised border border-subtle text-sm text-content-secondary">
        {profile.vendor
          ? t('calibration:vehicleCalibrationPanel.noCalibrationsVendor', { vendor: profile.vendor })
          : t('calibration:vehicleCalibrationPanel.noCalibrations')}
      </div>
    );
  }

  const running = selected && activeId === selected.id;
  const pose = selected?.poses[progress?.step ?? 0];

  return (
    <div className="space-y-4">
      {!running && !result && (
        <div className="grid sm:grid-cols-2 gap-3">
          {profile.calibrations.map((cal) => {
            const localOnly = (cal.requirements & AD_CAL_REQ.LOCAL_ONLY) !== 0;
            return (
              <button
                key={cal.id}
                onClick={() => setSelected(cal)}
                disabled={localOnly}
                className={`text-left p-4 rounded-xl border transition-colors ${
                  localOnly
                    ? 'border-subtle bg-surface-raised opacity-60 cursor-not-allowed'
                    : selected?.id === cal.id
                      ? 'border-blue-500/50 bg-blue-500/10'
                      : 'border-subtle bg-surface-raised hover:border-blue-500/30'
                }`}
              >
                <div className="text-content-primary font-medium">{cal.name}</div>
                <div className="text-xs text-content-tertiary mt-0.5 capitalize">{cal.kind}</div>
                {localOnly && (
                  <div className="text-xs text-amber-400 mt-2">
                    {t('calibration:vehicleCalibrationPanel.localOnly')}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      )}

      {selected && !running && !result && (
        <div className="p-5 rounded-xl bg-surface-raised border border-subtle space-y-4">
          <div className="text-content-primary font-medium">{selected.name}</div>

          {selected.warning && (
            <div className="flex gap-3 p-3 rounded-lg bg-amber-500/10 border border-amber-500/30">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-content-secondary">{selected.warning}</p>
            </div>
          )}

          {requirementsFor(selected).length > 0 && (
            <ul className="space-y-1.5">
              {requirementsFor(selected).map((key) => (
                <li key={key} className="flex gap-2 text-sm text-content-secondary">
                  <span className="text-content-tertiary">·</span>{t(key)}
                </li>
              ))}
            </ul>
          )}

          {selected.kind === 'sweep' && selected.prompt && (
            <p className="text-sm text-content-secondary">{selected.prompt}</p>
          )}

          <button onClick={() => void start(selected.id)} className="btn-primary text-sm">
            <Play className="w-4 h-4" /> {t('common:start')}
          </button>
        </div>
      )}

      {running && selected && (
        <div className="p-5 rounded-xl bg-surface-raised border border-subtle space-y-5">
          <div className="flex items-center justify-between">
            <div className="text-content-primary font-medium">{selected.name}</div>
            {progress && progress.percent !== 255 && (
              <span className="font-mono text-sm text-content-tertiary">{progress.percent}%</span>
            )}
          </div>

          {selected.kind === 'positional' && pose && (
            <div className="text-center space-y-3">
              <OrientationScene
                target={{ rollDeg: pose.rollDeg, pitchDeg: pose.pitchDeg }}
                roll={attitude?.roll ?? 0}
                pitch={attitude?.pitch ?? 0}
                live={!!attitude}
                size={200}
              />
              <div className="text-content-primary font-medium">{pose.name}</div>
              <div className="text-xs text-content-tertiary">
                {t('calibration:vehicleCalibrationPanel.positionOf', { n: (progress?.step ?? 0) + 1, total: selected.poses.length })}
              </div>
              <button onClick={() => void accept()} className="btn-primary text-sm">
                <Check className="w-4 h-4" /> {t('calibration:vehicleCalibrationPanel.captured')}
              </button>
            </div>
          )}

          {selected.kind === 'coverage' && (
            <div className="space-y-3">
              {selected.tracks.map((tr, i) => (
                <TrackBar
                  key={tr.label}
                  label={tr.label}
                  unit={tr.unit}
                  value={progress?.track[i] ?? 0}
                  needed={tr.needed}
                />
              ))}
            </div>
          )}

          {progress?.hint && (
            <p className="text-sm text-blue-400">{progress.hint}</p>
          )}

          {!progress && (
            <p className="text-sm text-content-tertiary">{t('calibration:vehicleCalibrationPanel.waiting')}</p>
          )}

          <div className="flex gap-2">
            <button onClick={() => void cancel()} className="btn-secondary text-sm">
              <X className="w-4 h-4" /> {t('common:cancel')}
            </button>
            <button onClick={() => void save()} className="btn-secondary text-sm">
              {t('common:save')}
            </button>
          </div>
        </div>
      )}

      {result && (
        <div className={`p-5 rounded-xl border space-y-3 ${
          result.ok ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-red-500/10 border-red-500/30'
        }`}>
          <div className="flex items-center gap-2">
            {result.ok
              ? <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              : <XCircle className="w-5 h-5 text-red-400" />}
            <span className="text-content-primary font-medium">
              {result.ok ? t('calibration:vehicleCalibrationPanel.stored') : t('calibration:vehicleCalibrationPanel.failed')}
            </span>
          </div>
          {result.detail && <p className="text-sm text-content-secondary">{result.detail}</p>}
          {Number.isFinite(result.quality) && (
            <p className="text-xs text-content-tertiary">
              {t('calibration:vehicleCalibrationPanel.fitQuality', { pct: (result.quality * 100).toFixed(0) })}
            </p>
          )}
          <button onClick={() => { reset(); setSelected(null); }} className="btn-secondary text-sm">
            {t('common:done')}
          </button>
        </div>
      )}
    </div>
  );
}
