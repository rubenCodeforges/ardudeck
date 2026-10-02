import type { TFunction } from 'i18next';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, StatRow } from '../../panels/panel-utils';
import { useTranslation } from 'react-i18next';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatTimeSince(timestamp: number, t: TFunction): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return t('companion:status.justNow');
  if (seconds < 60) return t('companion:status.secondsAgo', { n: seconds });
  return t('companion:containers.ageMinutes', { n: Math.floor(seconds / 60) });
}

export function StatusPanel() {
  const { t } = useTranslation();
  const connectionState = useCompanionStore((s) => s.connectionState);
  const heartbeatOnline = useCompanionStore((s) => s.heartbeatOnline);
  const lastHeartbeat = useCompanionStore((s) => s.lastHeartbeat);
  const companionType = useCompanionStore((s) => s.companionType);
  const systemInfo = useCompanionStore((s) => s.systemInfo);

  const isConnected = connectionState.state === 'connected';
  const isReconnecting = connectionState.state === 'reconnecting';

  const statusColor = isConnected
    ? 'bg-emerald-400'
    : isReconnecting
    ? 'bg-yellow-400 animate-pulse'
    : heartbeatOnline
    ? 'bg-blue-400'
    : 'bg-gray-600';

  const statusLabel = isConnected
    ? t('common:connected')
    : isReconnecting
    ? t('companion:status.reconnecting', { attempt: connectionState.reconnectAttempt })
    : heartbeatOnline
    ? t('companion:status.mavlinkOnly')
    : t('companion:status.offline');

  const statusTextColor = isConnected
    ? 'text-emerald-400'
    : isReconnecting
    ? 'text-yellow-400'
    : heartbeatOnline
    ? 'text-blue-400'
    : 'text-content-secondary';

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Connection status indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColor} shrink-0`} />
          <div>
            <div className={`text-sm font-medium ${statusTextColor}`}>{statusLabel}</div>
            {connectionState.host && (
              <div className="text-xs text-content-secondary">{connectionState.host}:{connectionState.port}</div>
            )}
          </div>
        </div>

        {/* Version mismatch warning */}
        {connectionState.versionMismatch && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
            {t('companion:status.versionMismatch')}
          </div>
        )}

        {/* System info section */}
        <div className="space-y-1">
          {systemInfo ? (
            <>
              <StatRow label={t('companion:status.hostname')} value={systemInfo.hostname} />
              <StatRow label="OS" value={systemInfo.os} />
              <StatRow label={t('companion:status.architecture')} value={systemInfo.arch} />
              <StatRow label={t('companion:status.uptime')} value={formatUptime(systemInfo.uptime)} />
              <StatRow label={t('companion:status.agentVersion')} value={systemInfo.agentVersion} />
              {systemInfo.dockerAvailable && (
                // i18n-exempt: product name
                <StatRow label="Docker" value={t('companion:status.available')} />
              )}
              {systemInfo.blueosDetected && (
                // i18n-exempt: product name
                <StatRow label="BlueOS" value={t('companion:status.detected')} />
              )}
            </>
          ) : heartbeatOnline ? (
            <>
              <StatRow label={t('common:source')} value={t('companion:status.mavlinkHeartbeat')} />
              {companionType && <StatRow label={t('common:type')} value={companionType} />}
              {lastHeartbeat && (
                <StatRow label={t('companion:status.lastSeen')} value={formatTimeSince(lastHeartbeat, t)} />
              )}
              <div className="mt-3 p-2 bg-surface-raised rounded text-xs text-content-secondary">
                {t('companion:status.installAgent')}
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-20 text-content-tertiary text-xs">
              {t('companion:status.none')}
            </div>
          )}
        </div>
      </div>
    </PanelContainer>
  );
}
