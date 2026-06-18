/**
 * Px4ServoOutput - PX4 actuator / PWM output configuration.
 *
 * PX4 assigns each physical output a function via PWM_MAIN_FUNCn / PWM_AUX_FUNCn
 * (Motor N, Servo N, etc.) and bounds the pulse with PWM_MAIN_MINn / MAXn / DISn
 * (disarmed). Reverse is a per-bank bitmask (PWM_MAIN_REV / PWM_AUX_REV).
 *
 * Only the banks/outputs whose params are present in the live parameter map are
 * rendered, so this degrades gracefully across PX4 versions and board output
 * counts. Live PWM comes from SERVO_OUTPUT_RAW (generic MAVLink telemetry); the
 * MAIN bank maps to SERVO_OUTPUT_RAW indices 0..N, AUX to the following block.
 *
 * LIMITATION: this is a per-output param editor, not PX4's control-allocation
 * (CA_*) airframe geometry UI. The CA_ rotor/servo geometry model is complex
 * and version-specific; configure it from the Parameters tab if needed.
 */

import React, { useMemo } from 'react';
import { Move, Lightbulb, Info } from 'lucide-react';
import type { ParameterWithMeta } from '../../../../shared/parameter-types';
import type { ParameterMetadataStore } from '../../../../shared/parameter-metadata';
import { Px4ServoRow } from './Px4ServoRow';

// PX4 PWM outputs are conventionally clamped to 1000..2000 us; widen the slider
// bounds slightly so MIN/MAX edits outside that band are still representable.
const PWM_MIN = 800;
const PWM_MAX = 2200;
const MAX_OUTPUTS_PER_BANK = 16;

interface BankDef {
  prefix: string;
  label: string;
  /** Offset into SERVO_OUTPUT_RAW.outputs for output #1 of this bank. */
  liveOffset: number;
}

const BANKS: BankDef[] = [
  { prefix: 'PWM_MAIN', label: 'Main outputs', liveOffset: 0 },
  { prefix: 'PWM_AUX', label: 'Auxiliary outputs', liveOffset: 8 },
];

interface Px4ServoOutputProps {
  parameters: Map<string, ParameterWithMeta>;
  metadata: ParameterMetadataStore | null;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  servoOutputs: number[] | undefined;
  hasLiveOutput: boolean;
}

const Px4ServoOutput: React.FC<Px4ServoOutputProps> = ({
  parameters,
  metadata,
  setParameter,
  servoOutputs,
  hasLiveOutput,
}) => {
  const hasParameters = parameters.size > 0;

  // Function dropdown options shared across a bank (PWM_*_FUNC1 carries the enum).
  const functionOptionsFor = useMemo(() => {
    const cache: Record<string, { value: number; label: string }[] | null> = {};
    for (const bank of BANKS) {
      const meta = metadata?.[`${bank.prefix}_FUNC1`];
      cache[bank.prefix] = meta?.values
        ? Object.entries(meta.values)
            .map(([val, label]) => ({ value: Number(val), label }))
            .sort((a, b) => a.value - b.value)
        : null;
    }
    return cache;
  }, [metadata]);

  // For each bank, how many outputs actually have params present.
  const presentBanks = useMemo(() => {
    return BANKS.map((bank) => {
      let count = 0;
      for (let ch = 1; ch <= MAX_OUTPUTS_PER_BANK; ch++) {
        const has =
          parameters.has(`${bank.prefix}_FUNC${ch}`) ||
          parameters.has(`${bank.prefix}_MIN${ch}`) ||
          parameters.has(`${bank.prefix}_MAX${ch}`) ||
          parameters.has(`${bank.prefix}_DIS${ch}`);
        if (has) count = ch;
      }
      return { ...bank, count };
    }).filter((b) => b.count > 0);
  }, [parameters]);

  return (
    <div className="p-6 space-y-4">
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
            <p className="text-sm text-amber-400/80">Connect to a flight controller to edit actuator outputs.</p>
          </div>
        </div>
      )}

      {hasParameters && presentBanks.length === 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 text-content-secondary" />
          </div>
          <p className="text-sm text-content-secondary">
            No PWM_MAIN_/PWM_AUX_ output parameters were found on this vehicle. Actuator geometry
            (control allocation, CA_ parameters) can be edited from the Parameters tab.
          </p>
        </div>
      )}

      {presentBanks.map((bank) => (
        <div key={bank.prefix} className="bg-surface rounded-xl border border-subtle p-5">
          <div className="flex items-center gap-3 mb-5">
            <div className="w-10 h-10 rounded-lg bg-pink-500/20 flex items-center justify-center">
              <Move className="w-5 h-5 text-pink-400" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-content">{bank.label}</h3>
              <p className="text-sm text-content-secondary">
                Per-output function, range, and disarmed value
                {!hasLiveOutput && hasParameters && (
                  <span className="ml-2 text-content-tertiary">(no live telemetry)</span>
                )}
              </p>
            </div>
          </div>

          <div className="rounded-lg border border-subtle overflow-hidden">
            <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_70px_70px_70px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary bg-surface-raised/40 border-b border-subtle">
              <div className="text-center">#</div>
              <div>Position</div>
              <div className="text-center">Reverse</div>
              <div>Function</div>
              <div className="text-center">Min</div>
              <div className="text-center">Max</div>
              <div className="text-center">Disarm</div>
            </div>
            <div className="divide-y divide-subtle/60">
              {Array.from({ length: bank.count }, (_, i) => i + 1).map((ch) => (
                <Px4ServoRow
                  key={ch}
                  channel={ch}
                  bankPrefix={bank.prefix}
                  parameters={parameters}
                  setParameter={setParameter}
                  functionOptions={functionOptionsFor[bank.prefix] ?? null}
                  livePwm={servoOutputs?.[bank.liveOffset + ch - 1]}
                  liveStale={!hasLiveOutput}
                  pwmMin={PWM_MIN}
                  pwmMax={PWM_MAX}
                />
              ))}
            </div>
          </div>
        </div>
      ))}

      {hasParameters && presentBanks.length > 0 && (
        <div className="bg-surface rounded-xl border border-subtle p-4 flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-surface-raised flex items-center justify-center shrink-0">
            <Info className="w-5 h-5 text-content-secondary" />
          </div>
          <p className="text-sm text-content-secondary leading-relaxed">
            This editor covers per-output PWM assignment. PX4 airframe geometry (control
            allocation, CA_ parameters) is not configured here; edit those from the Parameters tab.
          </p>
        </div>
      )}
    </div>
  );
};

export default Px4ServoOutput;
