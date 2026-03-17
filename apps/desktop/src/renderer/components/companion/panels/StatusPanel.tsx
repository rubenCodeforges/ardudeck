import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, StatRow } from '../../panels/panel-utils';

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m ${s}s`;
  return `${m}m ${s}s`;
}

function formatTimeSince(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.floor(seconds / 60)}m ago`;
}

export function StatusPanel() {
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
    ? 'Connected'
    : isReconnecting
    ? `Reconnecting (${connectionState.reconnectAttempt})`
    : heartbeatOnline
    ? 'MAVLink Only'
    : 'Offline';

  const statusTextColor = isConnected
    ? 'text-emerald-400'
    : isReconnecting
    ? 'text-yellow-400'
    : heartbeatOnline
    ? 'text-blue-400'
    : 'text-gray-500';

  return (
    <PanelContainer>
      <div className="space-y-4">
        {/* Connection status indicator */}
        <div className="flex items-center gap-3">
          <div className={`w-3 h-3 rounded-full ${statusColor} shrink-0`} />
          <div>
            <div className={`text-sm font-medium ${statusTextColor}`}>{statusLabel}</div>
            {connectionState.host && (
              <div className="text-xs text-gray-500">{connectionState.host}:{connectionState.port}</div>
            )}
          </div>
        </div>

        {/* Version mismatch warning */}
        {connectionState.versionMismatch && (
          <div className="p-2 bg-yellow-500/10 border border-yellow-500/30 rounded text-xs text-yellow-400">
            Agent version mismatch. Update your agent for full compatibility.
          </div>
        )}

        {/* System info section */}
        <div className="space-y-1">
          {systemInfo ? (
            <>
              <StatRow label="Hostname" value={systemInfo.hostname} />
              <StatRow label="OS" value={systemInfo.os} />
              <StatRow label="Architecture" value={systemInfo.arch} />
              <StatRow label="Uptime" value={formatUptime(systemInfo.uptime)} />
              <StatRow label="Agent Version" value={systemInfo.agentVersion} />
              {systemInfo.dockerAvailable && (
                <StatRow label="Docker" value="Available" />
              )}
              {systemInfo.blueosDetected && (
                <StatRow label="BlueOS" value="Detected" />
              )}
            </>
          ) : heartbeatOnline ? (
            <>
              <StatRow label="Source" value="MAVLink Heartbeat" />
              {companionType && <StatRow label="Type" value={companionType} />}
              {lastHeartbeat && (
                <StatRow label="Last Seen" value={formatTimeSince(lastHeartbeat)} />
              )}
              <div className="mt-3 p-2 bg-gray-800/50 rounded text-xs text-gray-500">
                Install the ArduDeck Agent on the companion for full monitoring.
              </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-20 text-gray-600 text-xs">
              No companion detected
            </div>
          )}
        </div>
      </div>
    </PanelContainer>
  );
}
