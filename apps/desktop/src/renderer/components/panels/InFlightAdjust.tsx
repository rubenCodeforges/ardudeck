import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Gauge, MoveVertical, CircleDot, type LucideIcon } from 'lucide-react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useTelemetryStore } from '../../stores/telemetry-store';
import { useParameterStore } from '../../stores/parameter-store';
import { useSettingsStore } from '../../stores/settings-store';
import { proposeParameterChanges } from '../../lib/param-proposal';
import {
  UNIT_LABELS,
  altitudeValueFromMeters, toMetersFromAltitudeUnit,
  distanceValueFromMeters, toMetersFromDistanceUnit,
  speedValueFromMetersPerSecond, toMetersPerSecondFromSpeedUnit,
} from '../../../shared/user-units';

export type InFlightAdjustStatus = { ok: boolean; text: string } | null;

function paramValue(name: string): number | undefined {
  return useParameterStore.getState().parameters.get(name)?.value;
}

/** Cruise airspeed target: AIRSPEED_CRUISE (4.5+, m/s) or TRIM_ARSPD_CM (older, cm/s). */
function cruiseAirspeed(): number | undefined {
  const cruise = paramValue('AIRSPEED_CRUISE');
  if (typeof cruise === 'number') return cruise;
  const trim = paramValue('TRIM_ARSPD_CM');
  return typeof trim === 'number' ? trim / 100 : undefined;
}

export interface InFlightAdjustRow {
  key: 'speed' | 'alt' | 'radius';
  Icon: LucideIcon;
  value: number;
  unit: string;
  min: number;
  step: number;
  onValue(display: number): void;
  label: string;
  tip: string;
  onGo(): void;
  /** Selected but not yet sent. */
  dirty: boolean;
  /** Back to the value last sent (or found at start). */
  onRevert(): void;
}

