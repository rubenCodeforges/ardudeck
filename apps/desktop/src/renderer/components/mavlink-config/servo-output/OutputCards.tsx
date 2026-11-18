import React, { useMemo, useCallback, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useParameterStore } from '../../../stores/parameter-store';
import { DraggableSlider } from '../../ui/DraggableSlider';
import { LivePwmInput, useLiveParamWriter } from './LivePwmInput';
import { OutputVisual } from './OutputVisual';
import { GimbalRangeDialog, type GimbalRangeTarget } from './GimbalRangeDialog';
import { classifyOutput, isTravelEditable, travelFromEndpoints, type OutputShape } from './output-shape';
import { mountOf, outputUse } from '../switches/aux-control';
import { rcinPassthroughFunction } from '../switches/switch-detect';

const FIRST_AUX_CH = 5;
const LAST_CH = 16;
const isPassthroughFn = (fn: number) => fn >= rcinPassthroughFunction(1) && fn <= rcinPassthroughFunction(16);

const SERVO_TRAVEL_MAX_US = 500;
// ArduPilot documents 800 but accepts lower; some servos (360 degree gimbals) need it
const PWM_FLOOR = 500;
const DOCUMENTED_FLOOR = 800;
const PWM_CEILING = 2200;

interface OutputGroup {
  key: number;
  channels: number[];
  primary: number;
  functionName: string;
  shape: OutputShape;
  confident: boolean;
  min: number;
  trim: number;
  max: number;
  travel: number;
  reversed: boolean;
}

const SHAPE_NOTE_KEY: Record<OutputShape, string> = {
  angular: 'mavlink-config:outputCards.shapeNote.angular',
  bipolar: 'mavlink-config:outputCards.shapeNote.bipolar',
  unidirectional: 'mavlink-config:outputCards.shapeNote.unidirectional',
  discrete: 'mavlink-config:outputCards.shapeNote.discrete',
  motor: 'mavlink-config:outputCards.shapeNote.motor',
};

interface OutputCardsProps {
  channelCount: number;
  functionOptions: Array<{ value: number; label: string }> | null;
  onAssignOutputs: () => void;
}

