/**
 * SITL Environment Simulation Panel
 *
 * Controls for wind (speed, direction, turbulence) and battery voltage.
 * Writes SIM_* parameters to the running SITL instance in real-time.
 */

import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useSimParam } from '../../hooks/useSimParam';

// Wind direction arrow SVG - rotates to show wind direction
function WindDirectionIndicator({ degrees }: { degrees: number }) {
  return (
    <div className="w-9 h-9 rounded-full border border-subtle bg-surface flex items-center justify-center shrink-0">
      <svg
        className="w-5 h-5 text-cyan-400"
        viewBox="0 0 24 24"
        style={{ transform: `rotate(${degrees}deg)` }}
      >
        <path
          d="M12 4l-3 6h6l-3-6z"
          fill="currentColor"
        />
        <line x1="12" y1="10" x2="12" y2="20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

interface SliderRowProps {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  available: boolean;
  accentClass: string;
  formatValue?: (v: number) => string;
  children?: React.ReactNode;
}

function SliderRow({ label, value, onChange, min, max, step, unit, available, accentClass, formatValue, children }: SliderRowProps) {
  return (
    <div className={!available ? 'opacity-40 pointer-events-none' : ''}>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-xs text-content-secondary">{label}</label>
        <div className="flex items-center gap-1.5">
          {children}
          <span className="text-xs font-mono text-content tabular-nums min-w-[4rem] text-right">
            {formatValue ? formatValue(value) : value.toFixed(step < 1 ? 1 : 0)} {unit}
          </span>
        </div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className={`w-full h-2 bg-surface-raised rounded-lg appearance-none cursor-pointer ${accentClass}`}
      />
    </div>
  );
}

export default function SitlEnvironmentPanel({ bare = false }: { bare?: boolean }) {
  const { t } = useTranslation();
  const wind = {
    speed: useSimParam('SIM_WIND_SPD', 0),
    direction: useSimParam('SIM_WIND_DIR', 180),
    turbulence: useSimParam('SIM_WIND_TURB', 0),
  };

  const battery = {
    voltage: useSimParam('SIM_BATT_VOLTAGE', 0),
  };

  const anyAvailable = wind.speed.available || wind.direction.available || battery.voltage.available;

  const handleReset = useCallback(() => {
    wind.speed.setValue(0);
    wind.direction.setValue(180);
    wind.turbulence.setValue(0);
    battery.voltage.setValue(0);
  }, [wind.speed, wind.direction, wind.turbulence, battery.voltage]);

  if (!anyAvailable) {
    return bare ? (
      <div className="flex items-center justify-center h-full text-xs text-content-tertiary">
        {t('sitl:environmentPanel.connectToControl')}
      </div>
    ) : null;
  }

  const content = (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M2 15c2-1 4 1 6 0s4-3 6-2 4 2 6 1M2 19c2-1 4 1 6 0s4-3 6-2 4 2 6 1M2 11c2-1 4 1 6 0s4-3 6-2 4 2 6 1" />
          </svg>
          <h3 className="text-sm font-medium text-content">{t('sitl:environmentPanel.title')}</h3>
        </div>
        <button
          onClick={handleReset}
          className="px-2 py-1 text-xs text-content-secondary hover:text-content bg-surface-raised hover:bg-surface-raised rounded transition-colors"
        >
          {t('common:reset')}
        </button>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-2 gap-4">
        {/* Wind */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">{t('common:wind')}</span>
            <div className="flex-1 h-px bg-surface-raised" />
          </div>

          <SliderRow
            label={t('common:speed')}
            value={wind.speed.value}
            onChange={wind.speed.setValue}
            min={0}
            max={30}
            step={0.5}
            unit="m/s"
            available={wind.speed.available}
            accentClass="accent-cyan-500"
          />

          <SliderRow
            label={t('common:direction')}
            value={wind.direction.value}
            onChange={wind.direction.setValue}
            min={0}
            max={360}
            step={5}
            unit=""
            available={wind.direction.available}
            accentClass="accent-cyan-500"
            formatValue={(v) => `${v.toFixed(0)}\u00B0`}
          >
            <WindDirectionIndicator degrees={wind.direction.value} />
          </SliderRow>

          <SliderRow
            label={t('sitl:environmentPanel.turbulence')}
            value={wind.turbulence.value}
            onChange={wind.turbulence.setValue}
            min={0}
            max={10}
            step={0.1}
            unit=""
            available={wind.turbulence.available}
            accentClass="accent-cyan-500"
          />
        </div>

        {/* Battery */}
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-medium text-content-secondary uppercase tracking-wider">{t('common:battery')}</span>
            <div className="flex-1 h-px bg-surface-raised" />
          </div>

          <SliderRow
            label={t('sitl:environmentPanel.voltageOverride')}
            value={battery.voltage.value}
            onChange={battery.voltage.setValue}
            min={0}
            max={50.4}
            step={0.1}
            unit="V"
            available={battery.voltage.available}
            accentClass="accent-amber-500"
          />

          <p className="text-[10px] text-content-tertiary leading-relaxed">
            {t('sitl:environmentPanel.voltageHint')}
          </p>
        </div>
      </div>
    </>
  );

  if (bare) return content;

  return (
    <div className="bg-surface-input border border-subtle rounded-lg p-4">
      {content}
    </div>
  );
}
