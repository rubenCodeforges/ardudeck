/**
 * Links manager - add and remove extra vehicle connections beyond the primary.
 *
 * The primary connection (the main Connect button) carries its vehicles already.
 * This adds *additional* links: a background MAVLink link (a second UDP/TCP feed)
 * or an orchestration server (channel-framed WebSocket with MAVLink passthrough).
 * Vehicles discovered on any link appear in the fleet automatically.
 *
 * Shown in the connection panel once a primary connection exists.
 */

import { useEffect, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import type { TransportInfoIpc } from '../../../shared/ipc-channels';
import { OrchestrationPanel } from './OrchestrationPanel';

type AddKind = 'udp' | 'tcp' | 'orchestration';

const KINDS: { id: AddKind; label?: string; labelKey?: string }[] = [
  { id: 'udp', label: 'UDP' },
  { id: 'tcp', label: 'TCP' },
  { id: 'orchestration', labelKey: 'connection:linksManager.kindServer' },
];

export function LinksManager() {
  const { t } = useTranslation();
  const [transports, setTransports] = useState<TransportInfoIpc[]>([]);
  const [kind, setKind] = useState<AddKind>('udp');
  const [host, setHost] = useState('127.0.0.1');
  const [port, setPort] = useState('14551');
  const [url, setUrl] = useState('wss://');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.electronAPI?.listTransports?.().then(setTransports).catch(() => undefined);
  }, []);

  useEffect(() => {
    refresh();
    const offD = window.electronAPI?.onVehicleDiscovered?.(() => refresh());
    const offL = window.electronAPI?.onVehicleLost?.(() => refresh());
    const interval = setInterval(refresh, 3000);
    return () => { offD?.(); offL?.(); clearInterval(interval); };
  }, [refresh]);

  const add = async () => {
    setBusy(true);
    setError(null);
    try {
      if (kind === 'orchestration') {
        await window.electronAPI?.addOrchestrationLink?.(url, token || undefined);
      } else {
        const p = parseInt(port, 10);
        await window.electronAPI?.addTransport?.(
          kind === 'tcp'
            ? { type: 'tcp', host, tcpPort: p }
            : { type: 'udp', udpPort: p },
        );
      }
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : t('connection:linksManager.addFailed'));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await window.electronAPI?.removeTransport?.(id);
      refresh();
    } catch {
      // primary refuses removal; ignore
    }
  };

  return (
    <div>
      <span className="text-[11px] uppercase tracking-wide text-content-secondary">{t('connection:linksManager.sources')}</span>

      {/* Existing transports */}
      {transports.length > 0 && (
        <div className="mt-2 space-y-1.5">
          {transports.map((tr) => (
            <div
              key={tr.id}
              className="flex items-center gap-2 rounded-lg border border-subtle bg-surface px-3 py-2"
            >
              <span className="font-mono text-xs text-content truncate flex-1">{tr.label}</span>
              <span className="text-[11px] text-content-tertiary shrink-0">
                {t('connection:linksManager.vehicleCount', { count: tr.vehicleCount })}
              </span>
              {tr.isPrimary ? (
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-surface-raised text-content-tertiary shrink-0">
                  {t('connection:linksManager.primary')}
                </span>
              ) : (
                <button
                  onClick={() => remove(tr.id)}
                  className="text-[11px] text-red-400 hover:text-red-300 transition-colors shrink-0"
                >
                  {t('common:remove')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Add a link */}
      <div className="mt-3 rounded-xl border border-subtle bg-surface p-3 space-y-3">
        <div className="text-[11px] uppercase tracking-wide text-content-secondary">{t('connection:linksManager.addSourceTitle')}</div>

        {/* Kind selector - segmented control matching the single-vehicle protocol toggle */}
        <div className="flex rounded-lg overflow-hidden border border-subtle">
          {KINDS.map((k, i) => (
            <button
              key={k.id}
              onClick={() => setKind(k.id)}
              className={`flex-1 px-3 py-1.5 text-xs font-medium transition-colors ${
                kind === k.id
                  ? 'bg-blue-600/30 text-blue-300'
                  : 'text-content-secondary hover:text-content hover:bg-surface-raised'
              } ${i < KINDS.length - 1 ? 'border-r border-subtle' : ''}`}
            >
              {k.labelKey ? t(k.labelKey) : k.label}
            </button>
          ))}
        </div>

        {kind === 'orchestration' ? (
          <>
            <div>
              <label className="label">{t('connection:linksManager.serverUrl')}</label>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="wss://server.example.com" // i18n-exempt
                className="input"
              />
            </div>
            <div>
              <label className="label">{t('connection:linksManager.tokenOptional')}</label>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder={t('connection:linksManager.accessToken')}
                className="input"
              />
            </div>
          </>
        ) : (
          <div className="flex gap-2">
            {kind === 'tcp' && (
              <div className="flex-1">
                <label className="label">{t('connection:linksManager.host')}</label>
                <input
                  value={host}
                  onChange={(e) => setHost(e.target.value)}
                  placeholder="127.0.0.1"
                  className="input"
                />
              </div>
            )}
            <div className={kind === 'tcp' ? 'w-24' : 'flex-1'}>
              <label className="label">{t('common:port')}</label>
              <input
                value={port}
                onChange={(e) => setPort(e.target.value)}
                placeholder="14551"
                className="input"
                inputMode="numeric"
              />
            </div>
          </div>
        )}

        <button onClick={add} disabled={busy} className="btn btn-primary w-full">
          {busy ? t('connection:linksManager.adding') : t('connection:linksManager.addSource')}
        </button>

        {error && <p className="text-[11px] text-red-400">{error}</p>}
      </div>

      <OrchestrationPanel />
    </div>
  );
}