export const OutputCards: React.FC<OutputCardsProps> = ({
  channelCount,
  functionOptions,
  onAssignOutputs,
}) => {
  const { t } = useTranslation();
  const parameters = useParameterStore((s) => s.parameters);
  const metadata = useParameterStore((s) => s.metadata);
  const setParameter = useParameterStore((s) => s.setParameter);
  const writeLive = useLiveParamWriter();

  const groups = useMemo(() => {
    const byFunction = new Map<number, OutputGroup>();
    const labels = metadata?.['SERVO1_FUNCTION']?.values;

    for (let ch = 1; ch <= channelCount; ch++) {
      const fn = parameters.get(`SERVO${ch}_FUNCTION`)?.value as number | undefined;
      if (fn === undefined || fn === 0) continue;

      const existing = byFunction.get(fn);
      if (existing) {
        existing.channels.push(ch);
        continue;
      }

      const min = parameters.get(`SERVO${ch}_MIN`)?.value;
      const trim = parameters.get(`SERVO${ch}_TRIM`)?.value;
      const max = parameters.get(`SERVO${ch}_MAX`)?.value;
      if (min === undefined || trim === undefined || max === undefined) continue;

      const functionName = labels?.[fn] ?? t('mavlink-config:outputCards.functionFallback', { fn });
      const { shape, confident } = classifyOutput({ functionName, min, trim, max });
      byFunction.set(fn, {
        key: fn,
        channels: [ch],
        primary: ch,
        functionName,
        shape,
        confident,
        min,
        trim,
        max,
        travel: travelFromEndpoints(min, trim, max),
        reversed: (parameters.get(`SERVO${ch}_REVERSED`)?.value ?? 0) > 0,
      });
    }
    return [...byFunction.values()];
  }, [parameters, metadata, channelCount, t]);

  const unassigned = useMemo(() => {
    const free: number[] = [];
    for (let ch = 1; ch <= channelCount; ch++) {
      if ((parameters.get(`SERVO${ch}_FUNCTION`)?.value ?? 0) === 0) free.push(ch);
    }
    return free;
  }, [parameters, channelCount]);

  const [rangeTarget, setRangeTarget] = useState<GimbalRangeTarget | null>(null);
  const servoLabels = useMemo(() => new Map(Object.entries(metadata?.['SERVO1_FUNCTION']?.values ?? {}).map(([k, v]) => [Number(k), String(v)] as const)), [metadata]);
  const optionLabels = useMemo(() => new Map(Object.entries((metadata?.['RC5_OPTION'] ?? metadata?.['RC7_OPTION'])?.values ?? {}).map(([k, v]) => [Number(k), String(v)] as const)), [metadata]);
  const modeChannel = (parameters.get('FLTMODE_CH')?.value ?? parameters.get('MODE_CH')?.value) || 5;

  /** Which radio channel drives this output now, and how a new choice is written. */
  const driver = (g: OutputGroup): { channel: number | null; set: (ch: number) => void; viaAux: boolean } | null => {
    if (isPassthroughFn(g.key)) {
      return {
        channel: g.key - rcinPassthroughFunction(0),
        viaAux: false,
        set: (ch) => { for (const c of g.channels) setParameter(`SERVO${c}_FUNCTION`, ch > 0 ? rcinPassthroughFunction(ch) : 0); },
      };
    }
    const use = outputUse(g.key, servoLabels, optionLabels, isPassthroughFn);
    if (use.kind !== 'aux') return null;
    let current: number | null = null;
    for (let ch = FIRST_AUX_CH; ch <= LAST_CH; ch++) if (parameters.get(`RC${ch}_OPTION`)?.value === use.option) { current = ch; break; }
    return {
      channel: current,
      viaAux: true,
      // the output keeps its function; the chosen channel takes over the matching aux function
      set: (ch) => {
        if (current !== null) setParameter(`RC${current}_OPTION`, 0);
        if (ch > 0) setParameter(`RC${ch}_OPTION`, use.option);
      },
    };
  };

  const setFunction = useCallback(
    (channels: number[], fn: number) => {
      for (const ch of channels) setParameter(`SERVO${ch}_FUNCTION`, fn);
    },
    [setParameter]
  );

  const toggleReversed = useCallback(
    (group: OutputGroup) => {
      for (const ch of group.channels) setParameter(`SERVO${ch}_REVERSED`, group.reversed ? 0 : 1);
    },
    [setParameter]
  );

  const setEndpoint = useCallback(
    (group: OutputGroup, field: 'MIN' | 'TRIM' | 'MAX', value: number) => {
      for (const ch of group.channels) writeLive(`SERVO${ch}_${field}`, Math.round(value));
    },
    [writeLive]
  );

  const setTravel = useCallback(
    (group: OutputGroup, percent: number) => {
      const t = Math.round((percent / 100) * SERVO_TRAVEL_MAX_US);
      for (const ch of group.channels) {
        writeLive(`SERVO${ch}_MIN`, group.trim - t);
        writeLive(`SERVO${ch}_MAX`, group.trim + t);
      }
    },
    [writeLive]
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-subtle bg-surface p-6 text-sm text-content-secondary">
        <Trans
          i18nKey="mavlink-config:outputCards.empty"
          components={{ btn: <button onClick={onAssignOutputs} className="text-emerald-400 hover:underline" /> }}
        />
      </div>
    );
  }

  return (
    <>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {groups.map((g) => {
        const editable = isTravelEditable(g.shape);
        const percent = Math.round((g.travel / SERVO_TRAVEL_MAX_US) * 100);
        return (
          <div key={g.key} className="rounded-xl border border-subtle bg-surface p-4 space-y-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                {functionOptions ? (
                  <select
                    value={g.key}
                    onChange={(e) => setFunction(g.channels, Number(e.target.value))}
                    className="w-full bg-transparent text-sm font-medium text-content outline-none -ml-1 px-1 py-0.5 rounded hover:bg-surface-raised cursor-pointer"
                  >
                    {functionOptions.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                ) : (
                  <div className="text-sm font-medium text-content truncate">{g.functionName}</div>
                )}
                <div className="text-[11px] text-content-tertiary px-1">
                  {g.channels.length > 1
                    ? t('mavlink-config:outputCards.outputsList', { list: g.channels.join(', ') })
                    : t('mavlink-config:outputCards.outputSingle', { n: g.primary })}
                </div>
                {(() => {
                  const d = driver(g);
                  if (!d) return null;
                  return (
                    <label className="mt-1 flex items-center gap-2 px-1 text-[11px] text-content-secondary" data-tip={t(d.viaAux ? 'mavlink-config:outputCards.drivenByAuxTip' : 'mavlink-config:outputCards.drivenByTip')}>
                      {t('mavlink-config:outputCards.drivenBy')}
                      <select
                        value={d.channel ?? 0}
                        onChange={(e) => d.set(Number(e.target.value))}
                        className="flex-1 rounded bg-surface-input border border-subtle px-1.5 py-0.5 text-[11px] text-content"
                      >
                        <option value={0}>{t('mavlink-config:outputCards.noChannel')}</option>
                        {Array.from({ length: LAST_CH - FIRST_AUX_CH + 1 }, (_, i) => FIRST_AUX_CH + i).map((ch) => {
                          const opt = parameters.get(`RC${ch}_OPTION`)?.value ?? 0;
                          const mine = ch === d.channel;
                          const isMode = ch === modeChannel;
                          const busy = !mine && (isMode || (d.viaAux && opt !== 0));
                          const note = isMode ? t('mavlink-config:outputCards.flightModes') : opt !== 0 && !mine ? (optionLabels.get(opt) ?? String(opt)) : t('mavlink-config:outputCards.freeChannel');
                          return <option key={ch} value={ch} disabled={busy}>{t('mavlink-config:outputCards.channelOption', { ch, note })}</option>;
                        })}
                      </select>
                    </label>
                  );
                })()}
                {(g.key === 7 || g.key === 13) && (parameters.get(`MNT${g.key === 7 ? 1 : 2}_TYPE`)?.value ?? 0) !== 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const mount: 1 | 2 = g.key === 7 ? 1 : 2;
                      const option = mount === 1 ? 213 : 216;
                      let knob: number | null = null;
                      for (let ch = FIRST_AUX_CH; ch <= LAST_CH; ch++) if (parameters.get(`RC${ch}_OPTION`)?.value === option) { knob = ch; break; }
                      setRangeTarget({ outputs: g.channels, mount, knobChannel: knob });
                    }}
                    className="mt-1.5 ml-1 rounded-md border border-blue-500/40 bg-blue-500/10 px-2 py-1 text-[11px] font-medium text-blue-300 hover:bg-blue-500/20"
                  >
                    {t('mavlink-config:gimbalRange.open')}
                  </button>
                )}
                {(() => {
                  const mount = mountOf(g.key);
                  return mount !== null && (parameters.get(`MNT${mount}_TYPE`)?.value ?? 0) === 0 ? (
                    <p className="mt-1 px-1 text-[10px] leading-snug text-amber-400">{t('mavlink-config:outputCards.mountOff', { n: mount })}</p>
                  ) : null;
                })()}
              </div>
              {!g.confident && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-content-tertiary bg-surface-raised"
                  title={t('mavlink-config:outputCards.inferredTitle')}
                >
                  {t('mavlink-config:outputCards.inferred')}
                </span>
              )}
            </div>

            <OutputVisual
              channel={g.primary}
              shape={g.shape}
              functionName={g.functionName}
              min={g.min}
              trim={g.trim}
              max={g.max}
              maxUs={SERVO_TRAVEL_MAX_US}
            />

            {editable && (
              <p className="text-[11px] text-content-tertiary">{t(SHAPE_NOTE_KEY[g.shape])}</p>
            )}

            {editable ? (
              <DraggableSlider
                label={t('mavlink-config:outputCards.travel')}
                value={percent}
                onChange={(v) => setTravel(g, v)}
                min={10}
                max={100}
                step={1}
                color="#10B981"
                hint={t('mavlink-config:outputCards.travelHint', { percent, low: g.trim - g.travel, high: g.trim + g.travel })}
              />
            ) : (
              <p className="text-[11px] text-content-tertiary">{t(SHAPE_NOTE_KEY[g.shape])}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(['MIN', 'TRIM', 'MAX'] as const).map((field) => (
                <label key={field} className="text-[10px] uppercase tracking-wide text-content-tertiary">
                  {field}
                  <LivePwmInput
                    value={field === 'MIN' ? g.min : field === 'TRIM' ? g.trim : g.max}
                    onWrite={(v) => setEndpoint(g, field, v)}
                    min={PWM_FLOOR}
                    max={PWM_CEILING}
                    className="mt-0.5 w-full px-2 py-1 text-center text-xs bg-surface-input border border-border rounded text-content tabular-nums"
                  />
                </label>
              ))}
            </div>

            {Math.min(g.min, g.trim) < DOCUMENTED_FLOOR && (
              <p className="text-[11px] text-amber-400">{t('mavlink-config:outputCards.belowDocumented')}</p>
            )}
            {g.min >= g.max && (
              <p className="text-[11px] text-amber-400">
                {t('mavlink-config:outputCards.minNotBelowMax')}
              </p>
            )}

            <label className="flex items-center gap-2 text-[11px] text-content-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={g.reversed}
                onChange={() => toggleReversed(g)}
                className="accent-emerald-500"
              />
              {t('common:reversed')}
            </label>
          </div>
        );
      })}
    </div>

    <div className="mt-4 flex items-center gap-2 text-xs text-content-tertiary">
      <span>
        {unassigned.length === 0
          ? t('mavlink-config:outputCards.allAssigned')
          : t('mavlink-config:outputCards.unassigned', {
              count: unassigned.length,
              list: `${unassigned.slice(0, 6).join(', ')}${unassigned.length > 6 ? '…' : ''}`,
            })}
      </span>
      <button onClick={onAssignOutputs} className="text-emerald-400 hover:underline">
        {t('mavlink-config:outputCards.openAll')}
      </button>
    </div>
      {rangeTarget && <GimbalRangeDialog target={rangeTarget} onClose={() => setRangeTarget(null)} />}
    </>
  );
};

export default OutputCards;
