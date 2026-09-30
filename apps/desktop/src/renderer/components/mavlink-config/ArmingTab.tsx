/**
 * Arming: what the vehicle checks before it will run its motors, and how it is
 * asked to arm.
 *
 * One page instead of a parameter hunt. The checks read and write whichever
 * parameter this firmware uses (ARMING_CHECK up to 4.6, the inverted
 * ARMING_SKIPCHK from 4.7), and each row shows whether it is currently the
 * thing blocking the arm.
 */

import { useCallback, useMemo, useState } from 'react';

/** Prefer the i18n key; falls back to the literal. */
function acText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}
import { useTranslation } from 'react-i18next';
import { ShieldCheck, ShieldOff, Sparkles, AlertTriangle, CheckCircle2, MinusCircle } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import Px4ArmingConfig from './Px4ArmingConfig';
import { useConnectionStore } from '../../stores/connection-store';
import { useMessagesStore } from '../../stores/messages-store';
import { getVehicleClass } from '../../../shared/telemetry-types';
import { PrearmPanel } from './PrearmPanel';
import { currentPrearmFailures } from './prearm-status';
import {
  ARMING_CHECK_BITS,
  allChecksValue,
  detectArmingModel,
  isAllChecks,
  isCheckEnabled,
  isNoChecks,
  noChecksValue,
  toggleCheck,
  withCheckDisabled,
} from './arming-checks';

const LOGGING_BIT = 10;

interface ArmingTabProps {
  onGoTo?: (tab: string) => void;
}

