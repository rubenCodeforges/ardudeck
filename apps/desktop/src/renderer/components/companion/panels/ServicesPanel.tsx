import { useEffect, useState, useCallback } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer, SectionTitle } from '../../panels/panel-utils';
import type { ServiceInfo, ServiceAction } from '@ardudeck/companion-types';
import { useTranslation } from 'react-i18next';

const STATUS_COLORS: Record<string, { dot: string; text: string; bg: string }> = {
  running: { dot: 'bg-emerald-400', text: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  stopped: { dot: 'bg-gray-500', text: 'text-content-secondary', bg: 'bg-gray-500/10' },
  failed: { dot: 'bg-red-400', text: 'text-red-400', bg: 'bg-red-500/10' },
  unknown: { dot: 'bg-gray-600', text: 'text-content-secondary', bg: 'bg-gray-600/10' },
};

export function ServicesPanel() {
  const { t } = useTranslation();
  const connectionState = useCompanionStore((s) => s.connectionState);
  const isConnected = connectionState.state === 'connected';

  const [services, setServices] = useState<ServiceInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [filter, setFilter] = useState('');

  const fetchServices = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    try {
      const result = await window.electronAPI.companionGetServices();
      setServices(result);
    } catch {
      // Agent not reachable
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    fetchServices();
    const interval = setInterval(fetchServices, 10000);
    return () => clearInterval(interval);
  }, [fetchServices]);

  const handleAction = async (name: string, action: ServiceAction) => {
    setActionInProgress(`${name}:${action}`);
    try {
      await window.electronAPI.companionServiceAction(name, action);
      // Refresh after action
      setTimeout(fetchServices, 1000);
    } catch {
      // Error handled silently
    } finally {
      setActionInProgress(null);
    }
  };

  const filteredServices = filter
    ? services.filter((s) => s.name.toLowerCase().includes(filter.toLowerCase()) || s.description.toLowerCase().includes(filter.toLowerCase()))
    : services;

  if (!isConnected) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:services.unavailable')}</div>
          <div>{t('companion:services.unavailableHint')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Header bar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-subtle shrink-0">
        <SectionTitle>{t('companion:services.title')}</SectionTitle>
        <div className="flex-1" />
        <input
          type="text"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder={t('companion:services.filter')}
          className="bg-surface border border-subtle rounded px-2 py-0.5 text-[11px] text-content w-32 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        />
        <button
          onClick={fetchServices}
          className="text-content-secondary hover:text-content transition-colors p-0.5"
          title={t('common:refresh')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Service list */}
      <div className="flex-1 overflow-auto">
        {loading && services.length === 0 ? (
          <div className="flex items-center justify-center h-full text-content-tertiary text-xs">{t('companion:services.loading')}</div>
        ) : filteredServices.length === 0 ? (
          <div className="flex items-center justify-center h-full text-content-tertiary text-xs">
            {services.length === 0 ? t('companion:services.none') : t('companion:services.noMatch')}
          </div>
        ) : (
          <div className="divide-y divide-subtle">
            {filteredServices.map((service) => {
              const colors = STATUS_COLORS[service.status] ?? STATUS_COLORS['unknown']!;
              const isActing = actionInProgress?.startsWith(`${service.name}:`);

              return (
                <div key={service.name} className={`px-3 py-2 ${colors.bg} hover:bg-surface-overlay-subtle transition-colors`}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full shrink-0 ${colors.dot}`} />
                      <div className="min-w-0">
                        <div className="text-xs text-content font-medium truncate">{service.name}</div>
                        {service.description && (
                          <div className="text-[10px] text-content-secondary truncate">{service.description}</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {service.enabled && (
                        <span className="text-[9px] text-content-tertiary px-1 py-0.5 bg-surface-raised rounded">{t('companion:services.auto')}</span>
                      )}

                      {isActing ? (
                        <span className="text-[10px] text-yellow-400 animate-pulse px-2">...</span>
                      ) : (
                        <>
                          {service.status !== 'running' && (
                            <button
                              onClick={() => handleAction(service.name, 'start')}
                              className="px-1.5 py-0.5 text-[10px] text-emerald-400 hover:bg-emerald-500/20 rounded transition-colors"
                              title={t('common:start')}
                            >
                              {t('common:start')}
                            </button>
                          )}
                          {service.status === 'running' && (
                            <button
                              onClick={() => handleAction(service.name, 'stop')}
                              className="px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20 rounded transition-colors"
                              title={t('common:stop')}
                            >
                              {t('common:stop')}
                            </button>
                          )}
                          <button
                            onClick={() => handleAction(service.name, 'restart')}
                            className="px-1.5 py-0.5 text-[10px] text-blue-400 hover:bg-blue-500/20 rounded transition-colors"
                            title={t('companion:restart')}
                          >
                            {t('companion:restart')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
