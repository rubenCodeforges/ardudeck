/**
 * Group command bar for the fleet strip. Acts on the multi-selected vehicles by
 * fanning out a per-vehicle command to each (client-side fan-out, not
 * coordination). Destructive actions confirm first. Shown only when at least one
 * vehicle is selected.
 */

import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import type { VehicleCommand } from '../../../shared/ipc-channels';

type PendingConfirm = { message: string; cmd: VehicleCommand } | null;

export function FleetGroupActions() {
  const { t } = useTranslation();
  const selected = useActiveVehicleStore((s) => s.selectedVehicleKeys);
  const setSelected = useActiveVehicleStore((s) => s.setSelected);
  const [pending, setPending] = useState<PendingConfirm>(null);
  const [busy, setBusy] = useState(false);

  if (selected.length === 0) return null;

  const fanOut = async (cmd: VehicleCommand) => {
    setBusy(true);
    try {
      await Promise.all(selected.map((key) => window.electronAPI?.vehicleCommand?.(key, cmd)));
    } finally {
      setBusy(false);
      setPending(null);
    }
  };

  const confirmThen = (message: string, cmd: VehicleCommand) => setPending({ message, cmd });

  const btn = 'px-2 py-1 text-[11px] rounded bg-surface-raised hover:bg-surface-solid text-content transition-colors disabled:opacity-50';

  return (
    <div className="border-t border-subtle p-2 flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-content-secondary">
          {t('fleet:fleetGroupActions.selected', { count: selected.length })}
        </span>
        <button onClick={() => setSelected([])} className="text-[10px] text-content-tertiary hover:text-content">
          {t('common:clear')}
        </button>
      </div>

      {pending ? (
        <div className="flex flex-col gap-1.5 rounded bg-surface p-2 border border-subtle">
          <span className="text-[11px] text-content">{pending.message}</span>
          <div className="flex gap-1.5">
            <button disabled={busy} onClick={() => fanOut(pending.cmd)} className={`${btn} bg-red-600/80 hover:bg-red-600 text-white`}>
              {t('common:confirm')}
            </button>
            <button disabled={busy} onClick={() => setPending(null)} className={btn}>{t('common:cancel')}</button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-1.5">
          <button disabled={busy} className={btn} onClick={() => confirmThen(t('fleet:fleetGroupActions.confirmArm', { count: selected.length }), { kind: 'arm' })}>{t('fleet:fleetGroupActions.arm')}</button>
          <button disabled={busy} className={btn} onClick={() => confirmThen(t('fleet:fleetGroupActions.confirmDisarm', { count: selected.length }), { kind: 'disarm' })}>{t('common:disarm')}</button>
          <button disabled={busy} className={btn} onClick={() => confirmThen(t('fleet:fleetGroupActions.confirmRtl', { count: selected.length }), { kind: 'rtl' })}>RTL</button>
          <button disabled={busy} className={btn} onClick={() => confirmThen(t('fleet:fleetGroupActions.confirmStart', { count: selected.length }), { kind: 'mission-start' })}>{t('fleet:fleetGroupActions.start')}</button>
        </div>
      )}
    </div>
  );
}
