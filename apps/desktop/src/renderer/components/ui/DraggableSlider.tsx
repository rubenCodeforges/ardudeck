import { useRef, useCallback, useMemo, useState } from 'react';
import { DraftNumberInput } from '../../hooks/useNumericDraft';

export interface DraggableSliderProps {
  /** Current value */
  value: number;
  /** Called per step during a drag, and on click / +/- / input edit. Stages, never writes. */
  onChange: (value: number) => void;
  /** Minimum value */
  min?: number;
  /** Maximum value */
  max?: number;
  /** Step increment for +/- buttons */
  step?: number;
  /** Slider track color */
  color?: string;
  /** Label text */
  label?: string;
  /** Hint text below label */
  hint?: string;
  /** Show +/- buttons and number input */
  showControls?: boolean;
  /** Slider height in pixels */
  height?: number;
  /** Show thumb handle */
  showThumb?: boolean;
  /** Disabled state - grays out and prevents interaction */
  disabled?: boolean;
  /** Unit label (informational, not rendered by slider) */
  unit?: string;
  /** Custom value formatter */
  formatValue?: (value: number) => string;
}

/** Thumb follows the pointer locally; onChange still fires per step so charts track the drag. */
function useSliderDrag(
  value: number,
  onChange: (v: number) => void,
  calculateValue: (clientX: number) => number,
  disabled = false
) {
  const isDragging = useRef(false);
  const lastSent = useRef<number | null>(null);
  const [dragValue, setDragValue] = useState<number | null>(null);

  const apply = useCallback(
    (v: number) => {
      setDragValue(v);
      if (lastSent.current === v) return;
      lastSent.current = v;
      onChange(v);
    },
    [onChange]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      isDragging.current = true;
      e.currentTarget.setPointerCapture(e.pointerId);
      apply(calculateValue(e.clientX));
    },
    [apply, calculateValue, disabled]
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (disabled || !isDragging.current) return;
      apply(calculateValue(e.clientX));
    },
    [apply, calculateValue, disabled]
  );

  const endDrag = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging.current) return;
    isDragging.current = false;
    if (e.currentTarget.hasPointerCapture?.(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    lastSent.current = null;
    setDragValue(null);
  }, []);

  return {
    displayValue: dragValue ?? value,
    dragHandlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
    },
  };
}

