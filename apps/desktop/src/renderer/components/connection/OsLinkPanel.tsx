/**
 * OsLinkPanel: the connection sidebar on ArduDeck OS.
 *
 * There the operating system owns the vehicle link (os-linkd), and this app is
 * one of its clients next to the desktop instruments. So the sidebar shows the
 * system link instead of a connect form, and switching links goes through the
 * OS for everyone. Nothing here can open a port or radio the OS is using.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cable, Check, Radio, Settings2, Usb, Wifi } from 'lucide-react';
import { useOsIntegrationStore } from '../../stores/os-integration-store';
import { useConnectionStore } from '../../stores/connection-store';
import type { OsConnection, OsDiscoveredVehicle } from '../../../shared/ardudeck-os-types';

function ConnectionIcon({ type }: { type: OsConnection['type'] }): JSX.Element {
  const cls = 'w-4 h-4 shrink-0';
  if (type === 'serial') return <Usb className={cls} />;
  if (type === 'tcp') return <Cable className={cls} />;
  return <Wifi className={cls} />;
}

function describe(c: OsConnection): string {
  switch (c.type) {
    case 'udp-listen': return `UDP :${c.port}`;
    case 'udp-peer': return `UDP ${c.host}:${c.port}`;
    case 'tcp': return `TCP ${c.host}:${c.port}`;
    case 'serial': return `${c.path} · ${c.baudRate}`;
  }
}

export function OsLinkPanel(): JSX.Element {
  const { t } = useTranslation();
  const links = useOsIntegrationStore((s) => s.links);
  const setActiveLink = useOsIntegrationStore((s) => s.setActiveLink);
  const connectDiscovered = useOsIntegrationStore((s) => s.connectDiscovered);
  const openLinkSettings = useOsIntegrationStore((s) => s.openLinkSettings);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const active = links?.connections.find((c) => c.id === links.activeId) ?? null;
  const vehicleUp = connectionState.isConnected;
  const state: { label: string; tone: 'good' | 'warn' | 'bad' | 'dim' } = !links
    ? { label: t('connection:osLink.serviceDown'), tone: 'bad' }
    : !links.enabled
      ? { label: t('connection:osLink.off'), tone: 'dim' }
      : vehicleUp
        ? { label: t('connection:osLink.connected', { vehicle: [connectionState.autopilot, connectionState.vehicleType].filter(Boolean).join(' ') || t('connection:osLink.vehicle') }), tone: 'good' }
        : links.link.error
          ? { label: links.link.error, tone: 'bad' }
          : { label: t('connection:osLink.searching'), tone: 'warn' };
  const toneDot = { good: 'bg-emerald-400', warn: 'bg-amber-400 animate-pulse', bad: 'bg-red-400', dim: 'bg-content-tertiary' }[state.tone];

  const choose = async (id: string): Promise<void> => {
    if (!links || id === links.activeId) return;
    setPending(id);
    setError(null);
    const result = await setActiveLink(id);
    if (!result.success) setError(result.error ?? t('connection:osLink.switchFailed'));
    setPending(null);
  };

  const newDevices = (links?.detected ?? []).filter((d) => d.verified && !links?.connections.some((c) => c.path === d.path));
  const discovered = links?.discovered ?? [];

  const connect = async (vehicle: OsDiscoveredVehicle) => {
    setPending(vehicle.id);
    setError(null);
    const result = await connectDiscovered(vehicle);
    if (!result.success) setError(result.error ?? t('connection:osLink.switchFailed'));
    setPending(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-5 py-4 border-b border-subtle">
        <h2 className="text-base font-semibold text-content flex items-center gap-2">
          <Radio className="w-5 h-5 text-teal-400" />
          {t('connection:osLink.title')}
        </h2>
        <p className="text-xs text-content-tertiary mt-1">{t('connection:osLink.managedBy')}</p>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        <div className="rounded-lg border border-subtle bg-surface p-4 space-y-1">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${toneDot}`} />
            <span className="text-sm font-medium text-content">{state.label}</span>
          </div>
          {active && links?.enabled && (
            <div className="text-xs text-content-secondary pl-4">{t('connection:osLink.via', { name: active.name })}</div>
          )}
        </div>

        {links && links.connections.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{t('connection:osLink.connections')}</div>
            {links.connections.map((c) => {
              const isActive = c.id === links.activeId;
              return (
                <button
                  key={c.id}
                  onClick={() => void choose(c.id)}
                  disabled={pending !== null}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border text-left transition-colors ${
                    isActive ? 'border-teal-500/40 bg-teal-500/10' : 'border-subtle hover:border-strong hover:bg-surface-raised'
                  }`}
                >
                  <ConnectionIcon type={c.type} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm text-content truncate">{c.name}</span>
                    <span className="block text-xs text-content-tertiary font-mono truncate">{describe(c)}</span>
                  </span>
                  {isActive && <Check className="w-4 h-4 text-teal-400" />}
                  {pending === c.id && <span className="text-xs text-content-tertiary">{t('connection:osLink.switching')}</span>}
                </button>
              );
            })}
            {error && <div className="text-xs text-red-400">{error}</div>}
          </div>
        )}

        {discovered.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wider text-content-tertiary">{t('connection:osLink.detected')}</div>
            {discovered.map((v) => (
              <div key={v.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg border border-subtle">
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-content truncate">{v.label}</span>
                  <span className="block text-xs text-content-tertiary font-mono truncate">
                    {t('connection:osLink.discoveredDetail', { sysid: v.sysid, host: v.connection.host, port: v.connection.port })}
                  </span>
                </span>
                <button
                  onClick={() => void connect(v)}
                  disabled={pending !== null}
                  className="px-3 py-1.5 rounded-md text-xs font-medium bg-teal-600 hover:bg-teal-500 text-white disabled:opacity-50"
                >
                  {pending === v.id ? t('connection:osLink.switching') : t('connection:osLink.connectTo')}
                </button>
              </div>
            ))}
          </div>
        )}

        {newDevices.length > 0 && (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-content-secondary">
            {t('connection:osLink.newDevices', { count: newDevices.length, label: newDevices[0]!.label })}
          </div>
        )}

        <button
          onClick={openLinkSettings}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-surface-raised border border-subtle hover:border-strong text-sm text-content transition-colors"
        >
          <Settings2 className="w-4 h-4" />
          {t('connection:osLink.openSettings')}
        </button>

        <p className="text-xs text-content-tertiary leading-relaxed">{t('connection:osLink.shared')}</p>
      </div>
    </div>
  );
}