export default function ArmingTab({ onGoTo }: ArmingTabProps): JSX.Element {
  const { t } = useTranslation('mavlink');
  const { parameters, setParameter } = useParameterStore();
  const mavType = useConnectionStore((s) => s.connectionState.mavType);
  const firmware = useConnectionStore((s) => s.connectionState.firmware);
  const statusMessages = useMessagesStore((s) => s.messages);
  const [confirmOff, setConfirmOff] = useState(false);

  const model = useMemo(
    () => detectArmingModel((param) => parameters.has(param)),
    [parameters],
  );
  const value = model
    ? ((parameters.get(model.param)?.value as number) ?? allChecksValue(model))
    : 1;

  const isPlane = getVehicleClass(mavType) === 'plane' || getVehicleClass(mavType) === 'vtol';
  const bits = useMemo(
    () => ARMING_CHECK_BITS.filter((b) => !b.planeOnly || isPlane),
    [isPlane],
  );

  const failingBits = useMemo(() => new Set(
    currentPrearmFailures(statusMessages as Array<{ text: string; timestamp?: number }>)
      .map((f) => f.bit)
      .filter((b): b is number => b !== null),
  ), [statusMessages]);

  const write = useCallback((next: number) => {
    if (model) void setParameter(model.param, next);
  }, [model, setParameter]);

  if (firmware === 'px4') return <Px4ArmingConfig />;

  if (!model) {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-subtle bg-surface p-5 text-sm text-content-secondary">
          This board does not expose arming checks. Connect the vehicle and load its parameters.
        </div>
      </div>
    );
  }

  const allOn = isAllChecks(model, value);
  const allOff = isNoChecks(model, value);
  const enabledCount = bits.filter((b) => isCheckEnabled(model, value, b.bit)).length;

  return (
    <div className="p-6 space-y-6">
      <PrearmPanel model={model} value={value} onWrite={write} onGoTo={onGoTo} />

      {/* Quick states */}
      <div className="bg-surface rounded-xl border border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-medium text-content">Checks before arming</h3>
            <p className="text-xs text-content-secondary">
              {enabledCount} of {bits.length} running · {model.param}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setConfirmOff(false); write(allChecksValue(model)); }}
              disabled={allOn}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors disabled:opacity-50 ${
                allOn ? 'bg-emerald-500/15 text-emerald-300' : 'bg-surface-raised text-content-secondary hover:text-content'
              }`}
            >
              <ShieldCheck className="w-3.5 h-3.5" /> All checks
            </button>
            <button
              onClick={() => {
                setConfirmOff(false);
                write(withCheckDisabled(model, allChecksValue(model), LOGGING_BIT));
              }}
              data-tip="Everything except the logging check, for a vehicle with no SD card"
              className="flex items-center gap-1.5 rounded-lg bg-surface-raised px-3 py-2 text-xs text-content-secondary hover:text-content transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> No card
            </button>
            <button
              onClick={() => (confirmOff ? write(noChecksValue(model)) : setConfirmOff(true))}
              onBlur={() => setConfirmOff(false)}
              disabled={allOff}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs transition-colors disabled:opacity-50 ${
                confirmOff
                  ? 'bg-red-600 text-white'
                  : 'bg-surface-raised text-red-400 hover:bg-red-500/10'
              }`}
            >
              <ShieldOff className="w-3.5 h-3.5" />
              {confirmOff ? 'Really skip everything?' : 'Skip all'}
            </button>
          </div>
        </div>

        {allOff && (
          <div className="mb-3 flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            Every non-mandatory check is skipped. The vehicle will arm with a dead compass, no fix
            and an uncalibrated board.
          </div>
        )}

        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))]">
          {bits.map((b) => {
            const on = isCheckEnabled(model, value, b.bit);
            const blocking = failingBits.has(b.bit);
            return (
              <button
                key={b.bit}
                onClick={() => write(toggleCheck(model, value, b.bit, bits))}
                className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  blocking
                    ? 'border-amber-500/50 bg-amber-500/10'
                    : on
                      ? 'border-emerald-600/30 dark:border-emerald-500/25 bg-emerald-500/[0.07] dark:bg-emerald-500/5'
                      : 'border-dashed border-content-tertiary/40 bg-surface-inset/60'
                }`}
              >
                {on
                  ? <CheckCircle2 className={`mt-0.5 w-4 h-4 shrink-0 ${
                      blocking ? 'text-amber-600 dark:text-amber-400' : 'text-emerald-600 dark:text-emerald-400'
                    }`} />
                  : <MinusCircle className="mt-0.5 w-4 h-4 shrink-0 text-content-tertiary" />}
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm ${on ? 'text-content' : 'text-content-secondary line-through decoration-content-tertiary/50'}`}>
                      {acText(t, b.nameKey, b.name)}
                    </span>
                    {blocking && (
                      <span className="rounded bg-amber-500/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-700 dark:text-amber-300">
                        blocking
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-[11px] text-content-tertiary">{acText(t, b.descriptionKey, b.description)}</div>
                </div>
                <span className={`mt-0.5 shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
                  on
                    ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                    : 'bg-content-tertiary/15 text-content-secondary ring-1 ring-inset ring-content-tertiary/30'
                }`}>
                  {on ? 'on' : 'skipped'}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* How arming is asked for */}
      <div className="bg-surface rounded-xl border border-subtle p-5 space-y-4">
        <div>
          <h3 className="font-medium text-content">How it arms</h3>
          <p className="text-xs text-content-secondary">Only the settings this firmware exposes are shown</p>
        </div>

        <ChoiceRow
          param="ARMING_REQUIRE"
          label="Arming required"
          hint="A vehicle that does not require arming runs its motors as soon as it boots"
          options={[
            { value: 0, label: 'Not required' },
            { value: 1, label: 'Required' },
            { value: 3, label: 'Auto-arm once checks pass' },
          ]}
        />
        <ChoiceRow
          param="ARMING_RUDDER"
          label="Arm with the sticks"
          hint="Holding yaw right to arm, left to disarm"
          options={[
            { value: 0, label: 'Off' },
            { value: 1, label: 'Arm only' },
            { value: 2, label: 'Arm and disarm' },
          ]}
        />
        <ChoiceRow
          param="ARMING_NEED_LOC"
          label="Require a position"
          hint="Refuse to arm without an absolute position, so it can always return home"
          options={[
            { value: 0, label: 'Not needed' },
            { value: 1, label: 'Required' },
          ]}
        />
      </div>
    </div>
  );
}

interface ChoiceRowProps {
  param: string;
  label: string;
  hint: string;
  options: Array<{ value: number; label: string }>;
}

/** A single-parameter choice, hidden when the board does not have it. */
function ChoiceRow({ param, label, hint, options }: ChoiceRowProps): JSX.Element {
  const { parameters, setParameter } = useParameterStore();
  if (!parameters.has(param)) return <></>;
  const current = (parameters.get(param)?.value as number) ?? options[0]!.value;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="min-w-[180px] flex-1">
        <div className="text-sm text-content">{label}</div>
        <div className="text-[11px] text-content-tertiary">{hint}</div>
      </div>
      <div className="flex items-center gap-1 rounded-lg border border-subtle bg-surface-raised p-1">
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => void setParameter(param, o.value)}
            className={`rounded-md px-3 py-1.5 text-xs transition-colors ${
              current === o.value
                ? 'bg-blue-500/20 text-blue-300'
                : 'text-content-secondary hover:text-content'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}
