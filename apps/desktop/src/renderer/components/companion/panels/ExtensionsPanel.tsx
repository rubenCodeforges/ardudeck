import { useEffect, useState, useCallback } from 'react';
import { useCompanionStore } from '../../../stores/companion-store';
import { PanelContainer } from '../../panels/panel-utils';
import { useTranslation } from 'react-i18next';

export function ExtensionsPanel() {
  const { t } = useTranslation();
  const extensions = useCompanionStore((s) => s.extensions);
  const setExtensions = useCompanionStore((s) => s.setExtensions);
  const connectionState = useCompanionStore((s) => s.connectionState);
  const systemInfo = useCompanionStore((s) => s.systemInfo);
  const isConnected = connectionState.state === 'connected';

  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [tab, setTab] = useState<'installed' | 'available'>('installed');

  const fetchExtensions = useCallback(async () => {
    if (!isConnected) return;
    try {
      const result = await window.electronAPI.companionGetExtensions();
      setExtensions(result);
    } catch {
      // BlueOS might not be available
    }
  }, [isConnected, setExtensions]);

  useEffect(() => {
    fetchExtensions();
    const interval = setInterval(fetchExtensions, 30000);
    return () => clearInterval(interval);
  }, [fetchExtensions]);

  const handleRemove = async (identifier: string) => {
    setActionInProgress(`remove:${identifier}`);
    try {
      await window.electronAPI.companionRemoveExtension(identifier);
      setTimeout(fetchExtensions, 2000);
    } catch {
      // Error handled silently
    } finally {
      setActionInProgress(null);
    }
  };

  const blueosDetected = systemInfo?.blueosDetected ?? false;

  if (!isConnected) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:extensions.unavailable')}</div>
          <div>{t('companion:extensions.unavailableHint')}</div>
        </div>
      </PanelContainer>
    );
  }

  if (!blueosDetected && extensions.length === 0) {
    return (
      <PanelContainer className="flex items-center justify-center">
        <div className="text-center text-content-tertiary text-xs">
          <div className="text-content-secondary mb-1">{t('companion:extensions.noBlueos')}</div>
          <div>{t('companion:extensions.noBlueosHint')}</div>
          <div className="mt-1 text-[10px] text-content-tertiary">{t('companion:extensions.onlyBlueos')}</div>
        </div>
      </PanelContainer>
    );
  }

  return (
    <PanelContainer className="flex flex-col gap-0 p-0">
      {/* Tab bar */}
      <div className="flex items-center gap-0 border-b border-subtle shrink-0">
        <button
          onClick={() => setTab('installed')}
          className={`px-3 py-1.5 text-xs transition-colors ${
            tab === 'installed'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          {t('companion:extensions.installed', { count: extensions.length })}
        </button>
        <button
          onClick={() => setTab('available')}
          className={`px-3 py-1.5 text-xs transition-colors ${
            tab === 'available'
              ? 'text-blue-400 border-b-2 border-blue-400'
              : 'text-content-secondary hover:text-content'
          }`}
        >
          {t('companion:extensions.available')}
        </button>
        <div className="flex-1" />
        <button
          onClick={fetchExtensions}
          className="text-content-secondary hover:text-content transition-colors p-1.5 mr-1"
          title={t('common:refresh')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>

      {/* Extension list */}
      <div className="flex-1 overflow-auto">
        {tab === 'installed' ? (
          extensions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-content-tertiary text-xs">
              {t('companion:extensions.none')}
            </div>
          ) : (
            <div className="divide-y divide-subtle">
              {extensions.map((ext) => {
                const isRemoving = actionInProgress === `remove:${ext.identifier}`;

                return (
                  <div key={ext.identifier} className="px-3 py-2.5 hover:bg-surface-overlay-subtle transition-colors">
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className={`w-2 h-2 rounded-full shrink-0 ${ext.enabled ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                        <span className="text-xs text-content font-medium truncate">{ext.name}</span>
                        <span className="text-[10px] text-content-tertiary">v{ext.version}</span>
                      </div>

                      <div className="shrink-0 ml-2">
                        {isRemoving ? (
                          <span className="text-[10px] text-yellow-400 animate-pulse px-2">{t('companion:extensions.removing')}</span>
                        ) : (
                          <button
                            onClick={() => handleRemove(ext.identifier)}
                            className="px-1.5 py-0.5 text-[10px] text-red-400 hover:bg-red-500/20 rounded transition-colors"
                          >
                            {t('common:remove')}
                          </button>
                        )}
                      </div>
                    </div>

                    {ext.description && (
                      <div className="text-[10px] text-content-secondary ml-4 line-clamp-2">{ext.description}</div>
                    )}

                    <div className="text-[10px] text-content-tertiary ml-4 mt-0.5 font-mono truncate">
                      {ext.docker_image}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        ) : (
          <div className="flex items-center justify-center h-full text-content-tertiary text-xs">
            <div className="text-center">
              <div className="text-content-secondary mb-1">{t('companion:extensions.availableTitle')}</div>
              <div className="text-[10px]">{t('companion:extensions.availableHint')}</div>
              <div className="text-[10px] mt-1 text-content-tertiary">{t('companion:extensions.comingSoon')}</div>
            </div>
          </div>
        )}
      </div>
    </PanelContainer>
  );
}
