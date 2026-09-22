/**
 * A number field you can actually type in.
 *
 * Binding an <input type="number"> straight to a number and rejecting any
 * keystroke that is not already a valid value makes the field impossible to
 * clear: select-all, delete, and React puts the old number straight back. The
 * same goes for typing "12" when the minimum is 5, since "1" is rejected on
 * the way.
 *
 * So the input owns a draft string while it has focus, and the number is only
 * committed on blur or Enter. Escape restores the last committed value. An
 * empty or out-of-range draft reverts on blur rather than writing a guess.
 */

import { useEffect, useRef, useState } from 'react';

export interface DraftNumberFieldProps {
  value: number;
  onCommit: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  /** Also commit while typing, for a field wired to a live preview. */
  live?: boolean;
  className?: string;
  'aria-label'?: string;
  disabled?: boolean;
}

/** Accepts a comma decimal separator, which half of Europe types. */
export function parseDecimal(text: string): number {
  return Number(text.replace(',', '.'));
}

export function isInRange(value: number, min?: number, max?: number): boolean {
  return Number.isFinite(value)
    && (min === undefined || value >= min)
    && (max === undefined || value <= max);
}

/**
 * What to do with a draft when the field is left. `null` means put the last
 * committed value back: an empty box or an out-of-range entry is not a value
 * to guess at.
 */
export function resolveDraft(draft: string, min?: number, max?: number): number | null {
  if (draft.trim() === '') return null;
  const parsed = parseDecimal(draft);
  return isInRange(parsed, min, max) ? parsed : null;
}

export function DraftNumberField({
  value,
  onCommit,
  min,
  max,
  step,
  live = false,
  className,
  disabled,
  'aria-label': ariaLabel,
}: DraftNumberFieldProps) {
  const [draft, setDraft] = useState(() => String(value));
  const [focused, setFocused] = useState(false);
  const cancelledRef = useRef(false);

  // Follow the value while the field is not being typed in, so a slider drag
  // or a regenerate shows through without fighting the keyboard.
  useEffect(() => {
    if (!focused) setDraft(String(value));
  }, [value, focused]);

  return (
    <input
      type="text"
      inputMode="decimal"
      value={draft}
      disabled={disabled}
      aria-label={ariaLabel}
      onFocus={(e) => { setFocused(true); e.currentTarget.select(); }}
      onChange={(e) => {
        const next = e.target.value;
        setDraft(next);
        if (!live || next.trim() === '') return;
        const parsed = parseDecimal(next);
        if (isInRange(parsed, min, max) && parsed !== value) onCommit(parsed);
      }}
      onBlur={() => {
        setFocused(false);
        if (cancelledRef.current) {
          cancelledRef.current = false;
          setDraft(String(value));
          return;
        }
        const resolved = resolveDraft(draft, min, max);
        if (resolved === null) {
          setDraft(String(value));
          return;
        }
        if (resolved !== value) onCommit(resolved);
        setDraft(String(resolved));
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        else if (e.key === 'Escape') {
          cancelledRef.current = true;
          e.currentTarget.blur();
        }
      }}
      step={step}
      className={className}
    />
  );
}
