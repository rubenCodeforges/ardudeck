/**
 * Orchestration panel - for each connected orchestration server, shows its
 * advertised capabilities and lets the operator submit a group intent targeting
 * the multi-selected fleet vehicles. Intent acks / status stream back and are
 * shown inline. Renders nothing until a server has sent its `welcome`.
 *
 * This is the operator end of the coordination seam: the desktop submits intent,
 * the server executes it.
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOrchestrationStore } from '../../stores/orchestration-store';
import { useActiveVehicleStore } from '../../stores/active-vehicle-store';
import { useFleetVehicles } from '../../hooks/useFleet';

export function OrchestrationPanel() {
  const { t } = useTranslation();
  const servers = useOrchestrationStore((s) => s.servers);
  const selectedVehicleKeys = useActiveVehicleStore((s) => s.selectedVehicleKeys);
  const vehicles = useFleetVehicles();
  const list = Object.values(servers);

  if (list.length === 0) return null;

  const selectedSysids = vehicles.filter((v) => selectedVehicleKeys.includes(v.key)).map((v) => v.sysid);

  return (
    <div className="mt-3 pt-3 border-t border-subtle flex flex-col gap-2">
      <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('connection:orchestration.title')}</span>
      {list.map((srv) => (
        <ServerCard key={srv.transportId} transportId={srv.transportId} selectedSysids={selectedSysids} />
      ))}
    </div>
  );
}

function ServerCard({ transportId, selectedSysids }: { transportId: string; selectedSysids: number[] }) {
  const { t } = useTranslation();
  const srv = useOrchestrationStore((s) => s.servers[transportId]);
  const [kind, setKind] = useState<string>('');
  const [busy, setBusy] = useState(false);

  if (!srv) return null;
  const caps = srv.capabilities;
  const chosen = kind || caps[0] || '';

  const submit = async () => {
    if (!chosen) return;
    setBusy(true);
    try {
      await window.electronAPI?.submitIntent?.(transportId, {
        kind: chosen,
        vehicleSysids: selectedSysids.length > 0 ? selectedSysids : undefined,
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="rounded-lg border border-subtle bg-surface p-2.5">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-content">{srv.serverName}</span>
        <span className="text-[10px] text-content-tertiary font-mono">{srv.serverVersion}</span>
      </div>

      {caps.length === 0 ? (
        <p className="mt-1 text-[10px] text-content-tertiary">{t('connection:orchestration.noCapabilities')}</p>
      ) : (
        <div className="mt-2 flex items-end gap-2">
          <select
            value={chosen}
            onChange={(e) => setKind(e.target.value)}
            className="select flex-1 py-1.5 text-xs"
          >
            {caps.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <button
            onClick={submit}
            disabled={busy}
            className="btn btn-secondary shrink-0 px-3 py-1.5 text-xs"
            data-tip={selectedSysids.length > 0 ? t('connection:orchestration.targetSysids', { ids: selectedSysids.join(', ') }) : t('connection:orchestration.noSelection')}
          >
            {busy ? '...' : t('connection:orchestration.submit')}
          </button>
        </div>
      )}

      {srv.lastControl && (
        <p className="mt-1.5 text-[10px] font-mono text-content-secondary">
          {srv.lastControl.type}
          {srv.lastControl.state ? ` · ${srv.lastControl.state}` : ''}
          {srv.lastControl.message ? ` · ${srv.lastControl.message}` : ''}
        </p>
      )}
    </div>
  );
}
