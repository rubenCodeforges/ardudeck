/**
 * MavlinkConfigView
 *
 * Beginner-friendly configuration UI for ArduPilot/MAVLink flight controllers.
 * Similar to MspConfigView but for ArduPilot vehicles.
 *
 * Tabs:
 * - PID Tuning: Per-axis PID editor with presets
 * - Rates: Rate curve visualization and expo
 * - Flight Modes: Configure 6 flight mode slots
 * - Safety: Failsafes, arming, geofence
 * - Sensors: Live telemetry and sensor health
 * - Tuning: Basic performance presets
 * - Battery: Battery monitor setup
 * - All Parameters: Full parameter table (expert mode)
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Gauge,
  Activity,
  Settings,
  Shield,
  Cpu,
  Sliders,
  Battery,
  Table,
  Save,
  CheckCircle,
  XCircle,
  Loader2,
  Navigation,
  Car,
} from 'lucide-react';
import { useParameterStore } from '../../stores/parameter-store';
import { useConnectionStore } from '../../stores/connection-store';
import PidTuningTab from './PidTuningTab';
import RatesTab from './RatesTab';
import FlightModesTab from './FlightModesTab';
import SafetyTab from './SafetyTab';
import SensorsTab from './SensorsTab';
import TuningTab from './TuningTab';
import BatteryTab from './BatteryTab';
import ParameterTable from './ParameterTable';
import RoverTuningTab from './RoverTuningTab';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

type TabId = 'pid' | 'rates' | 'modes' | 'safety' | 'sensors' | 'tuning' | 'battery' | 'parameters' | 'rover-tuning' | 'rover-nav';

interface Tab {
  id: TabId;
  name: string;
  icon: React.ReactNode;
  description: string;
  badge?: string;
}

// Check if MAV_TYPE is a ground vehicle (Rover)
function isRoverType(mavType: number | undefined): boolean {
  // MAV_TYPE_GROUND_ROVER = 10, MAV_TYPE_SURFACE_BOAT = 11
  return mavType === 10 || mavType === 11;
}

// Aircraft tabs (copters, planes, VTOL)
const AIRCRAFT_TABS: Tab[] = [
  {
    id: 'pid',
    name: 'PID Tuning',
    icon: <Gauge className="w-5 h-5" />,
    description: 'Fine-tune PID gains for each axis',
  },
  {
    id: 'rates',
    name: 'Rates',
    icon: <Activity className="w-5 h-5" />,
    description: 'Configure rate curves and expo',
  },
  {
    id: 'modes',
    name: 'Flight Modes',
    icon: <Settings className="w-5 h-5" />,
    description: 'Configure your transmitter switch positions',
  },
  {
    id: 'safety',
    name: 'Safety',
    icon: <Shield className="w-5 h-5" />,
    description: 'Failsafes, arming checks, geofence',
  },
  {
    id: 'sensors',
    name: 'Sensors',
    icon: <Cpu className="w-5 h-5" />,
    description: 'Live telemetry and sensor health',
  },
  {
    id: 'tuning',
    name: 'Tuning',
    icon: <Sliders className="w-5 h-5" />,
    description: 'Performance presets and basic tuning',
  },
  {
    id: 'battery',
    name: 'Battery',
    icon: <Battery className="w-5 h-5" />,
    description: 'Battery monitor configuration',
  },
  {
    id: 'parameters',
    name: 'All Parameters',
    icon: <Table className="w-5 h-5" />,
    description: 'Full parameter list for experts',
    badge: 'Expert',
  },
];

// Rover/Boat tabs
const ROVER_TABS: Tab[] = [
  {
    id: 'rover-tuning',
    name: 'Speed & Steering',
    icon: <Car className="w-5 h-5" />,
    description: 'Configure speed limits and steering behavior',
  },
  {
    id: 'rover-nav',
    name: 'Navigation',
    icon: <Navigation className="w-5 h-5" />,
    description: 'Waypoint following and loiter settings',
  },
  {
    id: 'modes',
    name: 'Drive Modes',
    icon: <Settings className="w-5 h-5" />,
    description: 'Configure your transmitter switch positions',
  },
  {
    id: 'safety',
    name: 'Safety',
    icon: <Shield className="w-5 h-5" />,
    description: 'Failsafes, arming checks, geofence',
  },
  {
    id: 'sensors',
    name: 'Sensors',
    icon: <Cpu className="w-5 h-5" />,
    description: 'Live telemetry and sensor health',
  },
  {
    id: 'battery',
    name: 'Battery',
    icon: <Battery className="w-5 h-5" />,
    description: 'Battery monitor configuration',
  },
  {
    id: 'parameters',
    name: 'All Parameters',
    icon: <Table className="w-5 h-5" />,
    description: 'Full parameter list for experts',
    badge: 'Expert',
  },
];

export const MavlinkConfigView: React.FC = () => {
  const { parameters, isLoading, fetchParameters, modifiedCount, modifiedParameters, markAllAsSaved } = useParameterStore();
  const connectionState = useConnectionStore((s) => s.connectionState);

  // Determine vehicle type and appropriate tabs
  const isRover = isRoverType(connectionState.mavType);
  const tabs = useMemo(() => isRover ? ROVER_TABS : AIRCRAFT_TABS, [isRover]);
  const defaultTab = isRover ? 'rover-tuning' : 'pid';
  const [activeTab, setActiveTab] = useState<TabId>(defaultTab);

  // Reset active tab when vehicle type changes
  useEffect(() => {
    const validTabIds = tabs.map(t => t.id);
    if (!validTabIds.includes(activeTab)) {
      setActiveTab(defaultTab);
    }
  }, [tabs, activeTab, defaultTab]);

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
      // Aircraft tabs
      case 'pid':
        return <PidTuningTab />;
      case 'rates':
        return <RatesTab />;
      case 'tuning':
        return <TuningTab />;
      // Rover tabs
      case 'rover-tuning':
        return <RoverTuningTab />;
      case 'rover-nav':
        return <RoverTuningTab section="navigation" />;
      // Shared tabs
      case 'modes':
        return <FlightModesTab isRover={isRover} />;
      case 'safety':
        return <SafetyTab />;
      case 'sensors':
        return <SensorsTab />;
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
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
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
                  <Save className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} />
                  {isWritingFlash ? 'Saving...' : 'Write to Flash'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="shrink-0 px-6 border-b border-zinc-800/50 bg-zinc-900/20">
        <div className="flex gap-1 overflow-x-auto overflow-y-hidden scrollbar-none">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            // Color coding for different tab types
            const colorClass = tab.id === 'pid' || tab.id === 'rates' ? 'blue'
              : tab.id === 'modes' ? 'purple'
              : tab.id === 'safety' ? 'amber'
              : tab.id === 'sensors' ? 'cyan'
              : tab.id === 'tuning' ? 'emerald'
              : tab.id === 'battery' ? 'orange'
              : tab.id === 'parameters' ? 'zinc'
              : 'blue';

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all border-b-2 -mb-px whitespace-nowrap ${
                  isActive
                    ? colorClass === 'blue' ? 'text-blue-400 border-blue-400 bg-blue-500/5'
                    : colorClass === 'purple' ? 'text-purple-400 border-purple-400 bg-purple-500/5'
                    : colorClass === 'amber' ? 'text-amber-400 border-amber-400 bg-amber-500/5'
                    : colorClass === 'cyan' ? 'text-cyan-400 border-cyan-400 bg-cyan-500/5'
                    : colorClass === 'emerald' ? 'text-emerald-400 border-emerald-400 bg-emerald-500/5'
                    : colorClass === 'orange' ? 'text-orange-400 border-orange-400 bg-orange-500/5'
                    : 'text-zinc-400 border-zinc-400 bg-zinc-500/5'
                    : 'text-zinc-400 border-transparent hover:text-zinc-200 hover:bg-zinc-800/30'
                }`}
              >
                <span className={isActive
                  ? colorClass === 'blue' ? 'text-blue-400'
                  : colorClass === 'purple' ? 'text-purple-400'
                  : colorClass === 'amber' ? 'text-amber-400'
                  : colorClass === 'cyan' ? 'text-cyan-400'
                  : colorClass === 'emerald' ? 'text-emerald-400'
                  : colorClass === 'orange' ? 'text-orange-400'
                  : 'text-zinc-400'
                  : 'text-zinc-500'
                }>
                  {tab.icon}
                </span>
                <span>{tab.name}</span>
                {tab.badge && (
                  <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-zinc-700/50 rounded text-zinc-400">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Tab description */}
      <div className="shrink-0 px-6 py-2 bg-zinc-900/10 border-b border-zinc-800/30">
        <p className="text-xs text-zinc-500">
          {tabs.find((t) => t.id === activeTab)?.description}
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
                    <th className="pb-2 text-center px-2">→</th>
                    <th className="pb-2">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-zinc-300">{param.id}</td>
                      <td className="py-2 text-right font-mono text-zinc-500">{param.originalValue}</td>
                      <td className="py-2 text-center text-zinc-600">→</td>
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
          {toast.type === 'success' && <CheckCircle className="w-5 h-5" />}
          {toast.type === 'error' && <XCircle className="w-5 h-5" />}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default MavlinkConfigView;
