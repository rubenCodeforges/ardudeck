import { useEffect } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, SectionTitle } from '../../panels/panel-utils';
import type { NetworkInterface } from '@ardudeck/companion-types';
import { useTranslation } from 'react-i18next';

function InterfaceIcon({ type }: { type: string }) {
  if (type === 'wireless') {
    return (
      <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.14 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
    </svg>
  );
}

function SignalStrength({ signal }: { signal: number }) {
  // signal is in dBm, typically -30 (excellent) to -90 (weak)
  const quality = signal > -50 ? 4 : signal > -60 ? 3 : signal > -70 ? 2 : 1;
  const color = quality >= 3 ? 'bg-emerald-400' : quality >= 2 ? 'bg-yellow-400' : 'bg-red-400';

  return (
    <div className="flex items-end gap-0.5 h-4">
      {[1, 2, 3, 4].map((level) => (
        <div
          key={level}
          className={`w-1 rounded-sm ${level <= quality ? color : 'bg-surface-raised'}`}
          style={{ height: `${level * 25}%` }}
        />
      ))}
      <span className="text-[10px] text-content-secondary ml-1">{signal} dBm</span>
    </div>
  );
}

function InterfaceCard({ iface }: { iface: NetworkInterface }) {
  const { t } = useTranslation();
  return (
    <div className="p-2.5 bg-surface-raised rounded-lg space-y-1.5">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <InterfaceIcon type={iface.type} />
          <span className="text-sm text-content font-medium">{iface.name}</span>
          <span className="text-[10px] text-content-tertiary px-1.5 py-0.5 bg-surface-raised rounded">
            {iface.type}
          </span>
        </div>
        {iface.speed > 0 && (
          <span className="text-[10px] text-content-secondary">{iface.speed} Mbps{/* i18n-exempt */}</span>
        )}
      </div>

      <div className="space-y-0.5 text-xs">
        {iface.ip4 && (
          <div className="flex justify-between">
            {/* i18n-exempt */}
            <span className="text-content-secondary">IPv4</span>
            <span className="text-content font-mono">{iface.ip4}</span>
          </div>
        )}
        {iface.ip6 && (
          <div className="flex justify-between">
            {/* i18n-exempt */}
            <span className="text-content-secondary">IPv6</span>
            <span className="text-content font-mono text-[10px] truncate max-w-[200px]">{iface.ip6}</span>
          </div>
        )}
        {iface.mac && (
          <div className="flex justify-between">
            <span className="text-content-secondary">MAC</span>
            <span className="text-content-secondary font-mono text-[10px]">{iface.mac}</span>
          </div>
        )}
        {iface.ssid && (
          <div className="flex justify-between">
            <span className="text-content-secondary">SSID</span>
            <span className="text-content">{iface.ssid}</span>
          </div>
        )}
        {iface.signal !== undefined && iface.signal !== 0 && (
          <div className="flex justify-between items-center">
            <span className="text-content-secondary">{t('common:signal')}</span>
            <SignalStrength signal={iface.signal} />
          </div>
        )}
      </div>
    </div>
  );
}

export function NetworkPanel() {
  const { t } = useTranslation();
  const network = useCompanionStore((s) => s.network);
  const setNetwork = useCompanionStore((s) => s.setNetwork);
  const connectionState = useCompanionStore((s) => s.connectionState);

  // Fetch network info on mount and periodically
  useEffect(() => {
    if (connectionState.state !== 'connected') return;

    const fetchNetwork = async () => {
      try {
        const data = await window.electronAPI.companionGetNetwork();
        setNetwork(data);
      } catch {
        // Agent may not be reachable
      }
    };

    fetchNetwork();
    const interval = setInterval(fetchNetwork, 10000);
    return () => clearInterval(interval);
  }, [connectionState.state, setNetwork]);

  if (!network) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:network.none')}</div>
          <div>{t('companion:waitingAgent')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer>
      <div className="space-y-3">
        <SectionTitle>{t('companion:network.interfaces')}</SectionTitle>
        {network.interfaces.length === 0 ? (
          <div className="text-xs text-content-tertiary text-center py-4">
            {t('companion:network.noInterfaces')}
          </div>
        ) : (
          <div className="space-y-2">
            {network.interfaces.map((iface) => (
              <InterfaceCard key={iface.name} iface={iface} />
            ))}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
