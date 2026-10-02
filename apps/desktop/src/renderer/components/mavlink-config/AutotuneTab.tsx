// Refuses edits while armed: AUTOTUNE_AXES is read at mode engage, so a mid-air edit tunes the wrong thing.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Wrench, Zap, Lock, CheckCircle2, Circle, Lightbulb, AlertTriangle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';
import {
  AGGR_CHOICES,
  AXES,
  AXIS_ALL,
  aggrMatches,
  autotuneModeNumber,
  axisNames,
  normalizeAxes,
  toggleAxis,
} from './autotune';

const AXIS_CHIP: Record<string, { on: string; off: string }> = {
  'common:roll': {
    on: 'bg-sky-500/15 text-sky-400 border-sky-500/50',
    off: 'bg-surface-raised text-content-secondary border-subtle hover:text-content',
  },
  'common:pitch': {
    on: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/50',
    off: 'bg-surface-raised text-content-secondary border-subtle hover:text-content',
  },
  'common:yaw': {
    on: 'bg-violet-500/15 text-violet-400 border-violet-500/50',
    off: 'bg-surface-raised text-content-secondary border-subtle hover:text-content',
  },
};

interface Props {
  vehicleCategory: 'copter' | 'plane' | 'rover';
}

export const AutotuneTab: React.FC<Props> = ({ vehicleCategory }) => {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const downloadState = useParameterStore((s) => s.downloadState);
  const isLoading = useParameterStore((s) => s.isLoading);
  const fetchParameters = useParameterStore((s) => s.fetchParameters);
  const setParameter = useParameterStore((s) => s.setParameter);
  const armed = useTelemetryStore((s) => s.flight.armed);

  const [pending, setPending] = useState<Map<string, number>>(new Map());
  const [applying, setApplying] = useState(false);

  const hasParameters = downloadState === 'complete' && parameters.size > 0;
  const hasAutotune = parameters.has('AUTOTUNE_AXES');
  const hasAggr = parameters.has('AUTOTUNE_AGGR');

  const value = (id: string): number | undefined => pending.get(id) ?? parameters.get(id)?.value;

  const stage = (id: string, to: number) => {
    const current = parameters.get(id)?.value;
    if (current === undefined) return;
    setPending((prev) => {
      const next = new Map(prev);
      const same = id === 'AUTOTUNE_AGGR' ? aggrMatches(current, to) : Math.round(current) === Math.round(to);
      if (same) next.delete(id);
      else next.set(id, to);
      return next;
    });
  };

  const apply = async () => {
    setApplying(true);
    try {
      for (const [id, v] of pending) await setParameter(id, v);
      setPending(new Map());
    } finally {
      setApplying(false);
    }
  };

  const axes = normalizeAxes(value('AUTOTUNE_AXES'));
  const aggr = value('AUTOTUNE_AGGR');
  const axesStaged = pending.has('AUTOTUNE_AXES');
  const aggrStaged = pending.has('AUTOTUNE_AGGR');
  const modeNum = autotuneModeNumber(vehicleCategory);

  if (hasParameters && !hasAutotune) {
    return (
      <div className="p-6">
        <div className="bg-surface rounded-xl border border-subtle p-8 text-center">
          <Wrench className="w-8 h-8 mx-auto mb-3 text-content-secondary" />
          <p className="text-content font-medium">{t('mavlink-config:autotuneTab.noAutotune')}</p>
          <p className="text-sm text-content-secondary mt-1">
            {t('mavlink-config:autotuneTab.noAutotuneBody')}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center">
              <Lightbulb className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <p className="text-amber-300 font-medium">
                {downloadState === 'failed' ? t('mavlink-config:autotuneTab.downloadFailed') : t('mavlink-config:autotuneTab.notLoaded')}
              </p>
              <p className="text-xs text-content-secondary">
                {downloadState === 'failed'
                  ? t('mavlink-config:autotuneTab.downloadFailedBody')
                  : t('mavlink-config:autotuneTab.notLoadedBody')}
              </p>
            </div>
          </div>
          <button
            onClick={() => fetchParameters({ force: true })}
            disabled={isLoading}
            className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
          >
            {isLoading ? t('common:loading') : downloadState === 'failed' ? t('common:retry') : t('mavlink-config:autotuneTab.fetchParameters')}
          </button>
        </div>
      )}

      {hasParameters && armed && (
        <div className="bg-surface rounded-xl border border-subtle p-8 text-center">
          <Lock className="w-8 h-8 mx-auto mb-3 text-amber-400" />
          <p className="text-content font-medium">{t('mavlink-config:autotuneTab.disarmTitle')}</p>
          <p className="text-sm text-content-secondary mt-1 max-w-md mx-auto">
            {t('mavlink-config:autotuneTab.disarmBody')}
          </p>
        </div>
      )}

      {hasParameters && !armed && hasAutotune && (
        <>
          <div className="bg-surface rounded-xl border border-subtle p-5">
            <div className="flex items-center gap-3 mb-1">
              <div className="w-10 h-10 rounded-lg bg-orange-500/20 flex items-center justify-center">
                <Wrench className="w-5 h-5 text-orange-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-content">{t('mavlink-config:autotuneTab.axesTitle')}</h3>
                <p className="text-sm text-content-secondary">
                  {t('mavlink-config:autotuneTab.axesBody')}
                </p>
              </div>
            </div>

            <div
              className={`mt-4 flex gap-2 rounded-lg ${axesStaged ? 'ring-1 ring-amber-500/60 p-2 -m-2' : ''}`}
            >
              {AXES.map(({ bit, nameKey }) => {
                const name = t(nameKey);
                const on = (axes & bit) !== 0;
                const c = AXIS_CHIP[nameKey]!;
                return (
                  <button
                    key={nameKey}
                    onClick={() => stage('AUTOTUNE_AXES', toggleAxis(axes, bit))}
                    data-tip={on ? t('mavlink-config:autotuneTab.skipAxis', { axis: name.toLowerCase() }) : t('mavlink-config:autotuneTab.tuneAxis', { axis: name.toLowerCase() })}
                    className={`flex-1 py-2.5 rounded-lg border text-sm font-semibold transition-colors ${on ? c.on : c.off}`}
                  >
                    {name}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-sm text-content-secondary">{t('mavlink-config:autotuneTab.tuning', { axes: axisNames(axes) })}</p>
              {axes !== AXIS_ALL && (
                <button
                  onClick={() => stage('AUTOTUNE_AXES', AXIS_ALL)}
                  className="text-sm text-teal-400 hover:underline"
                >
                  {t('mavlink-config:autotuneTab.selectAllThree')}
                </button>
              )}
            </div>
          </div>

          {hasAggr && (
            <div className="bg-surface rounded-xl border border-subtle p-5">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-500/20 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-400" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-content">{t('mavlink-config:autotuneTab.howHard')}</h3>
                  <p className="text-sm text-content-secondary">
                    {t('mavlink-config:autotuneTab.howHardBody')}
                  </p>
                </div>
              </div>

              <div className={`space-y-2 rounded-lg ${aggrStaged ? 'ring-1 ring-amber-500/60 p-2 -m-2' : ''}`}>
                {AGGR_CHOICES.map((choice) => {
                  const selected = aggrMatches(aggr, choice.value);
                  return (
                    <button
                      key={choice.titleKey}
                      onClick={() => stage('AUTOTUNE_AGGR', choice.value)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                        selected
                          ? 'bg-emerald-500/10 border-emerald-500/50'
                          : 'bg-surface-raised border-subtle hover:border-strong'
                      }`}
                    >
                      {selected ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
                      ) : (
                        <Circle className="w-4 h-4 shrink-0 text-content-secondary" />
                      )}
                      <div>
                        <p className="text-sm font-medium text-content">{t(choice.titleKey)}</p>
                        <p className="text-xs text-content-secondary">{t(choice.blurbKey)}</p>
                      </div>
                      <span className="ml-auto text-xs tabular-nums text-content-secondary">
                        {choice.value}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="bg-surface rounded-xl border border-subtle p-5">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-content">{t('mavlink-config:autotuneTab.howToStart')}</h3>
                <p className="text-sm text-content-secondary">
                  {modeNum === null
                    ? t('mavlink-config:autotuneTab.startNoMode')
                    : t('mavlink-config:autotuneTab.startWithMode', { mode: modeNum })}
                </p>
              </div>
            </div>
            <p className="text-sm text-content-secondary">
              {t('mavlink-config:autotuneTab.switchHint')}
            </p>
            <div className="mt-4 flex items-start gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <p className="text-sm text-amber-300">
                {t('mavlink-config:autotuneTab.calmAir')}
              </p>
            </div>
          </div>

          {pending.size > 0 && (
            <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <Zap className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="flex-1 text-sm text-amber-300">
                {t('mavlink-config:autotuneTab.staged', { count: pending.size })}
              </span>
              <button
                onClick={() => setPending(new Map())}
                className="px-3 py-1.5 rounded-lg text-sm text-content-secondary hover:text-content transition-colors"
              >
                {t('mavlink-config:autotuneTab.discard')}
              </button>
              <button
                onClick={apply}
                disabled={applying}
                className="px-4 py-1.5 rounded-lg text-sm font-medium bg-amber-600 hover:bg-amber-500 text-white transition-colors disabled:opacity-50"
              >
                {applying ? t('common:writing') : t('common:apply')}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default AutotuneTab;
