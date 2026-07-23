/**
 * Mode annunciator - the always-visible, honest readout of the vehicle's flight
 * mode, and the button that opens the mode picker. Drives the four states from
 * useModeRequest (active / requesting / rejected) with a cockpit-FMA colour
 * language: green = engaged (heartbeat-confirmed), amber = requested (awaiting
 * the vehicle), red = rejected / timed out. A brief emerald ring flashes the
 * moment a request becomes real.
 */

import { memo, useEffect, useRef, useState } from 'react';
import type { ModePhase } from '../../../hooks/useModeRequest';

function Countdown({ ms }: { ms: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.transition = 'none';
    el.style.transform = 'scaleX(1)';
    // force reflow so the transition restarts
    void el.offsetWidth;
    el.style.transition = `transform ${ms}ms linear`;
    el.style.transform = 'scaleX(0)';
  }, [ms]);
  return (
    <div className="mt-2 h-[3px] rounded-full bg-surface-raised overflow-hidden">
      <div ref={ref} className="h-full w-full origin-left" style={{ background: 'var(--status-warn)' }} />
    </div>
  );
}

export interface ModeAnnunciatorProps {
  phase: ModePhase;
  currentName: string;
  currentSubline: string;
  requestedName?: string;
  rejectLabel: string;
  justConfirmed: boolean;
  open: boolean;
  onToggle: () => void;
  watchdogMs?: number;
  /** Compact single-line pill for the horizontal command bar (drops the subline
   *  + countdown so it sits at the same height as every other control). */
  compact?: boolean;
}

function ModeAnnunciatorImpl({
  phase,
  currentName,
  currentSubline,
  requestedName,
  rejectLabel,
  justConfirmed,
  open,
  onToggle,
  watchdogMs = 3000,
  compact = false,
}: ModeAnnunciatorProps) {
  // Suppress the confirm-ring on first paint so it only fires on real transitions.
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  // Theme-aware status colour for this phase (var flips in light/dark).
  const statusVar =
    phase === 'requesting' ? 'warn'
    : phase === 'rejected' ? 'danger'
    : 'success';
  const dotAnim = phase === 'requesting' ? 'animate-pulse' : '';
  const badgeText =
    phase === 'requesting' ? 'Requesting…'
    : phase === 'rejected' ? rejectLabel
    : 'Engaged';
  const modeText = phase === 'requesting' && requestedName ? requestedName : currentName;
  const modeCls = phase === 'requesting' ? 'text-content-secondary' : 'text-content';

  if (compact) {
    return (
      <button
        onClick={onToggle}
        aria-expanded={open}
        data-tip="Change flight mode"
        style={mounted && justConfirmed ? { boxShadow: `0 0 0 2px var(--status-success)` } : undefined}
        className={`h-full w-full flex items-center gap-2 rounded-lg border ${phase === 'active' ? 'border-subtle' : ''} bg-surface hover:border-default px-3 transition-all`}
      >
        <span className={`w-2 h-2 rounded-full shrink-0 ${dotAnim}`} style={{ background: `var(--status-${statusVar})` }} />
        <span className={`text-sm font-bold font-mono tracking-wide truncate ${modeCls}`}>
          {(modeText || 'Unknown').toUpperCase()}
        </span>
        <span
          className="ml-auto shrink-0 text-[9px] font-bold font-mono uppercase tracking-[0.12em] px-2 py-[3px] rounded-full"
          style={{ color: `var(--status-${statusVar}-fg)`, background: `var(--status-${statusVar}-bg)` }}
        >
          {badgeText}
        </span>
        <span className="text-content-tertiary text-xs font-mono shrink-0">{open ? '▴' : '▾'}</span>
      </button>
    );
  }

  return (
    <button
      onClick={onToggle}
      aria-expanded={open}
      data-tip="Change flight mode"
      style={mounted && justConfirmed ? { boxShadow: `0 0 0 2px var(--status-success)` } : undefined}
      className={`w-full text-left rounded-lg border ${phase === 'active' ? 'border-subtle' : ''} bg-surface hover:border-default px-3 py-2 transition-all`}
    >
      <div className="flex items-center gap-2.5">
        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotAnim}`} style={{ background: `var(--status-${statusVar})` }} />
        <span className={`text-lg font-bold font-mono tracking-wide truncate ${modeCls}`}>
          {(modeText || 'Unknown').toUpperCase()}
        </span>
        <span
          className="ml-auto text-[9px] font-bold font-mono uppercase tracking-[0.13em] px-2 py-[3px] rounded-full"
          style={{ color: `var(--status-${statusVar}-fg)`, background: `var(--status-${statusVar}-bg)` }}
        >
          {badgeText}
        </span>
        <span className="text-content-tertiary text-xs font-mono shrink-0">{open ? '▴' : '▾'}</span>
      </div>

      <div className="mt-1 text-[11px] font-mono text-content-secondary min-h-[15px]">
        {phase === 'requesting' ? (
          <>
            still <span className="text-content font-semibold">{currentName.toUpperCase()}</span>
            <span style={{ color: 'var(--status-warn)' }}> → </span>
            {(requestedName || '').toUpperCase()}
          </>
        ) : phase === 'rejected' ? (
          <><span className="font-semibold" style={{ color: 'var(--status-danger-fg)' }}>{rejectLabel}</span> · still {currentName.toUpperCase()}</>
        ) : (
          currentSubline
        )}
      </div>

      {phase === 'requesting' && <Countdown ms={watchdogMs} />}
    </button>
  );
}

export const ModeAnnunciator = memo(ModeAnnunciatorImpl);
