import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../../stores/parameter-store';

// One write in flight per parameter, newest value queued: a held key never replays a backlog.
export function useLiveParamWriter(): (paramId: string, value: number) => void {
  const writeImmediate = useParameterStore((s) => s.setParameterImmediate);
  const slots = useRef(new Map<string, { inFlight: boolean; pending: number | null }>());

  return useCallback(
    (paramId: string, value: number) => {
      let slot = slots.current.get(paramId);
      if (!slot) {
        slot = { inFlight: false, pending: null };
        slots.current.set(paramId, slot);
      }
      const s = slot;
      if (s.inFlight) {
        s.pending = value;
        return;
      }
      const run = (v: number): void => {
        s.inFlight = true;
        void writeImmediate(paramId, v).finally(() => {
          s.inFlight = false;
          const next = s.pending;
          s.pending = null;
          if (next !== null && next !== v) run(next);
        });
      };
      run(value);
    },
    [writeImmediate]
  );
}

interface LivePwmInputProps {
  value: number;
  min: number;
  max: number;
  disabled?: boolean;
  onWrite: (value: number) => void;
  className: string;
}

export const LivePwmInput: React.FC<LivePwmInputProps> = ({ value, min, max, disabled, onWrite, className }) => {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(String(value));
  const draftRef = useRef(draft);
  draftRef.current = draft;
  const focused = useRef(false);
  const atFocus = useRef(value);
  const inputRef = useRef<HTMLInputElement>(null);

  // While focused, echoes of our own writes must not overwrite a newer step.
  useEffect(() => {
    if (!focused.current) setDraft(String(value));
  }, [value]);

  const clamp = useCallback((n: number) => Math.min(max, Math.max(min, Math.round(n))), [min, max]);

  const send = useCallback(
    (n: number) => {
      draftRef.current = String(n);
      setDraft(String(n));
      if (n !== value) onWrite(n);
    },
    [value, onWrite]
  );

  const step = useCallback(
    (delta: number) => {
      const cur = Number(draftRef.current);
      send(clamp((Number.isFinite(cur) ? cur : value) + delta));
    },
    [clamp, send, value]
  );

  // React's onWheel is passive and cannot stop the page scrolling.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent): void => {
      if (!focused.current || el.disabled || e.deltaY === 0) return;
      e.preventDefault();
      step((e.deltaY < 0 ? 1 : -1) * (e.shiftKey ? 10 : 1));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [step]);

  const commitTyped = useCallback(() => {
    const n = Number(draftRef.current);
    if (draftRef.current.trim() === '' || !Number.isFinite(n)) {
      setDraft(String(value));
      return;
    }
    send(clamp(n));
  }, [clamp, send, value]);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        step((e.key === 'ArrowUp' ? 1 : -1) * (e.shiftKey ? 10 : 1));
      } else if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        send(atFocus.current);
        e.currentTarget.blur();
      }
    },
    [step, send]
  );

  return (
    <input
      ref={inputRef}
      type="number"
      value={draft}
      disabled={disabled}
      data-tip={t('mavlink-config:servoRow.liveNudgeTip')}
      onFocus={() => {
        focused.current = true;
        atFocus.current = value;
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        commitTyped();
        focused.current = false;
      }}
      onKeyDown={onKeyDown}
      className={className}
    />
  );
};
