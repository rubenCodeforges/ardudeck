/**
 * ServoEndpointSlider
 *
 * Triple slider for adjusting servo min/center/max endpoints.
 * Shows live servo position and allows endpoint adjustment.
 */

import { useState, useCallback } from 'react';

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
          <label className="text-xs text-zinc-400 block mb-1">Min (µs)</label>
          <input
            type="number"
            value={min}
            onChange={(e) => onChange({ min: snap(Number(e.target.value)), center, max })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
            min={rangeLimits.min}
            max={center - 50}
            step={10}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Center (µs)</label>
          <input
            type="number"
            value={center}
            onChange={(e) => onChange({ min, center: snap(Number(e.target.value)), max })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-green-500"
            min={min + 50}
            max={max - 50}
            step={10}
          />
        </div>
        <div>
          <label className="text-xs text-zinc-400 block mb-1">Max (µs)</label>
          <input
            type="number"
            value={max}
            onChange={(e) => onChange({ min, center, max: snap(Number(e.target.value)) })}
            className="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white focus:outline-none focus:border-blue-500"
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
        <div className="absolute top-1/2 -translate-y-1/2 w-full h-3 bg-zinc-800 rounded-full">
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
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-zinc-600 rounded cursor-ew-resize border-2 ${
            dragging === 'min' ? 'border-blue-400 bg-zinc-500' : 'border-zinc-500'
          }`}
          style={{ left: `${minPercent}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown('min')}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 whitespace-nowrap">
            min
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
            center
          </div>
        </div>

        {/* Max handle */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-8 bg-zinc-600 rounded cursor-ew-resize border-2 ${
            dragging === 'max' ? 'border-blue-400 bg-zinc-500' : 'border-zinc-500'
          }`}
          style={{ left: `${maxPercent}%`, marginLeft: -8 }}
          onMouseDown={handleMouseDown('max')}
        >
          <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] text-zinc-400 whitespace-nowrap">
            max
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
            className="flex-1 px-3 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 border border-zinc-700"
          >
            Test Min
          </button>
          <button
            onClick={() => onTestPosition('center')}
            className="flex-1 px-3 py-2 text-sm bg-green-500/20 text-green-400 rounded-lg hover:bg-green-500/30 border border-green-500/30"
          >
            Test Center
          </button>
          <button
            onClick={() => onTestPosition('max')}
            className="flex-1 px-3 py-2 text-sm bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 border border-zinc-700"
          >
            Test Max
          </button>
        </div>
      )}
    </div>
  );
}
