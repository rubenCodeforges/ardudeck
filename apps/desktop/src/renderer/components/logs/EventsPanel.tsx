import { useMemo, useState } from 'react';
import { useLogStore } from '../../stores/log-store';
import { extractLogEvents, fmtEventTime, type LogEventKind, type LogEventSeverity } from './log-events';
import { publishTimeJump, publishHoverTime } from './log-hover-bus';
import { useTranslation } from 'react-i18next';

const KIND_FILTERS: { key: LogEventKind; labelKey: string }[] = [
  { key: 'ERR', labelKey: 'logs:events.kindErrors' },
  { key: 'EV', labelKey: 'logs:events.kindEvents' },
  { key: 'MSG', labelKey: 'logs:events.kindMessages' },
  { key: 'MODE', labelKey: 'logs:events.kindModes' },
  { key: 'CMD', labelKey: 'logs:events.kindCommands' },
];

const SEVERITY_DOT: Record<LogEventSeverity, string> = {
  error: 'bg-red-500',
  warn: 'bg-amber-500',
  info: 'bg-gray-500/60',
};

const KIND_BADGE: Record<LogEventKind, string> = {
  ERR: 'text-red-400 bg-red-500/10',
  EV: 'text-blue-400 bg-blue-500/10',
  MSG: 'text-content-secondary bg-surface-raised',
  MODE: 'text-purple-400 bg-purple-500/10',
  CMD: 'text-amber-500 bg-amber-500/10',
};

/**
 * Chronological, severity-graded timeline of everything notable in the log:
 * decoded ERR subsystems, EV events, MSG text, mode changes and mission
 * commands. Every row is clickable - the charts jump to that moment - and
 * hovering a row walks the marker along the flight-path map.
 */
export function EventsPanel() {
  const { t } = useTranslation();
  const currentLog = useLogStore((s) => s.currentLog);
  const [kinds, setKinds] = useState<Set<LogEventKind>>(new Set(KIND_FILTERS.map((k) => k.key)));
  const [search, setSearch] = useState('');
  const [errorsOnly, setErrorsOnly] = useState(false);

  const events = useMemo(() => (currentLog ? extractLogEvents(currentLog) : []), [currentLog]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const e of events) c[e.kind] = (c[e.kind] ?? 0) + 1;
    return c;
  }, [events]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return events.filter((e) => {
      if (!kinds.has(e.kind)) return false;
      if (errorsOnly && e.severity === 'info') return false;
      if (q && !`${e.label} ${e.detail ?? ''}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [events, kinds, search, errorsOnly]);

  const jumpTo = (timeS: number) => {
    if (!currentLog) return;
    const startS = currentLog.timeRange.startUs / 1_000_000;
    const endS = currentLog.timeRange.endUs / 1_000_000;
    // A ±5s window gives enough context to see cause and effect around the event.
    publishTimeJump({ min: Math.max(timeS - 5, startS), max: Math.min(timeS + 5, endS) });
  };

  const toggleKind = (k: LogEventKind) => {
    setKinds((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  };

  if (!currentLog) {
    return <div className="h-full flex items-center justify-center text-content-tertiary text-xs">{t('logs:noLogLoaded')}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 border-b border-subtle space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {KIND_FILTERS.map((k) => (
            <button
              key={k.key}
              onClick={() => toggleKind(k.key)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                kinds.has(k.key)
                  ? 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
              }`}
            >
              {t(k.labelKey)}
              <span className="ml-1 tabular-nums opacity-70">{counts[k.key] ?? 0}</span>
            </button>
          ))}
          <button
            onClick={() => setErrorsOnly(!errorsOnly)}
            className={`text-[10px] px-2 py-0.5 rounded border transition-colors ml-auto ${
              errorsOnly
                ? 'bg-red-500/15 text-red-400 border-red-500/30'
                : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
            }`}
            data-tip={t('logs:events.problemsOnlyTip')}
          >
            {t('logs:events.problemsOnly')}
          </button>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('logs:events.filter')}
          className="w-full text-[11px] px-2 py-1 rounded bg-input text-content border border-subtle placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/50"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-content-tertiary text-[11px] py-6">{t('logs:events.noMatch')}</div>
        )}
        {filtered.map((e, i) => (
          <button
            key={i}
            onClick={() => jumpTo(e.timeS)}
            onMouseEnter={() => publishHoverTime(e.timeS)}
            onMouseLeave={() => publishHoverTime(null)}
            className="w-full text-left flex items-start gap-2 px-3 py-1 hover:bg-blue-500/10 transition-colors group"
            data-tip={t('logs:events.jumpTip')}
          >
            <span className={`w-1.5 h-1.5 rounded-full mt-1.5 shrink-0 ${SEVERITY_DOT[e.severity]}`} />
            <span className="text-[10px] tabular-nums text-content-tertiary mt-0.5 shrink-0 w-12 group-hover:text-blue-400">
              {fmtEventTime(e.timeS)}
            </span>
            <span className={`text-[9px] px-1 py-px rounded mt-0.5 shrink-0 font-medium ${KIND_BADGE[e.kind]}`}>
              {e.kind}
            </span>
            <span className="min-w-0">
              <span className={`text-[11px] leading-tight break-words ${
                e.severity === 'error' ? 'text-red-400 font-medium' : e.severity === 'warn' ? 'text-amber-500' : 'text-content-secondary'
              }`}>
                {e.label}
              </span>
              {e.detail && <span className="text-[10px] text-content-tertiary ml-1.5">{e.detail}</span>}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