export function DraggableSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  color = '#3B82F6',
  label,
  hint,
  showControls = true,
  height = 12,
  showThumb = true,
  disabled = false,
}: DraggableSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);

  // Muted color for disabled state
  const effectiveColor = disabled ? '#52525b' : color;

  // Round to step precision so 48 + 0.01 doesn't yield 48.00999983...
  // The number of decimals comes from the step itself: step=0.01 → 2 decimals.
  const stepDecimals = useMemo(() => {
    const s = String(step);
    const dot = s.indexOf('.');
    return dot >= 0 ? s.length - dot - 1 : 0;
  }, [step]);

  const roundToStep = useCallback(
    (v: number) => {
      const factor = Math.pow(10, stepDecimals);
      return Math.round(v * factor) / factor;
    },
    [stepDecimals]
  );

  const calculateValue = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const raw = Math.round((ratio * (max - min) + min) / step) * step;
      const newValue = roundToStep(raw);
      return Math.max(min, Math.min(max, newValue));
    },
    [min, max, step, value, roundToStep]
  );

  const { displayValue, dragHandlers } = useSliderDrag(value, onChange, calculateValue, disabled);
  const percentage = Math.max(0, Math.min(100, ((displayValue - min) / (max - min)) * 100));

  const handleIncrement = useCallback(() => {
    if (disabled) return;
    onChange(Math.min(max, roundToStep(value + step)));
  }, [max, onChange, step, value, disabled, roundToStep]);

  const handleDecrement = useCallback(() => {
    if (disabled) return;
    onChange(Math.max(min, roundToStep(value - step)));
  }, [min, onChange, step, value, disabled, roundToStep]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (disabled) return;
      // Accept both '.' and ',' as decimal separators (locale-tolerant).
      const raw = e.target.value.replace(',', '.');
      const parsed = parseFloat(raw);
      const newValue = Number.isFinite(parsed) ? parsed : min;
      onChange(Math.max(min, Math.min(max, newValue)));
    },
    [max, min, onChange, disabled]
  );

  return (
    <div className={disabled ? 'opacity-60' : ''}>
      {/* Label and controls row */}
      {(label || showControls) && (
        <div className="flex items-start justify-between mb-2">
          {label && (
            <div className="min-w-0">
              <span className={`text-sm font-medium ${disabled ? 'text-content-secondary' : 'text-content'}`}>{label}</span>
              {hint && <p className="text-xs text-content-secondary mt-0.5">{hint}</p>}
            </div>
          )}
          {showControls && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleDecrement}
                disabled={disabled}
                className={`w-6 h-6 rounded text-sm flex items-center justify-center ${
                  disabled
                    ? 'bg-surface-raised text-content-tertiary cursor-not-allowed'
                    : 'bg-surface-raised hover:bg-surface text-content-secondary'
                }`}
              >
                -
              </button>
              <input
                type="text"
                inputMode="decimal"
                value={roundToStep(displayValue).toFixed(stepDecimals)}
                onChange={handleInputChange}
                disabled={disabled}
                className={`min-w-[5rem] w-auto px-2 py-1 text-center text-sm border rounded tabular-nums ${
                  disabled
                    ? 'bg-surface-input border-subtle text-content-secondary cursor-not-allowed'
                    : 'bg-surface-input border-border text-content'
                }`}
                style={{ width: `${Math.max(5, roundToStep(displayValue).toFixed(stepDecimals).length + 2)}ch` }}
              />
              <button
                onClick={handleIncrement}
                disabled={disabled}
                className={`w-6 h-6 rounded text-sm flex items-center justify-center ${
                  disabled
                    ? 'bg-surface-raised text-content-tertiary cursor-not-allowed'
                    : 'bg-surface-raised hover:bg-surface text-content-secondary'
                }`}
              >
                +
              </button>
            </div>
          )}
        </div>
      )}

      {/* Slider track */}
      <div
        ref={trackRef}
        className={`relative bg-surface-inset rounded-full touch-none select-none ${
          disabled ? 'cursor-not-allowed' : 'cursor-pointer'
        }`}
        style={{ height }}
        {...dragHandlers}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
          style={{ width: `${percentage}%`, backgroundColor: effectiveColor }}
        />

        {/* Thumb handle */}
        {showThumb && (
          <div
            className={`absolute top-1/2 -translate-y-1/2 rounded-full shadow-lg border-2 pointer-events-none ${
              disabled ? 'bg-content-secondary' : 'bg-white'
            }`}
            style={{
              width: height + 4,
              height: height + 4,
              left: `calc(${percentage}% - ${(height + 4) / 2}px)`,
              borderColor: effectiveColor,
            }}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Compact slider variant for space-constrained UIs
 * Smaller controls, no hint text
 */
export function CompactSlider({
  value,
  onChange,
  min = 0,
  max = 100,
  step = 10,
  color = '#3B82F6',
  label,
}: Omit<DraggableSliderProps, 'hint' | 'showControls' | 'height' | 'showThumb'>) {
  const trackRef = useRef<HTMLDivElement>(null);

  const calculateValue = useCallback(
    (clientX: number): number => {
      if (!trackRef.current) return value;
      const rect = trackRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const ratio = Math.max(0, Math.min(1, x / rect.width));
      const newValue = Math.round((ratio * (max - min) + min) / step) * step;
      return Math.max(min, Math.min(max, newValue));
    },
    [min, max, step, value]
  );

  const { displayValue, dragHandlers } = useSliderDrag(value, onChange, calculateValue);
  const percentage = Math.max(0, Math.min(100, ((displayValue - min) / (max - min)) * 100));

  return (
    <div className="space-y-1">
      {label && (
        <div className="flex items-center justify-between">
          <span className="text-xs text-content-secondary">{label}</span>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange(Math.max(min, value - step))}
              className="w-5 h-5 rounded bg-surface-raised hover:bg-surface text-content-secondary text-xs flex items-center justify-center"
            >
              -
            </button>
            <DraftNumberInput
              min={min}
              max={max}
              integer
              value={displayValue}
              onCommit={onChange}
              className="min-w-[5rem] w-auto px-2 py-0.5 text-center text-sm bg-surface-input border border-border rounded text-content tabular-nums"
              style={{ width: `${Math.max(5, String(displayValue).length + 2)}ch` }}
            />
            <button
              onClick={() => onChange(Math.min(max, value + step))}
              className="w-5 h-5 rounded bg-surface-raised hover:bg-surface text-content-secondary text-xs flex items-center justify-center"
            >
              +
            </button>
          </div>
        </div>
      )}

      {/* Slider track with thumb */}
      <div
        ref={trackRef}
        className="relative h-2 bg-surface-inset rounded-full cursor-pointer touch-none select-none"
        {...dragHandlers}
      >
        {/* Progress fill */}
        <div
          className="absolute left-0 top-0 h-full rounded-full pointer-events-none"
          style={{ width: `${percentage}%`, backgroundColor: color }}
        />

        {/* Thumb handle - slightly larger for visibility */}
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-white shadow-md border-2 pointer-events-none"
          style={{
            left: `calc(${percentage}% - 6px)`,
            borderColor: color,
          }}
        />
      </div>
    </div>
  );
}

export default DraggableSlider;
