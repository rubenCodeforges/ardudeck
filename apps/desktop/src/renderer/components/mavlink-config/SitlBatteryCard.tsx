/**
 * The battery SITL is actually simulating, as opposed to the one the flight
 * controller has been told about.
 *
 * Everything else on this tab configures the FC's monitor: capacity, chemistry
 * thresholds, failsafes. None of it changes what the simulated sensor reads,
 * so setting a 14S pack here and then seeing 12.6 V arrive is correct and
 * baffling in equal measure. SIM_BATT_VOLTAGE / SIM_BATT_CAP_AH are the
 * simulated cells, and only exist on SITL.
 */

import { useState } from 'react';
import { AlertTriangle, Cpu } from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useTelemetryStore } from '../../stores/telemetry-store';

interface SitlBatteryCardProps {
  /** Cell count the tab has configured on the FC, 0 when it cannot tell. */
  cells: number;
  /** Volts per cell at full charge for the selected chemistry. */
  cellFull: number;
  /** Pack capacity the tab has configured on the FC, in mAh. */
  capacityMah: number;
}

/**
 * Built-in SITL frames are calibrated around a 12.6 V reference and their
 * thrust scales with supply voltage, so a big pack over-drives them badly.
 * Matched to the warning in main/sitl/ardupilot-sitl-process.ts.
 */
const BUILTIN_FRAME_REFERENCE_V = 12.6;

export function SitlBatteryCard({ cells, cellFull, capacityMah }: SitlBatteryCardProps): JSX.Element | null {
  const { parameters, setParameter } = useParameterStore();
  // What the vehicle is actually reporting. The stored parameter is a request;
  // this is the answer, and the two disagreeing is the whole point of the card.
  const measuredVolts = useTelemetryStore((s) => s.battery.voltage);
  const [busy, setBusy] = useState(false);

  const simVolts = parameters.get('SIM_BATT_VOLTAGE')?.value as number | undefined;
  const simAh = parameters.get('SIM_BATT_CAP_AH')?.value as number | undefined;

  // Not a simulator: the card does not exist.
  if (simVolts === undefined || simAh === undefined) return null;

  const targetVolts = cells > 0 ? Number((cells * cellFull).toFixed(1)) : 0;
  const targetAh = capacityMah > 0 ? Number((capacityMah / 1000).toFixed(1)) : 0;
  const canMatch = targetVolts > 0 && targetAh > 0;
  const stored =
    canMatch && Math.abs(simVolts - targetVolts) < 0.05 && Math.abs(simAh - targetAh) < 0.05;
  // Throttle sag pulls the reading down by up to ~0.7 V, so only a real gap counts.
  const producing = measuredVolts > 0;
  const matched = stored && producing && Math.abs(measuredVolts - targetVolts) < 2;
  // Asked for, stored, and the simulator is still producing something else.
  const ignored = stored && producing && measuredVolts + 2 < targetVolts;
  const overdriven = targetVolts > BUILTIN_FRAME_REFERENCE_V * 1.2;

  const match = async () => {
    setBusy(true);
    try {
      // SITL fixes the pack's ceiling at startup (SIM_Battery::setup), and
      // maybe_reset() clamps every later change to MIN(desired, max_voltage).
      // So a lower pack takes effect now and a higher one only after a restart,
      // which then reads this stored value as the new ceiling.
      await setParameter('SIM_BATT_VOLTAGE', targetVolts);
      await setParameter('SIM_BATT_CAP_AH', targetAh);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="bg-surface rounded-xl border border-subtle p-5">
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-violet-500/20">
          <Cpu className="h-5 w-5 text-violet-400" />
        </div>
        <div className="flex-1">
          <h3 className="font-medium text-content">Simulated pack</h3>
          <p className="text-xs text-content-secondary">
            What SITL feeds the voltage sensor. Everything else here only tells the autopilot
            what to expect.
          </p>
        </div>
        <span className="rounded bg-violet-500/20 px-2 py-0.5 text-[10px] uppercase tracking-wide text-violet-700 dark:text-violet-300">
          SITL only
        </span>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-subtle bg-surface-raised p-3">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary">Vehicle reports</div>
          <div className={`font-mono text-lg ${ignored ? 'text-amber-500' : 'text-content'}`}>
            {producing ? `${measuredVolts.toFixed(1)} V` : '--'}
          </div>
          <div className="text-[11px] text-content-tertiary">
            {simAh.toFixed(1)} Ah set{stored ? '' : `, ${simVolts.toFixed(1)} V set`}
          </div>
        </div>
        <div className="rounded-lg border border-subtle bg-surface-raised p-3">
          <div className="text-[10px] uppercase tracking-wide text-content-tertiary">Configured here</div>
          <div className="font-mono text-lg text-content">
            {canMatch ? `${targetVolts.toFixed(1)} V` : '--'}
          </div>
          <div className="text-[11px] text-content-tertiary">
            {canMatch ? `${targetAh.toFixed(1)} Ah` : 'set a cell count and capacity'}
          </div>
        </div>
      </div>

      {overdriven && (
        <div className="mb-3 flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-200">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>
            SITL's built-in airframes are calibrated around {BUILTIN_FRAME_REFERENCE_V} V and their
            thrust scales with supply voltage, so this pack will over-drive them: hover throttle
            produces several times the intended thrust and a short takeoff climbs away. Only match
            a pack this size when you are flying a custom frame whose reference voltage suits it.
          </span>
        </div>
      )}

      <button
        onClick={match}
        disabled={busy || !canMatch || matched}
        className={`w-full rounded-md px-3 py-2 text-xs transition-colors disabled:opacity-40 ${
          matched
            ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
            : 'bg-violet-500/20 text-violet-700 hover:bg-violet-500/30 dark:text-violet-300'
        }`}
      >
        {matched ? 'Simulated pack matches this configuration' : 'Match simulated pack to this configuration'}
      </button>

      {ignored ? (
        <p className="mt-2 rounded border border-amber-500/30 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-200">
          Not working. The setting is stored, but this airframe's simulated battery is capped at
          about {measuredVolts.toFixed(1)} V and ignores anything higher, so the vehicle keeps
          reporting that. Restarting will not change it. To simulate a bigger pack, fly a custom
          frame that declares one.
        </p>
      ) : (
        <p className="mt-2 text-[11px] text-content-tertiary">
          The left figure is what the vehicle actually reports, so you can see whether this took
          effect rather than only whether it was set.
        </p>
      )}
    </div>
  );
}
