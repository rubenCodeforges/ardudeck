/**
 * Legacy Config View
 *
 * CLI-only configuration for legacy F3 boards (iNav < 2.1, Betaflight < 4.0).
 * All configuration is done via CLI commands - no MSP write support.
 *
 * Flow:
 * 1. User makes changes (PID, rates, servos, etc.) - CLI commands sent immediately
 * 2. Changes are visible in CLI terminal
 * 3. When satisfied, user clicks "Save to EEPROM" - sends save command
 * 4. Board reboots, user reconnects manually
 */

import { useState, useEffect } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connection-store';
import { useLegacyConfigStore } from '../../stores/legacy-config-store';
import LegacyPidTab from './LegacyPidTab';
import LegacyRatesTab from './LegacyRatesTab';
import LegacyMixerTab from './LegacyMixerTab';
import LegacyServoTab from './LegacyServoTab';
import LegacyModesTab from './LegacyModesTab';
import {
  Zap,
  Gauge,
  Shuffle,
  SlidersHorizontal,
  ToggleRight,
  type LucideIcon,
} from 'lucide-react';

type TabId = 'pid' | 'rates' | 'mixer' | 'servo' | 'modes';

interface TabConfig {
  id: TabId;
  labelKey: string;
  icon: LucideIcon;
  color: string;
}

const TABS: TabConfig[] = [
  { id: 'pid', labelKey: 'legacy-config:legacyConfigView.tabs.pid', icon: Zap, color: 'text-blue-400' },
  { id: 'rates', labelKey: 'legacy-config:legacyConfigView.tabs.rates', icon: Gauge, color: 'text-purple-400' },
  { id: 'mixer', labelKey: 'legacy-config:legacyConfigView.tabs.mixer', icon: Shuffle, color: 'text-cyan-400' },
  { id: 'servo', labelKey: 'legacy-config:legacyConfigView.tabs.servo', icon: SlidersHorizontal, color: 'text-orange-400' },
  { id: 'modes', labelKey: 'legacy-config:legacyConfigView.tabs.modes', icon: ToggleRight, color: 'text-green-400' },
];

