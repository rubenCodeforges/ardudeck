/**
 * Multi-vehicle connection tab. Build-for-idiots: one button turns multi-vehicle ON, which
 * spawns the local orchestrator engine (the desktop auto-connects to it) and vehicles appear
 * as their heartbeats arrive - no ports, no transports, no URLs. Adding a radio / internet
 * drone / second ground station is a friendly picker. The raw UDP/TCP/Server controls live
 * under Advanced for power users.
 */

import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { DraftNumberInput } from '../../hooks/useNumericDraft';
import { useOrchestratorEngineStore } from '../../stores/orchestrator-engine-store';
import { useOrchestrationStore } from '../../stores/orchestration-store';
import { useFleetVehicles, selectActiveVehicle } from '../../hooks/useFleet';
import type { OrchestratorSource } from '../../../shared/ipc-channels';
import type { SerialPortInfo } from '../../stores/firmware-store';
import { LinksManager } from './LinksManager';
import { HeartbeatDot } from '../fleet/HeartbeatDot';
import { STATE_COLORS, getModeCategoryVar } from '../map/tactical-icon-pool';

/** Friendly label for a source's bearer, used in the vehicle list and source chips. */
function bearerLabel(t: TFunction, bearer: string): string {
  switch (bearer) {
    case 'udp': return t('connection:multiVehicle.bearerNetwork');
    case 'tcp': return t('connection:multiVehicle.bearerInternet');
    case 'serial': return t('connection:multiVehicle.bearerRadio');
    case 'cellular': return t('connection:multiVehicle.bearerCellular');
    case 'peer': return t('connection:multiVehicle.bearerPeer');
    default: return bearer;
  }
}

function DiscoveredVehicles({ bearerBySysid }: { bearerBySysid: Map<number, string> }) {
  const { t } = useTranslation();
  const vehicles = useFleetVehicles();
  if (vehicles.length === 0) {
    return (
      <p className="text-xs text-content-tertiary">
        {t('connection:multiVehicle.listeningEmpty')}
      </p>
    );
  }
  return (
    <div className="rounded-lg border border-subtle overflow-hidden">
      {[...vehicles].sort((a, b) => a.sysid - b.sysid).map((v) => {
        const bearer = bearerBySysid.get(v.sysid);
        return (
          <button
            key={v.key}
            onClick={() => selectActiveVehicle(v.key, v.transportId)}
            aria-pressed={v.isActive}
            className={`w-full flex items-center gap-2 pr-3 py-2 border-b border-l-2 border-b-subtle last:border-b-0 text-left transition-colors ${
              v.isActive ? 'pl-2.5 border-l-cyan-400 bg-cyan-500/10' : 'pl-2.5 border-l-transparent hover:bg-surface-raised'
            }`}
          >
            <span
              className="shrink-0 w-2.5 h-2.5 rounded-full"
              style={{ background: STATE_COLORS[v.state].fill, boxShadow: `0 0 0 2px ${STATE_COLORS[v.state].border}` }}
            />
            <span className="font-mono text-xs font-semibold text-content w-14 shrink-0">{v.label}</span>
            <span className="text-[10px] uppercase tracking-wide text-content-tertiary w-12 shrink-0">{v.vehicleClass}</span>
            <span className="font-mono text-[11px] truncate flex-1" style={{ color: getModeCategoryVar(v.mode) }}>{v.mode}</span>
            {bearer && <span className="text-[10px] uppercase tracking-wide text-content-tertiary shrink-0">{bearerLabel(t, bearer)}</span>}
            {v.armed && <span className="text-[10px] font-semibold text-orange-400">{t('connection:multiVehicle.armed')}</span>}
            <HeartbeatDot lastUpdate={v.lastUpdate} />
          </button>
        );
      })}
    </div>
  );
}

