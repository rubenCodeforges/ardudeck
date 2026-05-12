/**
 * ServoRow — one channel in the Servo Output table.
 *
 * Renders live PWM bar + Reverse / Function / Min / Trim / Max editors.
 * Number inputs keep their own draft state and commit on blur or Enter, so
 * the user can type freely without partial values being sent mid-stroke.
 */

import React, { useCallback, useEffect, useState } from 'react';
import type { ParameterWithMeta } from '../../../../shared/parameter-types';

interface Option {
  value: number;
  label: string;
}

interface ServoRowProps {
  channel: number;
  parameters: Map<string, ParameterWithMeta>;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  functionOptions: Option[] | null;
  livePwm: number | undefined;
  liveStale: boolean;
  pwmMin: number;
  pwmMax: number;
}

export const ServoRow: React.FC<ServoRowProps> = React.memo(
  ({ channel, parameters, setParameter, functionOptions, livePwm, liveStale, pwmMin, pwmMax }) => {
    const prefix = `SERVO${channel}`;
    const functionParam = parameters.get(`${prefix}_FUNCTION`);
    const reversedParam = parameters.get(`${prefix}_REVERSED`);
    const minParam = parameters.get(`${prefix}_MIN`);
    const trimParam = parameters.get(`${prefix}_TRIM`);
    const maxParam = parameters.get(`${prefix}_MAX`);

    const hasParams = Boolean(functionParam || minParam || trimParam || maxParam);
    const funcValue = functionParam?.value ?? 0;
    const reversed = (reversedParam?.value ?? 0) > 0;

    const liveVal = livePwm ?? 0;
    const pct =
      liveVal > 0
        ? Math.min(100, Math.max(0, ((liveVal - pwmMin) / (pwmMax - pwmMin)) * 100))
        : 0;

    const onToggleReverse = useCallback(() => {
      setParameter(`${prefix}_REVERSED`, reversed ? 0 : 1);
    }, [prefix, reversed, setParameter]);

    const onFunctionChange = useCallback(
      (e: React.ChangeEvent<HTMLSelectElement>) => {
        const v = Number(e.target.value);
        if (!Number.isNaN(v)) setParameter(`${prefix}_FUNCTION`, v);
      },
      [prefix, setParameter]
    );

    const minPwm = minParam?.value ?? 1100;
    const trimPwm = trimParam?.value ?? 1500;
    const maxPwm = maxParam?.value ?? 1900;

    const pulse = useCallback((pwm: number) => {
      void window.electronAPI?.servoTestPulse?.(channel, pwm);
    }, [channel]);

    const release = useCallback(() => {
      void window.electronAPI?.servoTestRelease?.(channel);
    }, [channel]);

    // ArduPlane only honors MAV_CMD_DO_SET_SERVO on outputs configured as
    // Disabled (0), RCPassThru (1), or RCx_PASSTHRU (51-66). Mixer functions
    // (Aileron, Elevator, Throttle, etc.) are recomputed every cycle and
    // override any SET_SERVO. See:
    // https://ardupilot.org/plane/docs/common-mavlink-mission-command-messages-mav_cmd.html
    const canTestDirectly = funcValue === 0 || funcValue === 1 || (funcValue >= 51 && funcValue <= 66);
    const testTooltip = canTestDirectly
      ? undefined
      : 'ArduPlane mixer overrides this output. DO_SET_SERVO only works on Disabled (0), RCPassThru (1), or RCx_PASSTHRU (51-66) functions.';

    return (
      <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_70px_70px_70px_180px] gap-2 items-center px-3 py-2 hover:bg-surface-raised/30">
        {/* Channel number */}
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
            {liveVal > 0 ? liveVal : '—'}
          </div>
        </div>

        {/* Reverse checkbox */}
        <div className="flex justify-center">
          <input
            type="checkbox"
            checked={reversed}
            disabled={!reversedParam}
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
            <NumberCell
              param={`${prefix}_FUNCTION`}
              value={funcValue}
              disabled={!functionParam}
              setParameter={setParameter}
              min={-1}
              max={255}
            />
          )}
        </div>

        {/* Min / Trim / Max */}
        <NumberCell
          param={`${prefix}_MIN`}
          value={minParam?.value ?? 0}
          disabled={!minParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <NumberCell
          param={`${prefix}_TRIM`}
          value={trimParam?.value ?? 0}
          disabled={!trimParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />
        <NumberCell
          param={`${prefix}_MAX`}
          value={maxParam?.value ?? 0}
          disabled={!maxParam}
          setParameter={setParameter}
          min={pwmMin}
          max={pwmMax}
        />

        {/* Test buttons: pulse to MIN/TRIM/MAX, then release autopilot control.
            Disabled when the function is mixer-driven (ArduPlane mixer would
            overwrite SET_SERVO every cycle). */}
        <div className="flex items-center gap-1" title={testTooltip}>
          <TestButton label="Min"  disabled={!canTestDirectly} onClick={() => pulse(minPwm)} />
          <TestButton label="Trim" disabled={!canTestDirectly} onClick={() => pulse(trimPwm)} />
          <TestButton label="Max"  disabled={!canTestDirectly} onClick={() => pulse(maxPwm)} />
          <TestButton label="Rel"  disabled={!canTestDirectly} onClick={release} variant="release" />
        </div>

        {!hasParams && (
          <div className="col-span-8 text-xs text-content-tertiary text-center">
            (params not loaded for channel {channel})
          </div>
        )}
      </div>
    );
  }
);

ServoRow.displayName = 'ServoRow';

interface TestButtonProps {
  label: string;
  disabled: boolean;
  onClick: () => void;
  variant?: 'pulse' | 'release';
}

const TestButton: React.FC<TestButtonProps> = ({ label, disabled, onClick, variant = 'pulse' }) => {
  const colors = variant === 'release'
    ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/10'
    : 'border-pink-500/40 text-pink-300 hover:bg-pink-500/10';
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`flex-1 h-7 px-1 text-[11px] font-mono rounded border bg-surface-base ${colors} disabled:opacity-30 disabled:cursor-not-allowed transition-colors`}
    >
      {label}
    </button>
  );
};

interface NumberCellProps {
  param: string;
  value: number;
  disabled: boolean;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  min: number;
  max: number;
}

const NumberCell: React.FC<NumberCellProps> = ({ param, value, disabled, setParameter, min, max }) => {
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