export default function LegacyConfigView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<TabId>('pid');
  const [showSaveConfirm, setShowSaveConfirm] = useState(false);
  const { connectionState } = useConnectionStore();
  const {
    isLoading,
    error,
    loadConfig,
    hasChanges,
    saveToEeprom,
    pid,
    rebootState,
    rebootMessage,
    rebootError,
    clearRebootState,
  } = useLegacyConfigStore();

  // Check if we have config data (pid is set after successful dump)
  const hasConfigData = pid !== null;

  // Load config on mount
  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      loadConfig();
    }
  }, [connectionState.isConnected, connectionState.protocol, loadConfig]);

  const handleSave = async () => {
    setShowSaveConfirm(false);
    await saveToEeprom();
  };

  return (
    <div className="h-full flex flex-col bg-surface-base">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-subtle">
        <div className="flex items-center gap-3">
          {/* Legacy badge */}
          <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-xs font-medium text-amber-400">
            {t('legacy-config:legacyConfigView.badge')}
          </div>
          <div>
            <h1 className="text-lg font-semibold text-content">
              {connectionState.fcVariant} {connectionState.fcVersion}
              {connectionState.vehicleType && (
                <span className="ml-2 text-emerald-400">({connectionState.vehicleType})</span>
              )}
            </h1>
            <p className="text-xs text-content-secondary">
              {t('legacy-config:legacyConfigView.subtitle')}
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-400">{t('legacy-config:legacyConfigView.unsavedChanges')}</span>
          )}
          <button
            onClick={() => setShowSaveConfirm(true)}
            disabled={!hasChanges || isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              hasChanges && !isLoading
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-surface-raised text-content-secondary cursor-not-allowed'
            }`}
          >
            {t('legacy-config:legacyConfigView.saveToEeprom')}
          </button>
        </div>
      </div>

      {/* Save confirmation dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-surface-solid border border rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-content mb-2">{t('legacy-config:legacyConfigView.saveConfirmTitle')}</h3>
                <p className="text-sm text-content-secondary mb-4">
                  <Trans i18nKey="legacy-config:legacyConfigView.saveConfirmBody" components={{ b: <strong className="text-content" /> }} />
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    {t('legacy-config:legacyConfigView.saveAndReboot')}
                  </button>
                  <button
                    onClick={() => setShowSaveConfirm(false)}
                    className="flex-1 px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm transition-colors"
                  >
                    {t('common:cancel')}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Reboot/Reconnect overlay */}
      {rebootState !== 'idle' && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-surface-solid border border rounded-xl p-8 max-w-md mx-4 shadow-2xl text-center">
            {/* Icon based on state */}
            {rebootState === 'error' ? (
              <div className="w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </div>
            ) : rebootState === 'done' ? (
              <div className="w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <svg className="w-8 h-8 text-green-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-500/20 flex items-center justify-center mx-auto mb-4">
                <div className="w-8 h-8 border-3 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}

            {/* Title */}
            <h3 className="text-lg font-semibold text-content mb-2">
              {rebootState === 'saving' && t('legacy-config:legacyConfigView.reboot.saving')}
              {rebootState === 'rebooting' && t('legacy-config:legacyConfigView.reboot.rebooting')}
              {rebootState === 'reconnecting' && t('legacy-config:legacyConfigView.reboot.reconnecting')}
              {rebootState === 'done' && t('legacy-config:legacyConfigView.reboot.done')}
              {rebootState === 'error' && t('legacy-config:legacyConfigView.reboot.error')}
            </h3>

            {/* Message */}
            <p className="text-sm text-content-secondary mb-4">
              {rebootError || rebootMessage}
            </p>

            {/* Progress indicator for non-terminal states */}
            {(rebootState === 'saving' || rebootState === 'rebooting' || rebootState === 'reconnecting') && (
              <div className="flex items-center justify-center gap-2 text-xs text-content-secondary">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'saving' ? 'bg-blue-500' : 'bg-surface-raised'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'rebooting' ? 'bg-blue-500' : 'bg-surface-raised'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'reconnecting' ? 'bg-blue-500' : 'bg-surface-raised'}`} />
                </div>
              </div>
            )}

            {/* Dismiss button for terminal states */}
            {(rebootState === 'done' || rebootState === 'error') && (
              <button
                onClick={clearRebootState}
                className="mt-4 px-6 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm transition-colors"
              >
                {t('common:dismiss')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Info banner */}
      {hasConfigData && (
        <div className="mx-4 mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <Trans i18nKey="legacy-config:legacyConfigView.howItWorks" components={{ b: <strong /> }} />
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !hasConfigData && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-content-secondary">{t('legacy-config:legacyConfigView.loading')}</p>
            <p className="text-xs text-content-tertiary mt-1">{t('legacy-config:legacyConfigView.runningDump')}</p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="mx-4 mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="text-sm font-medium text-red-300">{t('legacy-config:legacyConfigView.configError')}</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {hasConfigData && (
        <>
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-subtle">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                    isActive
                      ? 'bg-surface-raised text-content border-b-2 border-blue-500'
                      : 'text-content-secondary hover:text-content hover:bg-surface'
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive ? tab.color : `${tab.color} opacity-50`}`} />
                  {t(tab.labelKey)}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto p-4">
            {activeTab === 'pid' && <LegacyPidTab />}
            {activeTab === 'rates' && <LegacyRatesTab />}
            {activeTab === 'mixer' && <LegacyMixerTab />}
            {activeTab === 'servo' && <LegacyServoTab />}
            {activeTab === 'modes' && <LegacyModesTab />}
          </div>
        </>
      )}

      {/* Not connected state */}
      {!connectionState.isConnected && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <svg className="w-12 h-12 text-content-tertiary mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-7.072-7.072m7.072 7.072l2.829-2.829" />
            </svg>
            <p className="text-content-secondary">{t('legacy-config:legacyConfigView.notConnected')}</p>
          </div>
        </div>
      )}
    </div>
  );
}
