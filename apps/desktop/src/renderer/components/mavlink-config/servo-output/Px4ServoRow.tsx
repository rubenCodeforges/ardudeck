/**
 * Px4ServoRow - one PX4 actuator output in the PWM output table.
 *
 * PX4 maps each physical output to a function (Motor N, Servo N, ...) via
 * PWM_MAIN_FUNCn / PWM_AUX_FUNCn and clamps the pulse with
 * PWM_MAIN_MINn / PWM_MAIN_MAXn and a disarmed value PWM_MAIN_DISn.
 * Reverse is a single per-bank bitmask (PWM_MAIN_REV / PWM_AUX_REV), bit
 * (channel - 1).
 *
 * Each editor is param-bound: a row only renders the controls whose params
 * are present in the live parameter map, so it degrades gracefully across PX4
 * versions that expose different output banks.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ParameterWithMeta } from '../../../../shared/parameter-types';

interface Option {
  value: number;
  label: string;
}

interface Px4ServoRowProps {
  /** 1-based output index within the bank. */
  channel: number;
  /** "PWM_MAIN" or "PWM_AUX". */
  bankPrefix: string;
  parameters: Map<string, ParameterWithMeta>;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  functionOptions: Option[] | null;
  /** Live PWM from SERVO_OUTPUT_RAW for this row, if available. */
  livePwm: number | undefined;
  liveStale: boolean;
  pwmMin: number;
  pwmMax: number;
}

export const Px4ServoRow: React.FC<Px4ServoRowProps> = React.memo(
  ({ channel, bankPrefix, parameters, setParameter, functionOptions, livePwm, liveStale, pwmMin, pwmMax }) => {
    const functionParam = parameters.get(`${bankPrefix}_FUNC${channel}`);
    const minParam = parameters.get(`${bankPrefix}_MIN${channel}`);
    const maxParam = parameters.get(`${bankPrefix}_MAX${channel}`);
    const disParam = parameters.get(`${bankPrefix}_DIS${channel}`);
    // PX4 reverse is a single per-bank bitmask; bit (channel - 1) flags this output.
    const revParam = parameters.get(`${bankPrefix}_REV`);

    const funcValue = functionParam?.value ?? 0;
    const revMask = revParam?.value ?? 0;
    const reversed = ((revMask >> (channel - 1)) & 1) === 1;

    const liveVal = livePwm ?? 0;
    const pct =
      liveVal > 0
        ? Math.min(100, Math.max(0, ((liveVal - pwmMin) / (pwmMax - pwmMin)) * 100))
        : 0;

    const onToggleReverse = useCallback(() => {
      const bit = 1 << (channel - 1);
      const next = reversed ? revMask & ~bit : revMask | bit;
      setParameter(`${bankPrefix}_REV`, next);
    }, [bankPrefix, channel, reversed, revMask, setParameter]);

    const onFunctionChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) setParameter(`${bankPrefix}_FUNC${channel}`, v);
      },
      [bankPrefix, channel, setParameter]
    );

    return (
      <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_70px_70px_70px] gap-2 items-center px-3 py-2 hover:bg-surface-raised/30">
        {/* Output number */}
        <div className="text-center text-sm font-mono text-content-secondary">{channel}</div>

        {/* Live PWM bar */}
        <div className="relative h-7 rounded bg-surface-base border border-subtle overflow-hidden">
          <div
            className={`absolute inset-y-0 left-0 transition-all duration-75 ${
              liveStale ? 'bg-content-tertiary/30' : 'bg-emerald-500/50'
            }`}
            style={{ width: `${pct}%` }}
          />
          <div className="absolute inset-0 flex items-center justify-center text-xs font-mono text-content">
            {liveVal > 0 ? liveVal : '-'}
          </div>
        </div>

        {/* Reverse checkbox (per-bank bitmask) */}
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={reversed}
            disabled={!revParam}
            onChange={onToggleReverse}
            className="w-4 h-4 rounded border-subtle bg-surface-base accent-pink-500 disabled:opacity-40"
          />
        </div>

        {/* Function dropdown */}
        <div>
          {functionOptions && functionOptions.length > 0 ? (
            <select
              value={funcValue}
              disabled={!functionParam}
              onChange={onFunctionChange}
              className="w-full h-8 px-2 text-sm rounded bg-surface-base border border-subtle text-content disabled:opacity-40"
            >
              {!functionOptions.some((o) => o.value === funcValue) && (
                <option value={funcValue}>{`Unknown (${funcValue})`}</option>
              )}
              {functionOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <Px4NumberCell
              param={`${bankPrefix}_FUNC${channel}`}
              value={funcValue}
              disabled={!functionParam}
              setParameter={setParameter}
              min={0}
              max={2000}
            />
          )}
        </div>

        {/* Min / Max / Disarmed */}
        <Px4NumberCell
          param={`${bankPrefix}_MIN${channel}`}
          value={minParam?.value ?? 0}
          disabled={!minParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <Px4NumberCell
          param={`${bankPrefix}_MAX${channel}`}
          value={maxParam?.value ?? 0}
          disabled={!maxParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <Px4NumberCell
          param={`${bankPrefix}_DIS${channel}`}
          value={disParam?.value ?? 0}
          disabled={!disParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
      </div>
    );
  }
);

Px4ServoRow.displayName = 'Px4ServoRow';

interface Px4NumberCellProps {
  param: string;
  value: number;
  disabled: boolean;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  min: number;
  max: number;
}

const Px4NumberCell: React.FC<Px4NumberCellProps> = ({ param, value, disabled, setParameter, min, max }) => {
  const [draft, setDraft] = useState(String(value));

  useEffect(() => {
    setDraft(String(value));
  }, [value]);

  const commit = useCallback(() => {
    const n = Number(draft);
    if (Number.isNaN(n)) {
      setDraft(String(value));
      return;
    }
    const clamped = Math.min(max, Math.max(min, n));
    if (clamped !== value) {
      setParameter(param, clamped);
    }
    if (String(clamped) !== draft) setDraft(String(clamped));
  }, [draft, value, min, max, param, setParameter]);

  const onKey = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.currentTarget.blur();
      } else if (e.key === 'Escape') {
        setDraft(String(value));
        e.currentTarget.blur();
      }
    },
    [value]
  );

  return (
    <input
      type="number"
      value={draft}
      disabled={disabled}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={onKey}
      className="h-8 w-full px-2 text-sm text-center rounded bg-surface-base border border-subtle text-content font-mono disabled:opacity-40 focus:outline-none focus:border-pink-500/60"
    />
  );
};
