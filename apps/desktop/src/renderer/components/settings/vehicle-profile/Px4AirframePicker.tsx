/**
 * Px4AirframePicker - choose a PX4 airframe (SYS_AUTOSTART) for the connected
 * vehicle.
 *
 * PX4 selects its airframe with a single integer parameter, SYS_AUTOSTART, then
 * requires a reboot to apply. This renders a curated grid of common airframes
 * grouped by type; selecting one writes SYS_AUTOSTART via the parameter store
 * and surfaces a clear "reboot required to apply" notice.
 */

import { useMemo, useState } from 'react';
import { Check, AlertTriangle, Loader2 } from 'lucide-react';
import { useParameterStore } from '../../../stores/parameter-store.js';
import {
  PX4_AIRFRAMES,
  PX4_AIRFRAME_CATEGORIES,
  type Px4Airframe,
  type Px4AirframeCategory,
} from './px4-airframes.js';

export function Px4AirframePicker() {
  const setParameter = useParameterStore((s) => s.setParameter);
  const paramSize = useParameterStore((s) => s.parameters.size);
  const currentId = useParameterStore((s) => s.parameters.get('SYS_AUTOSTART')?.value);
  const canSet = useParameterStore((s) => s.parameters.has('SYS_AUTOSTART'));

  const [pending, setPending] = useState<number | null>(null);
  const [appliedId, setAppliedId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byCategory = useMemo(() => {
    const map = new Map<Px4AirframeCategory, Px4Airframe[]>();
    for (const af of PX4_AIRFRAMES) {
      const list = map.get(af.category) ?? [];
      list.push(af);
      map.set(af.category, list);
    }
    return map;
  }, []);

  const onSelect = async (af: Px4Airframe) => {
    if (!canSet || pending !== null) return;
    setError(null);
    setPending(af.id);
    const ok = await setParameter('SYS_AUTOSTART', af.id);
    setPending(null);
    if (ok) {
      setAppliedId(af.id);
    } else {
      setError(`Failed to write SYS_AUTOSTART (${af.id}). Check the connection and try again.`);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {!canSet && (
        <div className="bg-amber-500/10 rounded-xl border border-amber-500/30 p-4 text-sm text-amber-300">
          {paramSize > 0
            ? 'SYS_AUTOSTART was not found on this vehicle, so the airframe cannot be set from here.'
            : 'Connect to a PX4 vehicle and load parameters to select an airframe.'}
        </div>
      )}

      {appliedId !== null && (
        <div className="bg-emerald-500/10 rounded-xl border border-emerald-500/30 p-4 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-emerald-300">
              Airframe set (SYS_AUTOSTART = {appliedId}). Reboot required to apply.
            </p>
            <p className="text-xs text-emerald-400/80 mt-0.5">
              The new airframe takes effect only after the flight controller restarts.
            </p>
          </div>
        </div>
      )}

      {error && (
        <div className="bg-red-500/10 rounded-xl border border-red-500/30 p-4 text-sm text-red-300">
          {error}
        </div>
      )}

      {PX4_AIRFRAME_CATEGORIES.map((cat) => {
        const list = byCategory.get(cat.id);
        if (!list || list.length === 0) return null;
        return (
          <section key={cat.id}>
            <h3 className="text-xs uppercase tracking-wide text-content-tertiary mb-2">{cat.label}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((af) => {
                const selected = currentId === af.id || appliedId === af.id;
                const isPending = pending === af.id;
                return (
                  <button
                    key={af.id}
                    onClick={() => onSelect(af)}
                    disabled={!canSet || pending !== null}
                    className={`p-4 rounded-xl border text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/30'
                        : 'border-subtle bg-surface hover:bg-blue-500/5 hover:border-blue-500/40'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-sm font-medium text-content">{af.name}</div>
                      {isPending ? (
                        <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
                      ) : selected ? (
                        <Check className="w-4 h-4 text-blue-400 shrink-0" />
                      ) : null}
                    </div>
                    <div className="text-xs text-content-secondary mt-0.5">{af.description}</div>
                    <div className="text-[10px] text-content-tertiary mt-2 font-mono">
                      SYS_AUTOSTART {af.id}
                    </div>
                  </button>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
