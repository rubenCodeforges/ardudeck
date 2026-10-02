/**
 * Tuning for a fixed wing, in the parameters it actually has.
 *
 * The copter tab speaks ANGLE_MAX / WPNAV_SPEED / LOIT_SPEED, none of which
 * exist on ArduPlane, so on a plane it rendered fallback defaults as though
 * they were the aircraft's settings. A plane's equivalents are its airspeed
 * envelope and its attitude limits.
 *
 * The airspeed range is not cosmetic: ArduPlane refuses a DO_CHANGE_SPEED
 * outside AIRSPEED_MIN..AIRSPEED_MAX outright rather than clamping it, so a
 * guided speed request that looks ignored is usually this.
 *
 * Slider bounds come from each parameter's published @Range, so they match
 * what the firmware will accept instead of a number picked by eye.
 */

import { useTranslation } from 'react-i18next';
import { Gauge, Plane } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { DraggableSlider } from '../ui/DraggableSlider';

export default function PlaneTuningTab(): JSX.Element {
  const { t } = useTranslation();
  const { parameters, setParameter } = useParameterStore();
  const getMeta = useParameterStore((s) => s.getParameterMetadata);

  /**
   * Slider bounds from the parameter's own @Range, not a number someone
   * guessed. `floor`/`ceil` only narrow it where one value must stay below
   * another (a minimum airspeed above the maximum is not a setting).
   */
  const bounds = (name: string, fb: { min: number; max: number }, narrow?: { floor?: number; ceil?: number }) => {
    const r = getMeta(name)?.range ?? fb;
    return {
      min: Math.max(r.min, narrow?.floor ?? -Infinity),
      max: Math.min(r.max, narrow?.ceil ?? Infinity),
      step: getMeta(name)?.increment ?? 1,
    };
  };

  const num = (name: string, fallback: number) => {
    const v = parameters.get(name)?.value;
    return typeof v === 'number' ? v : fallback;
  };
  const has = (name: string) => parameters.has(name);

  const cruise = num('AIRSPEED_CRUISE', 22);
  const vmin = num('AIRSPEED_MIN', 10);
  const vmax = num('AIRSPEED_MAX', 30);

  if (!has('AIRSPEED_CRUISE') && !has('AIRSPEED_MIN')) {
    return (
      <div className="rounded-xl border border-subtle bg-surface p-5 text-sm text-content-secondary">
        {t('mavlink-config:planeTuningTab.noParams')}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-subtle bg-surface p-5">
        <div className="mb-4 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-sky-500/20">
            <Gauge className="h-5 w-5 text-sky-400" />
          </div>
          <div className="flex-1">
            <h3 className="font-medium text-content">{t('mavlink-config:planeTuningTab.envelopeTitle')}</h3>
            <p className="text-xs text-content-secondary">
              {t('mavlink-config:planeTuningTab.envelopeSubtitle')}
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <DraggableSlider
            label={t('mavlink-config:planeTuningTab.cruise')}
            value={cruise}
            onChange={(v) => setParameter('AIRSPEED_CRUISE', v)}
            {...bounds('AIRSPEED_CRUISE', { min: 5, max: 100 })}
            color="#38BDF8"
            hint={t('mavlink-config:planeTuningTab.cruiseHint', { v: cruise.toFixed(0) })}
          />

          <DraggableSlider
            label={t('mavlink-config:planeTuningTab.min')}
            value={vmin}
            onChange={(v) => setParameter('AIRSPEED_MIN', v)}
            {...bounds('AIRSPEED_MIN', { min: 5, max: 100 }, { ceil: vmax - 1 })}
            color="#F59E0B"
            hint={t('mavlink-config:planeTuningTab.minHint', { v: vmin.toFixed(0) })}
          />

          <DraggableSlider
            label={t('mavlink-config:planeTuningTab.max')}
            value={vmax}
            onChange={(v) => setParameter('AIRSPEED_MAX', v)}
            {...bounds('AIRSPEED_MAX', { min: 5, max: 100 }, { floor: vmin + 1 })}
            color="#EF4444"
            hint={t('mavlink-config:planeTuningTab.maxHint', { v: vmax.toFixed(0) })}
          />
        </div>

        <p className="mt-3 rounded-md bg-surface-raised px-3 py-2 text-[11px] text-content-tertiary">
          {t('mavlink-config:planeTuningTab.rangeNote', { min: vmin.toFixed(0), max: vmax.toFixed(0) })}
        </p>
      </div>

      {(has('ROLL_LIMIT_DEG') || has('PTCH_LIM_MAX_DEG')) && (
        <div className="rounded-xl border border-subtle bg-surface p-5">
          <div className="mb-4 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20">
              <Plane className="h-5 w-5 text-violet-400" />
            </div>
            <div className="flex-1">
              <h3 className="font-medium text-content">{t('mavlink-config:planeTuningTab.attitudeTitle')}</h3>
              <p className="text-xs text-content-secondary">
                {t('mavlink-config:planeTuningTab.attitudeSubtitle')}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {has('ROLL_LIMIT_DEG') && (
              <DraggableSlider
                label={t('mavlink-config:planeTuningTab.bank')}
                value={num('ROLL_LIMIT_DEG', 45)}
                onChange={(v) => setParameter('ROLL_LIMIT_DEG', v)}
                {...bounds('ROLL_LIMIT_DEG', { min: 0, max: 90 })}
                color="#8B5CF6"
                hint={t('mavlink-config:planeTuningTab.bankHint', { v: num('ROLL_LIMIT_DEG', 45).toFixed(0) })}
              />
            )}
            {has('PTCH_LIM_MAX_DEG') && (
              <DraggableSlider
                label={t('mavlink-config:planeTuningTab.pitchUp')}
                value={num('PTCH_LIM_MAX_DEG', 25)}
                onChange={(v) => setParameter('PTCH_LIM_MAX_DEG', v)}
                {...bounds('PTCH_LIM_MAX_DEG', { min: 0, max: 90 })}
                color="#22C55E"
                hint={t('mavlink-config:planeTuningTab.pitchUpHint', { v: num('PTCH_LIM_MAX_DEG', 25).toFixed(0) })}
              />
            )}
            {has('PTCH_LIM_MIN_DEG') && (
              <DraggableSlider
                label={t('mavlink-config:planeTuningTab.pitchDown')}
                value={num('PTCH_LIM_MIN_DEG', -20)}
                onChange={(v) => setParameter('PTCH_LIM_MIN_DEG', v)}
                {...bounds('PTCH_LIM_MIN_DEG', { min: -90, max: 0 })}
                color="#F97316"
                hint={t('mavlink-config:planeTuningTab.pitchDownHint', { v: num('PTCH_LIM_MIN_DEG', -20).toFixed(0) })}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