/** Speed, altitude and loiter radius in the pilot's units, with their send actions; shared by the panel and the map instrument. */
export function useInFlightAdjust(): { rows: InFlightAdjustRow[]; busy: InFlightAdjustRow['key'] | null; status: InFlightAdjustStatus } {
  const { t } = useTranslation();
  const units = useSettingsStore((s) => s.unitPreferences);
  const loiterParam = useParameterStore((s) => s.parameters.get('WP_LOITER_RAD')?.value);

  const [speedMs, setSpeedMs] = useState(() => cruiseAirspeed() ?? Math.round(useTelemetryStore.getState().vfrHud.airspeed));
  const [altM, setAltM] = useState(() => Math.round(useTelemetryStore.getState().position.relativeAlt));
  const [radiusM, setRadiusM] = useState(() => Math.abs(loiterParam ?? 80));
  const [sent, setSent] = useState(() => ({ speed: speedMs, alt: altM, radius: radiusM }));
  const [busy, setBusy] = useState<'speed' | 'alt' | 'radius' | null>(null);
  const [status, setStatus] = useState<InFlightAdjustStatus>(null);

  const run = async (key: 'speed' | 'alt' | 'radius', fn: () => Promise<InFlightAdjustStatus>) => {
    setBusy(key);
    setStatus(null);
    try {
      setStatus(await fn());
    } catch {
      setStatus({ ok: false, text: t('panels:inFlightAdjust.notSent') });
    } finally {
      setBusy(null);
    }
  };

  const changeSpeed = () => run('speed', async () => {
    const ok = await window.electronAPI.mavlinkChangeSpeed(speedMs, 0);
    if (ok) setSent((x) => ({ ...x, speed: speedMs }));
    return { ok, text: ok ? t('panels:inFlightAdjust.speedSent') : t('panels:inFlightAdjust.notSent') };
  });

  const changeAlt = () => run('alt', async () => {
    const ok = await window.electronAPI.mavlinkChangeAltitude(altM);
    if (ok) setSent((x) => ({ ...x, alt: altM }));
    return { ok, text: ok ? t('panels:inFlightAdjust.altSent') : t('panels:inFlightAdjust.notSent') };
  });

  const changeRadius = () => run('radius', async () => {
    // Negative WP_LOITER_RAD means counter-clockwise; keep the pilot's direction.
    const sign = (loiterParam ?? 1) < 0 ? -1 : 1;
    const outcome = await proposeParameterChanges(
      [{ name: 'WP_LOITER_RAD', value: Math.round(radiusM) * sign, reason: t('panels:inFlightAdjust.radiusReason') }],
      undefined,
      { allowArmed: true },
    );
    if (outcome.ok) {
      setSent((x) => ({ ...x, radius: radiusM }));
      return { ok: true, text: t('panels:inFlightAdjust.radiusSet') };
    }
    if (outcome.reason === 'user cancelled') return null;
    return { ok: false, text: t('panels:inFlightAdjust.radiusFailed') };
  });

  const rows: InFlightAdjustRow[] = [
    {
      key: 'speed', Icon: Gauge, unit: UNIT_LABELS.speed[units.speed],
      value: Number(speedValueFromMetersPerSecond(speedMs, units.speed).toFixed(1)), min: 0, step: 1,
      onValue: (v) => setSpeedMs(toMetersPerSecondFromSpeedUnit(v, units.speed)),
      label: t('panels:inFlightAdjust.changeSpeed'), tip: t('panels:inFlightAdjust.speedTip'), onGo: () => void changeSpeed(),
      dirty: !(Math.abs(speedMs - sent.speed) < 0.05), onRevert: () => setSpeedMs(sent.speed),
    },
    {
      key: 'alt', Icon: MoveVertical, unit: UNIT_LABELS.altitude[units.altitude],
      value: Math.round(altitudeValueFromMeters(altM, units.altitude)), min: 0, step: 5,
      onValue: (v) => setAltM(toMetersFromAltitudeUnit(v, units.altitude)),
      label: t('panels:inFlightAdjust.changeAlt'), tip: t('panels:inFlightAdjust.altTip'), onGo: () => void changeAlt(),
      dirty: !(Math.abs(altM - sent.alt) < 0.5), onRevert: () => setAltM(sent.alt),
    },
    {
      key: 'radius', Icon: CircleDot, unit: UNIT_LABELS.distance[units.distance],
      value: Math.round(distanceValueFromMeters(radiusM, units.distance)), min: 1, step: 5,
      onValue: (v) => setRadiusM(toMetersFromDistanceUnit(v, units.distance)),
      label: t('panels:inFlightAdjust.setLoiterRadius'), tip: t('panels:inFlightAdjust.radiusTip'), onGo: () => void changeRadius(),
      dirty: !(Math.abs(radiusM - sent.radius) < 0.5), onRevert: () => setRadiusM(sent.radius),
    },
  ];
  return { rows, busy, status };
}

export function InFlightAdjust({ inline = false }: { inline?: boolean }) {
  const { t } = useTranslation();
  const { rows, busy, status } = useInFlightAdjust();
  return (
    <div className={inline ? 'flex items-center gap-3' : 'space-y-1.5'}>
      {!inline && <div className="text-[10px] font-medium uppercase tracking-wider text-content-tertiary">{t('panels:inFlightAdjust.title')}</div>}
      {rows.map((r) => (
        <div key={r.key} className="flex items-center gap-1.5" data-tip={r.tip}>
          <r.Icon className="w-3.5 h-3.5 text-content-tertiary shrink-0" aria-hidden="true" />
          <DraftNumberInput
            value={r.value}
            min={r.min}
            step={r.step}
            onCommit={r.onValue}
            className="w-16 px-1.5 py-1 text-sm font-mono bg-surface-input border border-subtle rounded text-content"
          />
          <span className="text-[11px] text-content-secondary w-8 shrink-0">{r.unit}</span>
          <button
            onClick={r.onGo}
            disabled={busy !== null}
            className={`${inline ? '' : 'flex-1'} px-2.5 py-1 text-[11px] font-medium rounded bg-[var(--status-info-bg)] border border-subtle hover:border-[color:var(--status-info)] text-[color:var(--status-info-fg)] disabled:opacity-40 transition-all whitespace-nowrap`}
          >
            {r.label}
          </button>
        </div>
      ))}
      {status && (
        <div className={`text-[11px] ${status.ok ? 'text-emerald-400' : 'text-red-400'}`}>{status.text}</div>
      )}
    </div>
  );
}
