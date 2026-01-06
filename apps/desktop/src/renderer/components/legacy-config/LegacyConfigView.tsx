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
import { useConnectionStore } from '../../stores/connection-store';
import { useLegacyConfigStore } from '../../stores/legacy-config-store';
import LegacyPidTab from './LegacyPidTab';
import LegacyRatesTab from './LegacyRatesTab';
import LegacyMixerTab from './LegacyMixerTab';
import LegacyServoTab from './LegacyServoTab';
import LegacyModesTab from './LegacyModesTab';

type TabId = 'pid' | 'rates' | 'mixer' | 'servo' | 'modes';

interface TabConfig {
  id: TabId;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabConfig[] = [
  {
    id: 'pid',
    label: 'PID',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    ),
  },
  {
    id: 'rates',
    label: 'Rates',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
      </svg>
    ),
  },
  {
    id: 'mixer',
    label: 'Mixer',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
      </svg>
    ),
  },
  {
    id: 'servo',
    label: 'Servo',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
      </svg>
    ),
  },
  {
    id: 'modes',
    label: 'Modes',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 9l4-4 4 4m0 6l-4 4-4-4" />
      </svg>
    ),
  },
];

export default function LegacyConfigView() {
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
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* Legacy badge */}
          <div className="px-2 py-1 bg-amber-500/10 border border-amber-500/30 rounded text-xs font-medium text-amber-400">
            Legacy CLI
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">
              {connectionState.fcVariant} {connectionState.fcVersion}
            </h1>
            <p className="text-xs text-zinc-500">
              Configuration via CLI commands (F3 board)
            </p>
          </div>
        </div>

        {/* Save button */}
        <div className="flex items-center gap-3">
          {hasChanges && (
            <span className="text-xs text-amber-400">Unsaved changes</span>
          )}
          <button
            onClick={() => setShowSaveConfirm(true)}
            disabled={!hasChanges || isLoading}
            className={`px-4 py-2 rounded-lg font-medium text-sm transition-colors ${
              hasChanges && !isLoading
                ? 'bg-blue-600 hover:bg-blue-500 text-white'
                : 'bg-zinc-800 text-zinc-500 cursor-not-allowed'
            }`}
          >
            Save to EEPROM
          </button>
        </div>
      </div>

      {/* Save confirmation dialog */}
      {showSaveConfirm && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <div className="flex items-start gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
                <svg className="w-5 h-5 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-semibold text-white mb-2">Save to EEPROM?</h3>
                <p className="text-sm text-zinc-400 mb-4">
                  This will save all changes to the flight controller and <strong className="text-white">reboot the board</strong>.
                  You will need to reconnect after the reboot completes.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleSave}
                    className="flex-1 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
                  >
                    Save & Reboot
                  </button>
                  <button
                    onClick={() => setShowSaveConfirm(false)}
                    className="flex-1 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
                  >
                    Cancel
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
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-8 max-w-md mx-4 shadow-2xl text-center">
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
            <h3 className="text-lg font-semibold text-white mb-2">
              {rebootState === 'saving' && 'Saving Configuration'}
              {rebootState === 'rebooting' && 'Rebooting Board'}
              {rebootState === 'reconnecting' && 'Reconnecting'}
              {rebootState === 'done' && 'Save Complete'}
              {rebootState === 'error' && 'Save Failed'}
            </h3>

            {/* Message */}
            <p className="text-sm text-zinc-400 mb-4">
              {rebootError || rebootMessage}
            </p>

            {/* Progress indicator for non-terminal states */}
            {(rebootState === 'saving' || rebootState === 'rebooting' || rebootState === 'reconnecting') && (
              <div className="flex items-center justify-center gap-2 text-xs text-zinc-500">
                <div className="flex gap-1">
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'saving' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'rebooting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                  <div className={`w-2 h-2 rounded-full ${rebootState === 'reconnecting' ? 'bg-blue-500' : 'bg-zinc-600'}`} />
                </div>
              </div>
            )}

            {/* Dismiss button for terminal states */}
            {(rebootState === 'done' || rebootState === 'error') && (
              <button
                onClick={clearRebootState}
                className="mt-4 px-6 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg text-sm transition-colors"
              >
                Dismiss
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
              <strong>How it works:</strong> Changes are sent immediately as CLI commands.
              Check the CLI terminal to see commands being sent.
              When you're done, click "Save to EEPROM" to persist changes (board will reboot).
            </div>
          </div>
        </div>
      )}

      {/* Loading state */}
      {isLoading && !hasConfigData && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-zinc-400">Loading configuration from CLI...</p>
            <p className="text-xs text-zinc-600 mt-1">Running dump command</p>
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
              <p className="text-sm font-medium text-red-300">Configuration Error</p>
              <p className="text-xs text-red-400/70 mt-0.5">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      {hasConfigData && (
        <>
          <div className="flex items-center gap-1 px-4 pt-3 border-b border-zinc-800">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-t-lg transition-colors ${
                  activeTab === tab.id
                    ? 'bg-zinc-800 text-white border-b-2 border-blue-500'
                    : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
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
            <svg className="w-12 h-12 text-zinc-600 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18.364 5.636a9 9 0 010 12.728m0 0l-2.829-2.829m2.829 2.829L21 21M15.536 8.464a5 5 0 010 7.072m0 0l-2.829-2.829m-4.243 2.829a5 5 0 01-7.072-7.072m7.072 7.072l2.829-2.829" />
            </svg>
            <p className="text-zinc-400">Connect to a legacy board to configure</p>
          </div>
        </div>
      )}
    </div>
  );
}
