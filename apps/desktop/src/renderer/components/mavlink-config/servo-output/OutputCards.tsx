import React, { useMemo, useCallback } from 'react';
import { useParameterStore } from '../../../stores/parameter-store';
import { DraggableSlider } from '../../ui/DraggableSlider';
import { DraftNumberInput } from '../../../hooks/useNumericDraft';
import { OutputVisual } from './OutputVisual';
import { classifyOutput, isTravelEditable, travelFromEndpoints, type OutputShape } from './output-shape';

const SERVO_TRAVEL_MAX_US = 500;
const PWM_FLOOR = 800;
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

const SHAPE_NOTE: Record<OutputShape, string> = {
  angular: 'Deflects either side of trim. The arc shows share of travel, not degrees.',
  bipolar: 'Runs both ways from a centre stop, so trim is neutral.',
  unidirectional: 'Runs one way, from min to max.',
  discrete: 'Switches between two states; there is no travel to set.',
  motor: 'Driven by the mixer. Min and max are ESC calibration, not travel.',
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
  const parameters = useParameterStore((s) => s.parameters);
  const metadata = useParameterStore((s) => s.metadata);
  const setParameter = useParameterStore((s) => s.setParameter);

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

      const functionName = labels?.[fn] ?? `Function ${fn}`;
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
  }, [parameters, metadata, channelCount]);

  const unassigned = useMemo(() => {
    const free: number[] = [];
    for (let ch = 1; ch <= channelCount; ch++) {
      if ((parameters.get(`SERVO${ch}_FUNCTION`)?.value ?? 0) === 0) free.push(ch);
    }
    return free;
  }, [parameters, channelCount]);

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
      for (const ch of group.channels) setParameter(`SERVO${ch}_${field}`, Math.round(value));
    },
    [setParameter]
  );

  const setTravel = useCallback(
    (group: OutputGroup, percent: number) => {
      const t = Math.round((percent / 100) * SERVO_TRAVEL_MAX_US);
      for (const ch of group.channels) {
        setParameter(`SERVO${ch}_MIN`, group.trim - t);
        setParameter(`SERVO${ch}_MAX`, group.trim + t);
      }
    },
    [setParameter]
  );

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-subtle bg-surface p-6 text-sm text-content-secondary">
        No output has a function yet.{' '}
        <button onClick={onAssignOutputs} className="text-emerald-400 hover:underline">
          Assign outputs
        </button>{' '}
        and they will appear here.
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
                  {g.channels.length > 1 ? `Outputs ${g.channels.join(', ')}` : `Output ${g.primary}`}
                </div>
              </div>
              {!g.confident && (
                <span
                  className="shrink-0 rounded px-1.5 py-0.5 text-[10px] text-content-tertiary bg-surface-raised"
                  title="Shape inferred from this vehicle's endpoints, not from a known function name"
                >
                  inferred
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
              <p className="text-[11px] text-content-tertiary">{SHAPE_NOTE[g.shape]}</p>
            )}

            {editable ? (
              <DraggableSlider
                label="Travel"
                value={percent}
                onChange={(v) => setTravel(g, v)}
                min={10}
                max={100}
                step={1}
                color="#10B981"
                hint={`Full stick reaches ${percent}% (${g.trim - g.travel}–${g.trim + g.travel} µs)`}
              />
            ) : (
              <p className="text-[11px] text-content-tertiary">{SHAPE_NOTE[g.shape]}</p>
            )}

            <div className="grid grid-cols-3 gap-2">
              {(['MIN', 'TRIM', 'MAX'] as const).map((field) => (
                <label key={field} className="text-[10px] uppercase tracking-wide text-content-tertiary">
                  {field}
                  <DraftNumberInput
                    value={field === 'MIN' ? g.min : field === 'TRIM' ? g.trim : g.max}
                    onCommit={(v) => setEndpoint(g, field, v)}
                    min={PWM_FLOOR}
                    max={PWM_CEILING}
                    integer
                    className="mt-0.5 w-full px-2 py-1 text-center text-xs bg-surface-input border border-border rounded text-content tabular-nums"
                  />
                </label>
              ))}
            </div>

            {g.min >= g.max && (
              <p className="text-[11px] text-amber-400">
                Min is not below max, so this output cannot move.
              </p>
            )}

            <label className="flex items-center gap-2 text-[11px] text-content-secondary cursor-pointer">
              <input
                type="checkbox"
                checked={g.reversed}
                onChange={() => toggleReversed(g)}
                className="accent-emerald-500"
              />
              Reversed
            </label>
          </div>
        );
      })}
    </div>

    <div className="mt-4 flex items-center gap-2 text-xs text-content-tertiary">
      <span>
        {unassigned.length === 0
          ? 'Every output has a function.'
          : `${unassigned.length} output${unassigned.length === 1 ? '' : 's'} unassigned (${unassigned.slice(0, 6).join(', ')}${unassigned.length > 6 ? '…' : ''}).`}
      </span>
      <button onClick={onAssignOutputs} className="text-emerald-400 hover:underline">
        Open all outputs
      </button>
    </div>
    </>
  );
};

export default OutputCards;
