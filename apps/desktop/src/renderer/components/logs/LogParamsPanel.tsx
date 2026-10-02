import { useMemo, useState } from 'react';
import { useLogStore } from '../../stores/log-store';
import { extractLogParams, isNonDefault, fmtParamValue } from './log-params';
import { fmtEventTime } from './log-events';
import { publishTimeJump } from './log-hover-bus';
import { useTranslation } from 'react-i18next';

type Filter = 'all' | 'changed' | 'nondefault';

/**
 * The parameter table embedded in the log (PARM records): what the vehicle
 * was ACTUALLY configured as during this exact flight - independent of what
 * is on the FC now. In-flight changes (GCS/AutoTune/scripts writing params
 * mid-air) are flagged loudly with click-to-jump change times.
 */
export function LogParamsPanel() {
  const { t } = useTranslation();
  const currentLog = useLogStore((s) => s.currentLog);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const params = useMemo(() => (currentLog ? extractLogParams(currentLog) : []), [currentLog]);
  const changedCount = useMemo(() => params.filter((p) => p.changes.length > 0).length, [params]);
  const hasDefaults = useMemo(() => params.some((p) => p.default !== undefined), [params]);
  const nonDefaultCount = useMemo(() => (hasDefaults ? params.filter(isNonDefault).length : 0), [params, hasDefaults]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return params.filter((p) => {
      if (filter === 'changed' && p.changes.length === 0) return false;
      if (filter === 'nondefault' && !isNonDefault(p)) return false;
      if (q && !p.name.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [params, search, filter]);

  const jumpTo = (timeS: number) => {
    if (!currentLog) return;
    const startS = currentLog.timeRange.startUs / 1_000_000;
    const endS = currentLog.timeRange.endUs / 1_000_000;
    publishTimeJump({ min: Math.max(timeS - 5, startS), max: Math.min(timeS + 5, endS) });
  };

  const toggleExpanded = (name: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
  };

  if (!currentLog) {
    return <div className="h-full flex items-center justify-center text-content-tertiary text-xs">{t('logs:noLogLoaded')}</div>;
  }
  if (params.length === 0) {
    return <div className="h-full flex items-center justify-center text-content-tertiary text-xs">{t('logs:params.noParm')}</div>;
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex-shrink-0 px-3 pt-2 pb-1.5 border-b border-subtle space-y-1.5">
        <div className="flex items-center gap-1.5 flex-wrap">
          {([
            ['all', t('logs:params.filterAll', { n: params.length })],
            ['changed', t('logs:params.filterChanged', { n: changedCount })],
            ...(hasDefaults ? [['nondefault', t('logs:params.filterNonDefault', { n: nonDefaultCount })] as [Filter, string]] : []),
          ] as [Filter, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`text-[10px] px-2 py-0.5 rounded border transition-colors ${
                filter === key
                  ? key === 'changed'
                    ? 'bg-amber-500/15 text-amber-500 border-amber-500/30'
                    : 'bg-blue-500/15 text-blue-400 border-blue-500/30'
                  : 'bg-surface text-content-tertiary border-subtle hover:text-content-secondary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={t('logs:params.filter')}
          className="w-full text-[11px] px-2 py-1 rounded bg-input text-content border border-subtle placeholder:text-content-tertiary focus:outline-none focus:border-blue-500/50 font-mono"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 && (
          <div className="text-center text-content-tertiary text-[11px] py-6">{t('logs:params.noMatch')}</div>
        )}
        {filtered.map((p) => {
          const changed = p.changes.length > 0;
          const nonDef = isNonDefault(p);
          const isOpen = expanded.has(p.name);
          return (
            <div key={p.name} className="border-b border-subtle/40">
              <button
                onClick={() => changed && toggleExpanded(p.name)}
                className={`w-full flex items-center gap-2 px-3 py-1 text-left transition-colors ${changed ? 'hover:bg-amber-500/5 cursor-pointer' : 'cursor-default'}`}
              >
                <span className="text-[11px] font-mono text-content-secondary truncate min-w-0 flex-1">{p.name}</span>
                {nonDef && (
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-blue-400 shrink-0"
                    data-tip={t('logs:params.differsFromDefault', { value: fmtParamValue(p.default!) })}
                  />
                )}
                {changed && (
                  <span className="text-[9px] px-1.5 py-px rounded bg-amber-500/15 text-amber-500 shrink-0 font-medium">
                    {t('logs:params.changes', { count: p.changes.length })}
                  </span>
                )}
                <span className={`text-[11px] font-mono tabular-nums shrink-0 ${changed ? 'text-amber-500 font-medium' : 'text-content'}`}>
                  {fmtParamValue(p.last)}
                </span>
              </button>
              {isOpen && changed && (
                <div className="px-3 pb-1.5 pl-8 space-y-0.5">
                  <div className="text-[10px] text-content-tertiary font-mono">{t('logs:params.start', { value: fmtParamValue(p.first) })}</div>
                  {p.changes.map((c, i) => (
                    <button
                      key={i}
                      onClick={() => jumpTo(c.timeS)}
                      className="flex items-center gap-2 text-[10px] font-mono text-content-secondary hover:text-blue-400 transition-colors"
                      data-tip={t('logs:params.jumpTip')}
                    >
                      <span className="tabular-nums text-content-tertiary">{fmtEventTime(c.timeS)}</span>
                      <span>-&gt; {fmtParamValue(c.value)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
