import { useLogStore } from '../../stores/log-store';
import { useSettingsStore } from '../../stores/settings-store';
import { LogListPanel } from './LogListPanel';
import { HealthReportPanel } from './HealthReportPanel';
import { LogExplorerPanel } from './LogExplorerPanel';
import { AiAnalysisPanel } from './AiAnalysisPanel';
import { FleetForensicsPanel } from './FleetForensicsPanel';
import { ADVISOR_CARGO_SLUG, useCargoEnabled } from '../../modules/capabilities';
import { useTranslation } from 'react-i18next';

export function LogsView() {
  const { t } = useTranslation();
  const activeTab = useLogStore((s) => s.activeTab);
  const setActiveTab = useLogStore((s) => s.setActiveTab);
  const currentLog = useLogStore((s) => s.currentLog);
  const aiProvider = useSettingsStore((s) => s.aiProvider);
  const aiMessages = useLogStore((s) => s.aiMessages);
  const advisorEnabled = useCargoEnabled(ADVISOR_CARGO_SLUG);
  const aiEnabled = advisorEnabled && !!aiProvider;

  const tabs = [
    { id: 'list' as const, label: t('logs:view.tabList') },
    { id: 'report' as const, label: t('logs:view.tabReport'), disabled: !currentLog },
    { id: 'explorer' as const, label: t('logs:view.tabExplorer'), disabled: !currentLog },
    ...(aiEnabled ? [{ id: 'ai' as const, label: t('logs:view.tabAi'), disabled: !currentLog }] : []),
    { id: 'fleet' as const, label: t('logs:view.tabFleet') },
  ];

  return (
    <div className="flex flex-col h-full">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 pt-3 pb-2 border-b border-subtle">
        <h2 className="text-lg font-semibold text-content mr-4">{t('common:flightLogs')}</h2>
        {currentLog && (
          <span
            className="text-xs font-medium px-2 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/30 mr-4"
            title={currentLog.metadata.firmwareString || undefined}
          >
            {currentLog.format === 'ulog' ? 'PX4 ULog' : 'ArduPilot'}
          </span>
        )}
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => !tab.disabled && setActiveTab(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? tab.id === 'ai' ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/20 text-blue-400'
                : tab.disabled
                  ? 'text-content-tertiary cursor-not-allowed'
                  : 'text-content-secondary hover:text-content hover:bg-surface'
            }`}
            disabled={tab.disabled}
            data-tip={tab.disabled ? t('logs:view.openLogFirst') : undefined}
          >
            {tab.label}
            {tab.id === 'ai' && aiMessages.length > 0 && (
              <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400">
                {aiMessages.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'list' && <LogListPanel />}
        {activeTab === 'report' && currentLog && <HealthReportPanel />}
        {activeTab === 'explorer' && currentLog && <LogExplorerPanel />}
        {activeTab === 'ai' && aiEnabled && currentLog && <AiAnalysisPanel />}
        {activeTab === 'fleet' && <FleetForensicsPanel />}
      </div>
    </div>
  );
}

