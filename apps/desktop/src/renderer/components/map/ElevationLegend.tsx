import { useState, useCallback } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import type { ElevationRange } from './TerrainOverlayLayer';
import {
  altitudeValueFromMeters,
  formatAltitudeFromMeters,
  toMetersFromAltitudeUnit,
  UNIT_LABELS,
  type AltitudeUnit,
} from '../../../shared/user-units.js';

function parseNumberDraft(value: string): number | null {
  const trimmed = value.trim();
  if (!/^[+-]?(?:(?:\d+\.?\d*)|(?:\.\d+))(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Inline editable elevation value - click to type, shows as text otherwise. */
function EditableValue({
  valueMeters,
  onChange,
  clampMinMeters,
  clampMaxMeters,
  altitudeUnit,
}: {
  valueMeters: number;
  onChange: (v: number) => void;
  clampMinMeters: number;
  clampMaxMeters: number;
  altitudeUnit: AltitudeUnit;
}) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState('');
  const displayPrecision = altitudeUnit === 'km' ? 3 : altitudeUnit === 'm' ? 0 : 1;
  const displayValue = Number(altitudeValueFromMeters(valueMeters, altitudeUnit).toFixed(displayPrecision));
  const displayMin = altitudeValueFromMeters(clampMinMeters, altitudeUnit);
  const displayMax = altitudeValueFromMeters(clampMaxMeters, altitudeUnit);

  const startEdit = useCallback(() => {
    setEditText(String(displayValue));
    setEditing(true);
  }, [displayValue]);

  const apply = useCallback(() => {
    const parsed = parseNumberDraft(editText);
    if (parsed !== null) {
      if (parsed === displayValue) {
        setEditing(false);
        return;
      }
      const displayClamped = Math.max(displayMin, Math.min(displayMax, parsed));
      const meters = toMetersFromAltitudeUnit(displayClamped, altitudeUnit);
      onChange(Math.max(clampMinMeters, Math.min(clampMaxMeters, meters)));
    }
    setEditing(false);
  }, [altitudeUnit, clampMaxMeters, clampMinMeters, displayMax, displayMin, displayValue, editText, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') apply();
    if (e.key === 'Escape') setEditing(false);
  }, [apply]);

  if (editing) {
    return (
      <span className="inline-flex items-center gap-0.5">
        <input
          type="number"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={apply}
          onKeyDown={handleKeyDown}
          // Hide native spinner: [appearance:textfield] + webkit pseudo handled via inline style
          className="w-14 px-1 py-0 text-[10px] font-mono bg-surface-raised border border-blue-500/50 rounded text-content focus:outline-none leading-tight [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          autoFocus
        />
        <span className="text-[9px] text-content-tertiary leading-none">{UNIT_LABELS.altitude[altitudeUnit]}</span>
      </span>
    );
  }

  return (
    <button
      onClick={startEdit}
      className="font-mono text-content text-[10px] leading-none hover:text-blue-400 transition-colors border-b border-dashed border hover:border-blue-400/50"
      title="Click to edit"
    >
      {formatAltitudeFromMeters(valueMeters, altitudeUnit)}
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
  /** Whether elevations are shown relative to craft altitude */
  relativeMode?: boolean;
  onRelativeModeChange?: (relative: boolean) => void;
  /** Whether craft position is available (to enable Rel button) */
  hasCraftPosition?: boolean;
}

export function ElevationLegend({
  minElevation,
  maxElevation,
  autoRange,
  onAutoRangeChange,
  fixedRange,
  onFixedRangeChange,
  relativeMode = false,
  onRelativeModeChange,
  hasCraftPosition = false,
}: ElevationLegendProps) {
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const displayMin = autoRange ? minElevation : fixedRange.min;
  const displayMax = autoRange ? maxElevation : fixedRange.max;
  const mid = (displayMin + displayMax) / 2;

  return (
    <div className="bg-surface-overlay backdrop-blur-sm rounded px-2 py-2 text-[10px] text-content select-none">
      {/* Header */}
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-content-secondary font-medium">{relativeMode ? 'REL' : 'AMSL'}</span>
        <div className="ml-auto flex items-center gap-1">
          {onRelativeModeChange && (
            <button
              onClick={() => onRelativeModeChange(!relativeMode)}
              disabled={!hasCraftPosition}
              className={`px-1.5 py-px rounded text-[9px] font-medium transition-colors ${
                relativeMode
                  ? 'bg-emerald-500/25 text-emerald-400'
                  : hasCraftPosition
                    ? 'bg-surface-raised text-content-secondary hover:text-content'
                    : 'bg-surface-raised text-content-tertiary cursor-not-allowed'
              }`}
              title={hasCraftPosition ? 'Show height relative to craft' : 'No craft position available'}
            >
              Rel
            </button>
          )}
          <button
            onClick={() => onAutoRangeChange(!autoRange)}
            className={`px-1.5 py-px rounded text-[9px] font-medium transition-colors ${
              autoRange
                ? 'bg-blue-500/25 text-blue-400'
                : 'bg-surface-raised text-content-secondary hover:text-content'
            }`}
          >
            Auto
          </button>
        </div>
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
              valueMeters={fixedRange.max}
              onChange={(v) => onFixedRangeChange({ ...fixedRange, max: v })}
              clampMinMeters={fixedRange.min + 1}
              clampMaxMeters={9000}
              altitudeUnit={altitudeUnit}
            />
          ) : (
            <span className="font-mono text-content leading-none">{formatAltitudeFromMeters(displayMax, altitudeUnit)}</span>
          )}

          <span className="font-mono text-content-secondary leading-none">{formatAltitudeFromMeters(mid, altitudeUnit)}</span>

          {!autoRange ? (
            <EditableValue
              valueMeters={fixedRange.min}
              onChange={(v) => onFixedRangeChange({ ...fixedRange, min: v })}
              clampMinMeters={0}
              clampMaxMeters={fixedRange.max - 1}
              altitudeUnit={altitudeUnit}
            />
          ) : (
            <span className="font-mono text-content leading-none">{formatAltitudeFromMeters(displayMin, altitudeUnit)}</span>
          )}
        </div>
      </div>
    </div>
  );
}