/** The "Add a vehicle" mini-form: pick how the vehicle connects, fill a field or two. */
function AddVehicle({ onAdd, busy }: { onAdd: (s: OrchestratorSource) => void; busy: boolean }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<'serial' | 'tcp' | 'cellular' | 'peer'>('serial');
  const [ports, setPorts] = useState<SerialPortInfo[]>([]);
  const [serialPath, setSerialPath] = useState('');
  const [baud, setBaud] = useState(57600);
  const [host, setHost] = useState('');
  const [tcpPort, setTcpPort] = useState(5760);
  const [cellProto, setCellProto] = useState<'udp' | 'tcp'>('udp');
  const [cellPort, setCellPort] = useState(14560);
  const [wsUrl, setWsUrl] = useState('ws://');

  useEffect(() => {
    if (open && kind === 'serial') {
      window.electronAPI.listPorts?.().then((p) => {
        setPorts(p);
        if (p[0] && !serialPath) setSerialPath(p[0].path);
      }).catch(() => undefined);
    }
  }, [open, kind, serialPath]);

  const submit = () => {
    let src: OrchestratorSource | null = null;
    if (kind === 'serial' && serialPath) src = { kind: 'serial', path: serialPath, baud };
    else if (kind === 'tcp' && host) src = { kind: 'tcp', host, port: tcpPort };
    else if (kind === 'cellular' && cellPort) src = { kind: 'cellular', proto: cellProto, port: cellPort };
    else if (kind === 'peer' && wsUrl.startsWith('ws')) src = { kind: 'peer', url: wsUrl };
    if (src) { onAdd(src); setOpen(false); setHost(''); setWsUrl('ws://'); }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-dashed border-subtle hover:border-cyan-500/40 hover:bg-surface-raised transition-colors px-3 py-2.5 text-sm text-content-secondary"
      >
        <Trans i18nKey="connection:multiVehicle.addVehicle" components={{ muted: <span className="text-content-tertiary" /> }} />
      </button>
    );
  }

  const tab = (k: typeof kind, label: string) => (
    <button
      onClick={() => setKind(k)}
      className={`flex-1 px-2 py-1.5 text-xs rounded-md transition-colors ${kind === k ? 'bg-cyan-600 text-white' : 'text-content-secondary hover:bg-surface-raised'}`}
    >{label}</button>
  );
  const field = 'w-full rounded-md bg-surface border border-subtle px-2.5 py-1.5 text-sm text-content';

  return (
    <div className="rounded-lg border border-subtle p-3 space-y-3">
      <div className="flex flex-wrap gap-1 bg-surface rounded-lg p-1">
        {tab('serial', t('connection:multiVehicle.tabRadio'))}
        {tab('tcp', t('connection:multiVehicle.tabInternet'))}
        {tab('cellular', t('connection:multiVehicle.tabCellular'))}
        {tab('peer', t('connection:multiVehicle.tabPeer'))}
      </div>

      {kind === 'serial' && (
        <div className="flex gap-2">
          <select className={field} value={serialPath} onChange={(e) => setSerialPath(e.target.value)}>
            {ports.length === 0 && <option value="">{t('connection:multiVehicle.noRadios')}</option>}
            {ports.map((p) => <option key={p.path} value={p.path}>{p.friendlyName || p.path}</option>)}
          </select>
          <DraftNumberInput className={`${field} w-24`} value={baud} min={1200} integer onCommit={setBaud} />
        </div>
      )}
      {kind === 'tcp' && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <input className={field} placeholder={t('connection:multiVehicle.addressPlaceholder')} value={host} onChange={(e) => setHost(e.target.value)} />
            <DraftNumberInput className={`${field} w-24`} value={tcpPort} min={1} max={65535} integer onCommit={setTcpPort} />
          </div>
          <p className="text-[10px] text-content-tertiary">{t('connection:multiVehicle.tcpHint')}</p>
        </div>
      )}
      {kind === 'cellular' && (
        <div className="space-y-1.5">
          <div className="flex gap-2">
            <div className="flex rounded-md bg-surface border border-subtle p-0.5 shrink-0">
              {(['udp', 'tcp'] as const).map((p) => (
                <button
                  key={p}
                  onClick={() => setCellProto(p)}
                  className={`px-2.5 py-1 text-xs rounded transition-colors ${cellProto === p ? 'bg-cyan-600 text-white' : 'text-content-secondary hover:bg-surface-raised'}`}
                >{p.toUpperCase()}</button>
              ))}
            </div>
            <DraftNumberInput className={`${field} w-24`} value={cellPort} min={1} max={65535} integer onCommit={setCellPort} />
          </div>
          <p className="text-[10px] text-content-tertiary">
            {t('connection:multiVehicle.cellularHint', {
              forwarder: cellProto === 'udp' ? 'mavproxy/mavlink-router udpout' : t('connection:multiVehicle.tcpClient'),
              port: cellPort || '…',
            })}
          </p>
        </div>
      )}
      {kind === 'peer' && ( // i18n-exempt
        <input className={field} placeholder="ws://other-ground-station:8790" value={wsUrl} onChange={(e) => setWsUrl(e.target.value)} />
      )}

      <div className="flex gap-2">
        <button onClick={submit} disabled={busy} className="flex-1 rounded-md bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white text-sm py-1.5">{t('common:add')}</button>
        <button onClick={() => setOpen(false)} className="rounded-md border border-subtle px-3 text-sm text-content-secondary hover:bg-surface-raised">{t('common:cancel')}</button>
      </div>
    </div>
  );
}

