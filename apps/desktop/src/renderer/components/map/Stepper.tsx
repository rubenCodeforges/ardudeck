import { useCallback, useState } from 'react';

/** Minus / editable value+unit / plus. Full-width so every row's control has
 *  identical geometry; the unit lives inside the field, nothing dangles. */
export function Stepper({ value, onChange, min, max, step, unit, autoFocus, showInfinityAtZero }: {
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  autoFocus?: boolean;
  showInfinityAtZero?: boolean;
}) {
  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Number(n.toFixed(3)))), [min, max]);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');

  const commitDraft = () => {
    setEditing(false);
    const n = Number(draft);
    if (Number.isFinite(n)) onChange(clamp(n));
  };

  return (
    <div className="flex h-7 items-stretch overflow-hidden rounded-lg border border-subtle bg-surface-input">
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(value - step))}
        className="w-8 flex-none text-sm leading-none text-content-secondary hover:bg-surface-raised hover:text-content"
      >
        −
      </button>
      <div className="flex min-w-0 flex-1 items-baseline justify-center gap-1 self-center">
        {showInfinityAtZero && value === 0 && !editing ? (
          <button
            type="button"
            onClick={() => { setEditing(true); setDraft('0'); }}
            className="font-mono text-xs text-content"
          >
            ∞
          </button>
        ) : (
          <input
            type="number"
            value={editing ? draft : String(value)}
            onFocus={(e) => { setEditing(true); setDraft(String(value)); e.currentTarget.select(); }}
            onChange={(e) => {
              setDraft(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(n));
            }}
            onBlur={commitDraft}
            autoFocus={autoFocus}
            className="w-12 min-w-0 bg-transparent text-center font-mono text-xs text-content focus:outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          />
        )}
        {unit && <span className="truncate text-[9.5px] text-content-tertiary">{unit}</span>}
      </div>
      <button
        type="button"
        tabIndex={-1}
        onClick={() => onChange(clamp(value + step))}
        className="w-8 flex-none text-sm leading-none text-content-secondary hover:bg-surface-raised hover:text-content"
      >
        +
      </button>
    </div>
  );
}
