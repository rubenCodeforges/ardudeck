/**
 * What each compass scored, and what to do about it, on one screen.
 *
 * A calibration that produces three different-quality compasses is a decision,
 * not a result: keep the good one, drop the one in the battery's field, and
 * put the best first. Doing that from a fitness number in a log and three
 * COMPASS_USE parameters in a table is not a workflow.
 *
 * Identity is the device id, never the slot number, because ArduPilot numbers
 * compasses in driver-probe order and the numbers move between reboots.
 */

import { useMemo, useState } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store';
import { readCompassSlots, type CompassSlot } from '../../mavlink-config/compass-inventory';
import { assessCompassFitness } from '../../../../shared/calibration-quality';

interface CompassFitPanelProps {
  /** Per-compass results from MAG_CAL_REPORT, keyed by 0-based instance. */
  results: Array<{ compass: number; fitness: number; orientation: number | null }>;
}

/** Fitness is RMS milligauss residual: single digits good, 16 is the pass mark. */
const FITNESS_FULL_SCALE = 25;

function barColour(verdict: string): string {
  if (verdict === 'good') return 'bg-emerald-500';
  if (verdict === 'marginal') return 'bg-amber-500';
  return 'bg-red-500';
}

export function CompassFitPanel({ results }: CompassFitPanelProps): JSX.Element | null {
  const { parameters, setParameter } = useParameterStore();
  const [busy, setBusy] = useState(false);

  const slots = useMemo(
    () => readCompassSlots((name) => parameters.get(name)?.value as number | undefined),
    [parameters],
  );
  const present = slots.filter((s) => s.detected);

  const fitnessFor = (slot: CompassSlot): number | null => {
    const hit = results.find((r) => r.compass === slot.index - 1);
    return hit ? hit.fitness : null;
  };

  const compassUseParam = (slot: CompassSlot) =>
    slot.index === 1 ? 'COMPASS_USE' : `COMPASS_USE${slot.index}`;

  const toggleUse = async (slot: CompassSlot) => {
    setBusy(true);
    try {
      await setParameter(compassUseParam(slot), slot.used ? 0 : 1);
    } finally {
      setBusy(false);
    }
  };

  /** Priority is an ordered list of device ids, so promoting swaps two ids. */
  const move = async (slot: CompassSlot, direction: -1 | 1) => {
    const order = [1, 2, 3]
      .map((i) => ({ slotPrio: i, id: (parameters.get(`COMPASS_PRIO${i}_ID`)?.value as number) ?? 0 }))
      .filter((p) => p.id !== 0);
    const at = order.findIndex((p) => p.id === slot.devId);
    const to = at + direction;
    if (at < 0 || to < 0 || to >= order.length) return;
    setBusy(true);
    try {
      const ids = order.map((p) => p.id);
      [ids[at], ids[to]] = [ids[to]!, ids[at]!];
      for (let i = 0; i < ids.length; i++) {
        await setParameter(`COMPASS_PRIO${i + 1}_ID`, ids[i]!);
      }
    } finally {
      setBusy(false);
    }
  };

  if (present.length === 0) return null;

  const ordered = [...present].sort((a, b) => (a.priority ?? 99) - (b.priority ?? 99));

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-content uppercase tracking-wide">Compass fit</h4>

      {ordered.map((slot) => {
        const fitness = fitnessFor(slot);
        const assessment = fitness === null ? null : assessCompassFitness(fitness);
        const pct = fitness === null
          ? 0
          : Math.max(4, Math.min(100, (1 - fitness / FITNESS_FULL_SCALE) * 100));
        return (
          <div key={slot.devId} className="rounded-lg border border-subtle bg-surface p-3">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm text-content">
                    {slot.external ? 'External compass' : 'Onboard compass'}
                  </span>
                  <span className="rounded bg-surface-overlay px-1.5 py-0.5 font-mono text-[10px] text-content-tertiary">
                    id {slot.devId}
                  </span>
                  {slot.firstUsable && (
                    <span className="rounded bg-cyan-500/20 px-1.5 py-0.5 text-[10px] text-cyan-700 dark:text-cyan-300">
                      used for heading
                    </span>
                  )}
                </div>
                <div className="mt-0.5 text-[11px] text-content-tertiary">
                  {fitness === null
                    ? 'Not calibrated in this run, keeping its previous values'
                    : `fitness ${fitness.toFixed(1)} mGauss`}
                </div>
              </div>

              <div className="flex shrink-0 flex-col items-end gap-1">
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => move(slot, -1)}
                    disabled={busy || slot.priority === 1}
                    data-tip="Higher priority: the EKF prefers this one"
                    className="rounded p-1 text-content-tertiary hover:text-content disabled:opacity-30"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => move(slot, 1)}
                    disabled={busy || slot.priority === ordered.length}
                    data-tip="Lower priority"
                    className="rounded p-1 text-content-tertiary hover:text-content disabled:opacity-30"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={() => toggleUse(slot)}
                    disabled={busy}
                    className={`ml-1 rounded-md px-2.5 py-1 text-[11px] transition-colors disabled:opacity-40 ${
                      slot.used
                        ? 'bg-emerald-500/20 text-emerald-700 dark:text-emerald-300'
                        : 'bg-content-tertiary/15 text-content-secondary ring-1 ring-inset ring-content-tertiary/30'
                    }`}
                  >
                    {slot.used ? 'In use' : 'Not used'}
                  </button>
                </div>
                {assessment && (
                  <span className={`text-[10px] uppercase tracking-wide ${
                    assessment.verdict === 'good'
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : assessment.verdict === 'marginal'
                        ? 'text-amber-600 dark:text-amber-400'
                        : 'text-red-600 dark:text-red-400'
                  }`}>
                    {assessment.verdict === 'good' ? 'good' : assessment.verdict === 'marginal' ? 'usable' : 'poor'}
                  </span>
                )}
              </div>
            </div>

            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-inset">
              <div
                className={`h-full transition-all ${assessment ? barColour(assessment.verdict) : 'bg-content-tertiary/30'}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}

      <p className="text-[11px] text-content-tertiary">
        Keep the compass in the best position rather than the best score: an onboard one sits in the
        battery's field, which moves with current draw and no calibration corrects that.
      </p>
    </div>
  );
}