export function MultiVehiclePanel() {
  const { t } = useTranslation();
  const { isRunning, busy, sources, error, start, stop, addSource, removeSource, initListeners } = useOrchestratorEngineStore();
  const vehicles = useFleetVehicles();
  const servers = useOrchestrationStore((s) => s.servers);

  useEffect(() => initListeners(), [initListeners]);

  // Bearer per vehicle, from any connected server's roster (virtual sysid == fleet sysid).
  const bearerBySysid = useMemo(() => {
    const m = new Map<number, string>();
    Object.values(servers).forEach((srv) => srv.roster?.forEach((r) => m.set(r.virtualSysid, r.bearer)));
    return m;
  }, [servers]);

  // User-added sources (the invisible UDP listen defaults stay hidden).
  const userSources = useMemo(
    () => sources.map((s, i) => ({ s, i })).filter(({ s }) => s.kind !== 'udp'),
    [sources],
  );

  if (!isRunning) {
    return (
      <div className="space-y-4">
        <button
          onClick={start}
          disabled={busy}
          className="w-full rounded-xl bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 transition-colors px-4 py-5 text-center text-white shadow-lg shadow-cyan-900/20"
        >
          <div className="text-base font-semibold">{busy ? t('connection:multiVehicle.starting') : t('connection:multiVehicle.start')}</div>
          <div className="text-xs text-cyan-100/80 mt-1">{t('connection:multiVehicle.startHint')}</div>
        </button>
        {error && <p className="text-xs text-red-400">{error}</p>}
        <details className="group">
          <summary className="cursor-pointer text-xs text-content-tertiary hover:text-content-secondary list-none">{t('connection:multiVehicle.advancedSources')}</summary>
          <div className="mt-3"><LinksManager /></div>
        </details>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* ON status + stop - matches the soft cyan card pattern */}
      <div className="rounded-xl bg-cyan-600/10 border border-cyan-500/30 px-4 py-4 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-cyan-600/20 flex items-center justify-center shrink-0">
          <svg className="w-6 h-6 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.857 15.355-5.857 21.213 0" />
          </svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-content">{t('connection:multiVehicle.isOn')}</div>
          <div className="text-xs text-content-secondary">{t('connection:multiVehicle.vehiclesConnected', { count: vehicles.length })}</div>
        </div>
        <button onClick={stop} disabled={busy} className="rounded-md border border-subtle px-3 py-1.5 text-xs text-content-secondary hover:bg-surface-raised disabled:opacity-50">{t('common:stop')}</button>
      </div>

      {error && <p className="text-xs text-red-400">{error}</p>}

      {/* Vehicles */}
      <div>
        <div className="text-[11px] uppercase tracking-wide text-content-secondary mb-1.5">{t('connection:multiVehicle.vehiclesHeader', { count: vehicles.length })}</div>
        <DiscoveredVehicles bearerBySysid={bearerBySysid} />
      </div>

      {/* Added sources (radios / internet / peers) */}
      {userSources.length > 0 && (
        <div className="space-y-1.5">
          {userSources.map(({ s, i }) => (
            <div key={i} className="flex items-center gap-2 rounded-lg border border-subtle px-3 py-2 text-xs">
              <span className="uppercase tracking-wide text-content-tertiary w-16 shrink-0">{bearerLabel(t, s.kind)}</span>
              <span className="font-mono truncate flex-1 text-content-secondary">
                {s.kind === 'serial' ? `${s.path} @ ${s.baud}`
                  : s.kind === 'tcp' ? `${s.host}:${s.port}`
                  : s.kind === 'cellular' ? `${s.proto}in :${s.port}`
                  : s.kind === 'peer' ? s.url : ''}
              </span>
              <button onClick={() => removeSource(i)} disabled={busy} className="text-content-tertiary hover:text-red-400 disabled:opacity-50">{t('common:remove')}</button>
            </div>
          ))}
        </div>
      )}

      <AddVehicle onAdd={addSource} busy={busy} />

      {/* Advanced: raw link management for power users */}
      <details className="group">
        <summary className="cursor-pointer text-xs text-content-tertiary hover:text-content-secondary list-none">{t('connection:multiVehicle.advancedSources')}</summary>
        <div className="mt-3"><LinksManager /></div>
      </details>
    </div>
  );
}
