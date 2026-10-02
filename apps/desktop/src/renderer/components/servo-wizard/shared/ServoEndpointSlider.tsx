/**
 * ServoEndpointSlider
 *
 * Triple slider for adjusting servo min/center/max endpoints.
 * Shows live servo position and allows endpoint adjustment.
 */

import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';

interface ServoEndpointSliderProps {
  min: number;
  center: number;
  max: number;
  currentValue: number;
  onChange: (endpoints: { min: number; center: number; max: number }) => void;
  onTestPosition?: (position: 'min' | 'center' | 'max') => void;
  /** Valid servo range limits (old iNav: 750-2250, modern: 500-2500) */
  rangeLimits?: { min: number; max: number };
}

export default function ServoEndpointSlider({
  min,
  center,
  max,
  currentValue,
  onChange,
  onTestPosition,
  rangeLimits = { min: 500, max: 2500 },
}: ServoEndpointSliderProps) {
  const { t } = useTranslation();
  const [dragging, setDragging] = useState<'min' | 'center' | 'max' | null>(null);

  // Calculate range span for percentage conversion
  const rangeSpan = rangeLimits.max - rangeLimits.min;

  // Convert PWM value to percentage position (based on valid range limits)
  const toPercent = (v: number) => ((v - rangeLimits.min) / rangeSpan) * 100;
  const fromPercent = (p: number) => Math.round((p / 100) * rangeSpan + rangeLimits.min);

  // Snap to nearest 10us
  const snap = (v: number) => Math.round(v / 10) * 10;

  const handleMouseDown = useCallback(
    (handle: 'min' | 'center' | 'max') => (e: React.MouseEvent) => {
      e.preventDefault();
      setDragging(handle);
    },
    []
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!dragging) return;

      const rect = e.currentTarget.getBoundingClientRect();
      const percent = ((e.clientX - rect.left) / rect.width) * 100;
      const value = snap(fromPercent(Math.max(0, Math.min(100, percent))));

      // Enforce constraints (use rangeLimits for min/max bounds)
      if (dragging === 'min') {
        const newMin = Math.min(value, center - 50);
        onChange({ min: Math.max(rangeLimits.min, newMin), center, max });
      } else if (dragging === 'center') {
        const newCenter = Math.max(min + 50, Math.min(max - 50, value));
        onChange({ min, center: newCenter, max });
      } else if (dragging === 'max') {
        const newMax = Math.max(value, center + 50);
        onChange({ min, center, max: Math.min(rangeLimits.max, newMax) });
      }
    },
    [dragging, min, center, max, onChange, rangeLimits]
  );

  const handleMouseUp = useCallback(() => {
    setDragging(null);
  }, []);

  // Calculate positions
  const minPercent = toPercent(min);
  const centerPercent = toPercent(center);
  const maxPercent = toPercent(max);
  const valuePercent = toPercent(currentValue);

  return (
    <div className="space-y-4">
      {/* Number inputs */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="text-xs text-content-secondary block mb-1">{t('servo-wizard:servoEndpointSlider.minUs')}</label>
          <DraftNumberInput
            value={min}
            onCommit={(v) => onChange({ min: snap(v), center, max })}
            className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            min={rangeLimits.min}
            max={center - 50}
            step={10}
          />
        </div>
        <div>
          <label className="text-xs text-content-secondary block mb-1">{t('servo-wizard:servoEndpointSlider.centerUs')}</label>
          <DraftNumberInput
            value={center}
            onCommit={(v) => onChange({ min, center: snap(v), max })}
            className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-sm text-content focus:outline-none focus:border-green-500"
            min={min + 50}
            max={max - 50}
            step={10}
          />
        </div>
        <div>
          <label className="text-xs text-content-secondary block mb-1">{t('servo-wizard:servoEndpointSlider.maxUs')}</label>
          <DraftNumberInput
            value={max}
            onCommit={(v) => onChange({ min, center, max: snap(v) })}
            className="w-full px-3 py-2 bg-surface-raised border border rounded-lg text-sm text-content focus:outline-none focus:border-blue-500"
            min={center + 50}
            max={rangeLimits.max}
            step={10}
          />
        </div>
      </div>

      {/* Visual slider - extra padding-bottom for labels */}
      <div
        className="relative h-16 select-none pt-2"
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        {/* Track background */}
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-3 bg-surface-inset rounded-full">
          {/* Active range */}
          <div
            className="absolute h-full bg-blue-500/30 rounded-full"
            style={{
              left: `${minPercent}%`,
              width: `${maxPercent - minPercent}%`,
            }}
          />
        </div>

        {/* Min handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-surface-raised rounded cursor-ew-resize border-2 ${
            dragging === 'min' ? 'border-blue-400 bg-zinc-500' : 'border-zinc-500'
          }`}
          style={{ left: `${minPercent}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown('min')}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-content-secondary whitespace-nowrap">
            {t('servo-wizard:servoEndpointSlider.minHandle')}
          </div>
        </div>

        {/* Center handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-green-600 rounded cursor-ew-resize border-2 ${
            dragging === 'center' ? 'border-green-400 bg-green-500' : 'border-green-500'
          }`}
          style={{ left: `${centerPercent}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown('center')}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-green-400 whitespace-nowrap">
            {t('servo-wizard:servoEndpointSlider.centerHandle')}
          </div>
        </div>

        {/* Max handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-surface-raised rounded cursor-ew-resize border-2 ${
            dragging === 'max' ? 'border-blue-400 bg-zinc-500' : 'border-zinc-500'
          }`}
          style={{ left: `${maxPercent}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown('max')}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-content-secondary whitespace-nowrap">
            {t('servo-wizard:servoEndpointSlider.maxHandle')}
          </div>
        </div>

        {/* Current value marker */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-1 h-6 bg-yellow-400 rounded transition-all duration-75"
          style={{ left: `${valuePercent}%` }}
        />
      </div>

      {/* Test buttons */}
      {onTestPosition && (
        <div className="flex gap-2 mt-6">
          <button
            onClick={() => onTestPosition('min')}
            className="flex-1 px-3 py-2 text-sm bg-surface-raised text-content rounded-lg hover:bg-surface-raised border border"
          >
            {t('servo-wizard:servoEndpointSlider.testMin')}
          </button>
          <button
            onClick={() => onTestPosition('center')}
            className="flex-1 px-3 py-2 text-sm bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 border border-green-500/30"
          >
            {t('servo-wizard:servoEndpointSlider.testCenter')}
          </button>
          <button
            onClick={() => onTestPosition('max')}
            className="flex-1 px-3 py-2 text-sm bg-surface-raised text-content rounded-lg hover:bg-surface-raised border border"
          >
            {t('servo-wizard:servoEndpointSlider.testMax')}
          </button>
        </div>
      )}
    </div>
  );
}
