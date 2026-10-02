import { useEffect, useState, useCallback } from 'react';
import type { TFunction } from 'i18next';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, SectionTitle } from '../../panels/panel-utils';
import type { ContainerAction } from '@ardudeck/companion-types';
import { useTranslation } from 'react-i18next';

const CONTAINER_STATUS_COLORS: Record<string, { dot: string; text: string }> = {
  running: { dot: 'bg-emerald-400', text: 'text-emerald-400' },
  stopped: { dot: 'bg-gray-500', text: 'text-content-secondary' },
  restarting: { dot: 'bg-yellow-400 animate-pulse', text: 'text-yellow-400' },
  paused: { dot: 'bg-blue-400', text: 'text-blue-400' },
  exited: { dot: 'bg-red-400', text: 'text-red-400' },
  dead: { dot: 'bg-red-600', text: 'text-red-500' },
};

function formatAge(created: number, t: TFunction): string {
  const seconds = Math.floor((Date.now() - created) / 1000);
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  if (d > 0) return t('companion:containers.ageDays', { n: d });
  if (h > 0) return t('companion:containers.ageHours', { n: h });
  return t('companion:containers.ageMinutes', { n: Math.floor(seconds / 60) });
}

export function ContainersPanel() {
  const { t } = useTranslation();
  const containers = useCompanionStore((s) => s.containers);
  const setContainers = useCompanionStore((s) => s.setContainers);
  const connectionState = useCompanionStore((s) => s.connectionState);
  const systemInfo = useCompanionStore((s) => s.systemInfo);
  const isConnected = connectionState.state === 'connected';

  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [logsContainerId, setLogsContainerId] = useState<string | null>(null);
  const [containerLogs, setContainerLogs] = useState<string>('');
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchContainers = useCallback(async () => {
    if (!isConnected) return;
    try {
      const result = await window.electronAPI.companionGetContainers();
      setContainers(result);
    } catch {
      // Docker might not be available
    }
  }, [isConnected, setContainers]);

  useEffect(() => {
    fetchContainers();
    const interval = setInterval(fetchContainers, 10000);
    return () => clearInterval(interval);
  }, [fetchContainers]);

  const handleAction = async (id: string, action: ContainerAction) => {
    setActionInProgress(`${id}:${action}`);
    try {
      await window.electronAPI.companionContainerAction(id, action);
      setTimeout(fetchContainers, 1500);
    } catch {
      // Error handled silently
    } finally {
      setActionInProgress(null);
    }
  };

  const viewLogs = async (id: string) => {
    setLogsContainerId(id);
    setLogsLoading(true);
    try {
      const logs = await window.electronAPI.companionGetContainerLogs(id);
      setContainerLogs(logs);
    } catch {
      setContainerLogs(t('companion:containers.fetchLogsFailed'));
    } finally {
      setLogsLoading(false);
    }
  };

  const dockerAvailable = systemInfo?.dockerAvailable ?? false;

  if (!isConnected) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:containers.unavailable')}</div>
          <div>{t('companion:containers.unavailableHint')}</div>
        </div>
      </PanelContainer>
    );
  }

  if (!dockerAvailable && containers.length === 0) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:containers.noDocker')}</div>
          <div>{t('companion:containers.noDockerHint')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0 relative">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-subtle shrink-0">
        <SectionTitle>{t('companion:containers.title')}</SectionTitle>
        <div className="flex-1" />
        <span className="text-[10px] text-content-secondary">{t('companion:containers.count', { count: containers.length })}</span>
        <button
          onClick={fetchContainers}
          className="text-content-secondary hover:text-content transition-colors p-0.5"
          title={t('common:refresh')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Container list */}
      <div className="flex-1 overflow-auto">
        {containers.length === 0 ? (
          <div className="flex items-center justify-center h-full text-content-tertiary text-xs">
            {t('companion:containers.none')}
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {containers.map((container) => {
              const colors = CONTAINER_STATUS_COLORS[container.status] ?? CONTAINER_STATUS_COLORS['stopped']!;
              const isActing = actionInProgress?.startsWith(`${container.id}:`);

              return (
                <div key={container.id} className="px-3 py-2 hover:bg-surface-overlay-subtle transition-colors">
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                      <span className="text-xs text-content font-medium truncate">{container.name}</span>
                      <span className={`text-[10px] ${colors.text}`}>{container.status}</span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {isActing ? (
                        <span className="text-[10px] text-yellow-400 animate-pulse px-2">...</span>
                      ) : (
                        <>
                          {container.status !== 'running' && (
                            <button
                              onClick={() => handleAction(container.id, 'start')}
                              className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                            >
                              {t('common:start')}
                            </button>
                          )}
                          {container.status === 'running' && (
                            <button
                              onClick={() => handleAction(container.id, 'stop')}
                              className="px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20 rounded transition-colors"
                            >
                              {t('common:stop')}
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(container.id, 'restart')}
                            className="px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                          >
                            {t('companion:restart')}
                          </button>
                          <button
                            onClick={() => viewLogs(container.id)}
                            className="px-1.5 py-0.5 text-[10px] text-content-secondary hover:bg-surface-raised rounded transition-colors"
                          >
                            {t('companion:logs')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 text-[10px] text-content-secondary ml-4">
                    <span className="truncate">{container.image}</span>
                    <span>{formatAge(container.created, t)}</span>
                    {container.ports.length > 0 && (
                      <span className="font-mono">{container.ports.join(', ')}</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Container logs modal */}
      {logsContainerId && (
        <div className="absolute inset-0 bg-surface-overlay flex flex-col z-50">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-subtle shrink-0">
            <span className="text-xs text-content">
              {t('companion:containers.logsTitle', { name: containers.find((c) => c.id === logsContainerId)?.name ?? logsContainerId.slice(0, 12) })}
            </span>
            <button
              onClick={() => { setLogsContainerId(null); setContainerLogs(''); }}
              className="text-content-secondary hover:text-content transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-auto p-3">
            {logsLoading ? (
              <div className="text-content-secondary text-xs">{t('companion:containers.loadingLogs')}</div>
            ) : (
              <pre className="text-xs text-content font-mono whitespace-pre-wrap break-all">{containerLogs}</pre>
            )}
          </div>
        </div>
      )}
    </PanelContainer>
  );
}
