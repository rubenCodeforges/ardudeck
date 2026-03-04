import { useState, useCallback } from 'react';
import type { ElevationRange } from './TerrainOverlayLayer';

/** Inline editable elevation value - click to type, shows as text otherwise. */
function EditableValue({
  value,
  onChange,
  clampMin,
  clampMax,
}: {
  value: number;
  onChange: (v: number) => void;
  clampMin: number;
  clampMax: number;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');

  const startEdit = useCallback(() => {
    setEditText(String(Math.round(value)));
    setEditing(true);
  }, [value]);

  const apply = useCallback(() => {
    const parsed = parseInt(editText, 10);
    if (!isNaN(parsed)) {
      onChange(Math.max(clampMin, Math.min(clampMax, parsed)));
    }
    setEditing(false);
  }, [editText, onChange, clampMin, clampMax]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') setEditing(false);
  }, [apply]);

  if (editing) {
    return (
      <input
        type="number"
        value={editText}
        onChange={(e) => setEditText(e.target.value)}
        onBlur={apply}
        onKeyDown={handleKeyDown}
        // Hide native spinner: [appearance:textfield] + webkit pseudo handled via inline style
        className="w-12 px-1 py-0 text-[10px] font-mono bg-gray-800 border border-blue-500/50 rounded text-white focus:outline-none leading-tight [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        autoFocus
      />
    );
  }

  return (
    <button
      onClick={startEdit}
      className="font-mono text-white text-[10px] leading-none hover:text-blue-400 transition-colors border-b border-dashed border-gray-600 hover:border-blue-400/50"
      title="Click to edit"
    >
      {Math.round(value)}m
    </button>
  );
}

interface ElevationLegendProps {
  minElevation: number;
  maxElevation: number;
  autoRange: boolean;
  onAutoRangeChange: (auto: boolean) => void;
  fixedRange: ElevationRange;
  onFixedRangeChange: (range: ElevationRange) => void;
}

export function ElevationLegend({
  minElevation,
  maxElevation,
  autoRange,
  onAutoRangeChange,
  fixedRange,
  onFixedRangeChange,
}: ElevationLegendProps) {
  const displayMin = autoRange ? minElevation : fixedRange.min;
  const displayMax = autoRange ? maxElevation : fixedRange.max;
  const mid = Math.round((displayMin + displayMax) / 2);

  return (
    <div className="bg-gray-900/90 backdrop-blur-sm rounded px-2 py-2 text-[10px] text-gray-300 select-none">
      {/* Header */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-gray-500 font-medium">AMSL</span>
        <button
          onClick={() => onAutoRangeChange(!autoRange)}
          className={`ml-auto px-1.5 py-px rounded text-[9px] font-medium transition-colors ${
            autoRange
              ? 'bg-blue-500/25 text-blue-400'
              : 'bg-gray-700/40 text-gray-500 hover:text-gray-300'
          }`}
        >
          Auto
        </button>
      </div>

      {/* Gradient bar + values */}
      <div className="flex items-stretch gap-1.5">
        <div
          className="w-2.5 rounded-sm flex-shrink-0"
          style={{
            minHeight: 56,
            background: 'linear-gradient(to bottom, #dcdcdc, #b4322d, #c8a028, #64be3c, #1e64b4)',
          }}
        />
        <div className="flex flex-col justify-between py-0.5">
          {!autoRange ? (
            <EditableValue
              value={fixedRange.max}
              onChange={(v) => onFixedRangeChange({ ...fixedRange, max: v })}
              clampMin={fixedRange.min + 1}
              clampMax={9000}
            />
          ) : (
            <span className="font-mono text-white leading-none">{Math.round(displayMax)}m</span>
          )}

          <span className="font-mono text-gray-500 leading-none">{mid}m</span>

          {!autoRange ? (
            <EditableValue
              value={fixedRange.min}
              onChange={(v) => onFixedRangeChange({ ...fixedRange, min: v })}
              clampMin={0}
              clampMax={fixedRange.max - 1}
            />
          ) : (
            <span className="font-mono text-white leading-none">{Math.round(displayMin)}m</span>
          )}
        </div>
      </div>
    </div>
  );
}
