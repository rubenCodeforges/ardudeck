/**
 * ServoOutputTab — ArduPilot servo output configuration.
 *
 * 16 (or 32) rows mirroring Mission Planner's Servo Output screen:
 *   [#] [ Live position bar ] [Reverse] [Function] [Min] [Trim] [Max]
 *
 * Reads live PWM from telemetryStore.servoOutput (SERVO_OUTPUT_RAW).
 * Reads/writes SERVOn_FUNCTION, SERVOn_REVERSED, SERVOn_MIN, SERVOn_TRIM,
 * SERVOn_MAX via the parameter store. Function dropdown options come from
 * parameter metadata XML (ParameterMetadata.values).
 */

import React, { useMemo, useState } from 'react';
import { Move, Lightbulb, AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { useConnectionStore } from '../../../stores/connection-store';
import { ServoRow } from './ServoRow';
import { StickTestPanel } from './StickTestPanel';
import Px4ServoOutput from './Px4ServoOutput';
import OutputCards from './OutputCards';

const PWM_MIN = 800;
const PWM_MAX = 2200;

const ServoOutputTab: React.FC = () => {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const getParameterMetadata = useParameterStore((s) => s.getParameterMetadata);
  const paramsLoaded = useParameterStore((s) => s.downloadState === 'complete');
  const metadata = useParameterStore((s) => s.metadata);
  const setParameter = useParameterStore((s) => s.setParameter);
  const servoOutput = useTelemetryStore((s) => s.servoOutput);
  const lastServoOutput = useTelemetryStore((s) => s.lastServoOutput);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const [view, setView] = useState<'cards' | 'table'>('cards');

  // A completed download, not just whatever parameters happen to be present.
  const hasParameters = paramsLoaded && parameters.size > 0;

  // Two outputs on one function is legitimate (twin ESCs, paired flaps) and
  // also a classic mis-set: the second one silently shadows the first.
  const duplicateFunctions = useMemo(() => {
    const byFunction = new Map<number, number[]>();
    for (let ch = 1; ch <= 16; ch++) {
      const fn = parameters.get(`SERVO${ch}_FUNCTION`)?.value as number | undefined;
      if (fn === undefined || fn === 0 || fn === 1) continue; // disabled and RC passthrough
      byFunction.set(fn, [...(byFunction.get(fn) ?? []), ch]);
    }
    return [...byFunction.entries()]
      .filter(([, channels]) => channels.length > 1)
      .map(([fn, channels]) => ({
        fn,
        channels,
        label: (getParameterMetadata('SERVO1_FUNCTION')?.values?.[fn]) ?? t('mavlink-config:outputCards.functionFallback', { fn }),
      }));
  }, [parameters, getParameterMetadata, t]);

  // 32 channels if SERVO_32_ENABLE param is present and truthy, else 16.
  const channelCount = useMemo(() => {
    const v = parameters.get('SERVO_32_ENABLE')?.value;
    return v !== undefined && v > 0 ? 32 : 16;
  }, [parameters]);

  // Function dropdown options from parameter metadata (shared across all SERVOn_FUNCTION)
  const functionOptions = useMemo(() => {
    const meta = metadata?.['SERVO1_FUNCTION'];
    if (!meta?.values) return null;
    return Object.entries(meta.values)
      .map(([val, label]) => ({ value: Number(val), label }))
      .sort((a, b) => a.value - b.value);
  }, [metadata]);

  const hasLiveOutput = lastServoOutput > 0 && Date.now() - lastServoOutput < 3000;

  if (firmware === 'px4') {
    return (
      <Px4ServoOutput
        parameters={parameters}
        metadata={metadata}
        setParameter={setParameter}
        servoOutputs={servoOutput?.outputs}
        hasLiveOutput={hasLiveOutput}
      />
    );
  }

  return (
    <div className="p-6 space-y-4">
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-300 font-medium">{t('mavlink-config:servoOutputTab.paramsNotLoaded')}</p>
            <p className="text-sm text-amber-400/80">{t('mavlink-config:servoOutputTab.connectToEdit')}</p>
          </div>
        </div>
      )}

      {duplicateFunctions.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 w-5 h-5 shrink-0 text-amber-400" />
            <div className="text-sm">
              <p className="font-medium text-amber-300">
                {t('mavlink-config:servoOutputTab.duplicateTitle')}
              </p>
              <ul className="mt-1 space-y-0.5 text-xs text-amber-200/90">
                {duplicateFunctions.map((d) => (
                  <li key={d.fn}>
                    {t('mavlink-config:servoOutputTab.duplicateItem', { label: d.label, channels: d.channels.join(t('mavlink-config:servoOutputTab.and')) })}
                  </li>
                ))}
              </ul>
              <p className="mt-1.5 text-xs text-amber-200/80">
                {t('mavlink-config:servoOutputTab.duplicateHint')}
              </p>
            </div>
          </div>
        </div>
      )}

      {hasParameters && <StickTestPanel />}

      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
            <Move className="w-5 h-5 text-pink-400" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-content">{t('mavlink-config:servoOutputTab.title')}</h3>
            <p className="text-sm text-content-secondary">
              {t('mavlink-config:servoOutputTab.subtitle')}
              {!hasLiveOutput && hasParameters && (
                <span className="ml-2 text-content-tertiary">{t('mavlink-config:servoOutputTab.noLiveTelemetry')}</span>
              )}
            </p>
          </div>
          <div className="ml-auto flex rounded-lg border border-subtle overflow-hidden text-xs">
            {([
              { id: 'cards', label: t('mavlink-config:servoOutputTab.viewInUse'), title: t('mavlink-config:servoOutputTab.viewInUseTitle') },
              { id: 'table', label: t('mavlink-config:servoOutputTab.viewAll'), title: t('mavlink-config:servoOutputTab.viewAllTitle') },
            ] as const).map((v) => (
              <button
                key={v.id}
                onClick={() => setView(v.id)}
                title={v.title}
                className={`px-3 py-1.5 transition-colors ${
                  view === v.id
                    ? 'bg-surface-overlay text-content'
                    : 'bg-surface-raised text-content-secondary hover:text-content'
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>
        </div>

        {view === 'cards' && (
          <OutputCards
            channelCount={channelCount}
            functionOptions={functionOptions}
            onAssignOutputs={() => setView('table')}
          />
        )}

        <div className={`rounded-lg border border-subtle overflow-hidden ${view === 'cards' ? 'hidden' : ''}`}>
          <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_70px_70px_70px_180px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary bg-surface-raised/40 border-b border-subtle">
            <div className="text-center">#</div>
            <div>{t('common:position')}</div>
            <div className="text-center">{t('common:reverse')}</div>
            <div>{t('mavlink-config:servoOutputTab.colFunction')}</div>
            <div className="text-center">{t('mavlink-config:servoRow.testMin')}</div>
            <div className="text-center">{t('mavlink-config:servoRow.testTrim')}</div>
            <div className="text-center">{t('mavlink-config:servoRow.testMax')}</div>
            <div className="text-center">{t('mavlink-config:servoOutputTab.colTest')}</div>
          </div>
          <div className="divide-y divide-subtle/60">
            {Array.from({ length: channelCount }, (_, i) => i + 1).map((ch) => (
              <ServoRow
                key={ch}
                channel={ch}
                parameters={parameters}
                setParameter={setParameter}
                functionOptions={functionOptions}
                livePwm={servoOutput?.outputs[ch - 1]}
                liveStale={!hasLiveOutput}
                pwmMin={PWM_MIN}
                pwmMax={PWM_MAX}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ServoOutputTab;
