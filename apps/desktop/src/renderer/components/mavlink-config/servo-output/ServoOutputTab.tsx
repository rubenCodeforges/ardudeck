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

import React, { useMemo } from 'react';
import { Move, Lightbulb } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { useTelemetryStore } from '../../../stores/telemetry-store';
import { ServoRow } from './ServoRow';
import { StickTestPanel } from './StickTestPanel';

const PWM_MIN = 800;
const PWM_MAX = 2200;

const ServoOutputTab: React.FC = () => {
  const parameters = useParameterStore((s) => s.parameters);
  const metadata = useParameterStore((s) => s.metadata);
  const setParameter = useParameterStore((s) => s.setParameter);
  const servoOutput = useTelemetryStore((s) => s.servoOutput);
  const lastServoOutput = useTelemetryStore((s) => s.lastServoOutput);

  const hasParameters = parameters.size > 0;

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

  return (
    <div className="p-6 space-y-4">
      {!hasParameters && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center shrink-0">
            <Lightbulb className="w-5 h-5 text-amber-400" />
          </div>
          <div>
            <p className="text-amber-300 font-medium">Parameters Not Loaded</p>
            <p className="text-sm text-amber-400/80">Connect to a flight controller to edit servo outputs.</p>
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
            <h3 className="text-base font-semibold text-content">Servo Output</h3>
            <p className="text-sm text-content-secondary">
              Per-channel function, range, and live output
              {!hasLiveOutput && hasParameters && (
                <span className="ml-2 text-content-tertiary">(no live telemetry)</span>
              )}
            </p>
          </div>
        </div>

        <div className="rounded-lg border border-subtle overflow-hidden">
          <div className="grid grid-cols-[40px_1fr_80px_minmax(180px,1fr)_70px_70px_70px_180px] gap-2 px-3 py-2 text-[11px] uppercase tracking-wide text-content-tertiary bg-surface-raised/40 border-b border-subtle">
            <div className="text-center">#</div>
            <div>Position</div>
            <div className="text-center">Reverse</div>
            <div>Function</div>
            <div className="text-center">Min</div>
            <div className="text-center">Trim</div>
            <div className="text-center">Max</div>
            <div className="text-center">Test</div>
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
