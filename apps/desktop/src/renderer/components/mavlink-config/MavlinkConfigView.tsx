/**
 * MavlinkConfigView
 *
 * Beginner-friendly configuration UI for ArduPilot/MAVLink flight controllers.
 * Similar to MspConfigView but for ArduPilot vehicles.
 *
 * Tabs:
 * - Flight Modes: Configure 6 flight mode slots
 * - Safety: Failsafes, arming, geofence
 * - Tuning: Basic performance presets
 * - Battery: Battery monitor setup
 * - All Parameters: Full parameter table (expert mode)
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import FlightModesTab from './FlightModesTab';
import SafetyTab from './SafetyTab';
import TuningTab from './TuningTab';
import BatteryTab from './BatteryTab';
import ParameterTable from './ParameterTable';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

type TabId = 'modes' | 'safety' | 'tuning' | 'battery' | 'parameters';

interface Tab {
  id: TabId;
  name: string;
  icon: React.ReactNode;
  description: string;
}

const TABS: Tab[] = [
  {
    id: 'modes',
    name: 'Flight Modes',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
    description: 'Configure your transmitter switch positions',
  },
  {
    id: 'safety',
    name: 'Safety',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
      </svg>
    ),
    description: 'Failsafes, arming checks, geofence',
  },
  {
    id: 'tuning',
    name: 'Tuning',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
      </svg>
    ),
    description: 'Performance presets and basic tuning',
  },
  {
    id: 'battery',
    name: 'Battery',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 10.5h.375c.621 0 1.125.504 1.125 1.125v2.25c0 .621-.504 1.125-1.125 1.125H21M4.5 10.5H18V15H4.5v-4.5zM3.75 18h15A2.25 2.25 0 0021 15.75v-6a2.25 2.25 0 00-2.25-2.25h-15A2.25 2.25 0 001.5 9.75v6A2.25 2.25 0 003.75 18z" />
      </svg>
    ),
    description: 'Battery monitor configuration',
  },
  {
    id: 'parameters',
    name: 'All Parameters',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 010 3.75H5.625a1.875 1.875 0 010-3.75z" />
      </svg>
    ),
    description: 'Full parameter list for experts',
  },
];

export const MavlinkConfigView: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabId>('modes');
  const { parameters, isLoading, fetchParameters, modifiedCount, modifiedParameters, markAllAsSaved } = useParameterStore();
  const connectionState = useConnectionStore((s) => s.connectionState);

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);

  // Auto-hide toast after 3 seconds
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load parameters on mount if not loaded
  useEffect(() => {
    if (connectionState.isConnected && parameters.size === 0 && !isLoading) {
      fetchParameters();
    }
  }, [connectionState.isConnected, parameters.size, isLoading, fetchParameters]);

  const handleWriteToFlashClick = useCallback(() => {
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      const result = await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        markAllAsSaved();
        showToast('Parameters saved to flash successfully', 'success');
      } else {
        showToast(result?.error ?? 'Failed to write to flash', 'error');
      }
    } catch {
      showToast('Failed to write to flash', 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast]);

  const modified = modifiedCount();

  const renderTabContent = () => {
    switch (activeTab) {
      case 'modes':
        return <FlightModesTab />;
      case 'safety':
        return <SafetyTab />;
      case 'tuning':
        return <TuningTab />;
      case 'battery':
        return <BatteryTab />;
      case 'parameters':
        return <ParameterTable />;
      default:
        return null;
    }
  };

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white">Vehicle Configuration</h1>
            <p className="text-sm text-zinc-500 mt-0.5">
              {connectionState.autopilot || 'ArduPilot'} • {parameters.size} parameters loaded
            </p>
          </div>

          {/* Status badges and actions */}
          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <svg className="w-4 h-4 text-blue-400 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <span className="text-sm text-blue-400">Loading parameters...</span>
              </div>
            )}

            {modified > 0 && (
              <>
                <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <span className="text-sm text-amber-400">{modified} unsaved</span>
                </div>
                <button
                  onClick={handleWriteToFlashClick}
                  disabled={isWritingFlash}
                  className="flex items-center gap-2 px-4 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-zinc-700/30 text-green-400 disabled:text-zinc-500 rounded-lg text-sm font-medium transition-colors"
                  title="Save parameters to flight controller's permanent storage"
                >
                  <svg className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                  </svg>
                  {isWritingFlash ? 'Saving...' : 'Write to Flash'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="shrink-0 px-6 border-b border-zinc-800/50 bg-zinc-900/20">
        <div className="flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px ${
                activeTab === tab.id
                  ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                  : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/30'
              }`}
            >
              {tab.icon}
              <span>{tab.name}</span>
              {tab.id === 'parameters' && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-700/50 rounded text-zinc-400">
                  Expert
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Tab description */}
      <div className="shrink-0 px-6 py-2 bg-zinc-900/10 border-b border-zinc-800/30">
        <p className="text-xs text-zinc-500">
          {TABS.find((t) => t.id === activeTab)?.description}
        </p>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto">
        {renderTabContent()}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-white">Write Parameters to Flash</h3>
              <p className="text-sm text-zinc-400 mt-1">
                The following {modifiedParameters().length} parameter(s) will be saved permanently to the flight controller.
              </p>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 uppercase">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2 text-right">Original</th>
                    <th className="pb-2 text-center px-2">-</th>
                    <th className="pb-2">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-zinc-300">{param.id}</td>
                      <td className="py-2 text-right font-mono text-zinc-500">{param.originalValue}</td>
                      <td className="py-2 text-center text-zinc-600">-</td>
                      <td className="py-2 font-mono text-amber-400">{param.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWriteToFlashConfirm}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                Write to Flash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-400' :
          'bg-blue-500/20 border border-blue-500/30 text-blue-400'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default MavlinkConfigView;
