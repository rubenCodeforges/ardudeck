/**
 * Compact pre-flight validation strip for the waypoint panel. Shows a green
 * "all clear" or an expandable list of errors/warnings from validateMission.
 */
import { useState } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle2, ChevronRight } from 'lucide-react';
import type { ValidationCheck, ValidationResult } from '../../../shared/mission-validation';

const ACTION_LABELS: Record<NonNullable<ValidationCheck['action']>, string> = {
  'connect-surveys': 'Connect surveys',
};

export function MissionValidationBadge({
  result,
  onAction,
}: {
  result: ValidationResult;
  /** Runs a check's offered fix. Absent, the button is not shown. */
  onAction?: (action: NonNullable<ValidationCheck['action']>) => void;
}) {
  const [open, setOpen] = useState(false);
  const { checks, errorCount, warnCount } = result;

  if (checks.length === 0) {
    return (
      <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-emerald-300">
        <CheckCircle2 className="w-3.5 h-3.5" />
        Pre-flight OK
      </div>
    );
  }

  const tone = errorCount > 0 ? 'text-red-300' : 'text-amber-300';
  // A fix worth offering is worth offering without expanding the list first.
  const actionable = onAction ? checks.filter((c) => c.action) : [];

  return (
    <div className="px-2 py-1">
      <div className="flex items-center gap-2">
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center gap-1.5 text-[11px] ${tone} hover:brightness-110 flex-1 min-w-0`}
      >
        <ChevronRight className={`w-3 h-3 transition-transform ${open ? 'rotate-90' : ''}`} />
        {errorCount > 0 ? <AlertCircle className="w-3.5 h-3.5" /> : <AlertTriangle className="w-3.5 h-3.5" />}
        <span>
          {errorCount > 0 && `${errorCount} error${errorCount === 1 ? '' : 's'}`}
          {errorCount > 0 && warnCount > 0 && ' · '}
          {warnCount > 0 && `${warnCount} warning${warnCount === 1 ? '' : 's'}`}
        </span>
      </button>
      {actionable.map((c) => (
        <button
          key={`fix-${c.id}`}
          onClick={() => onAction!(c.action!)}
          className="shrink-0 px-2 py-0.5 text-[10px] rounded-md bg-purple-600/80 text-white hover:bg-purple-600 transition-colors"
          title={c.message}
        >
          {ACTION_LABELS[c.action!]}
        </button>
      ))}
      </div>
      {open && (
        <ul className="mt-1 ml-4 space-y-0.5">
          {checks.map((c) => (
            <li
              key={c.id}
              className={`flex items-start gap-1.5 text-[10px] ${c.severity === 'error' ? 'text-red-300' : 'text-amber-300'}`}
            >
              {c.severity === 'error' ? (
                <AlertCircle className="w-3 h-3 mt-px shrink-0" />
              ) : (
                <AlertTriangle className="w-3 h-3 mt-px shrink-0" />
              )}
              <span className="text-content-secondary">
                {c.message}
                {c.action && onAction && (
                  <button
                    onClick={() => onAction(c.action!)}
                    className="ml-1.5 px-1.5 py-px rounded bg-purple-600/80 text-white hover:bg-purple-600 transition-colors"
                  >
                    {ACTION_LABELS[c.action]}
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
