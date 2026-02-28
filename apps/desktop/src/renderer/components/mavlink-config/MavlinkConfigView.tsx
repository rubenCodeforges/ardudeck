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

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
  Radio,
  Cable,
  RotateCw,
  History,
  AlertTriangle,
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
import ReceiverTab from './ReceiverTab';
import SerialPortsTab from './SerialPortsTab';
import ParamHistoryModal from './ParamHistoryModal';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

type TabId = 'pid' | 'rates' | 'modes' | 'receiver' | 'serial-ports' | 'safety' | 'sensors' | 'tuning' | 'battery' | 'parameters' | 'rover-tuning' | 'rover-nav';

interface Tab {
  id: TabId;
  name: string;
  Icon: React.FC<{ className?: string }>;
  color: string;
  description: string;
  badge?: string;
}

type VehicleCategory = 'copter' | 'plane' | 'rover';

// Determine vehicle category from MAV_TYPE
function getVehicleCategory(mavType: number | undefined): VehicleCategory {
  if (mavType === undefined) return 'copter';
  // MAV_TYPE_GROUND_ROVER = 10, MAV_TYPE_SURFACE_BOAT = 11
  if (mavType === 10 || mavType === 11) return 'rover';
  // MAV_TYPE_FIXED_WING = 1, MAV_TYPE_VTOL types = 19-25
  if (mavType === 1 || (mavType >= 19 && mavType <= 25)) return 'plane';
  return 'copter';
}

// Check if MAV_TYPE is a ground vehicle (Rover)
function isRoverType(mavType: number | undefined): boolean {
  return getVehicleCategory(mavType) === 'rover';
}

// Aircraft tabs (copters, planes, VTOL)
const AIRCRAFT_TABS: Tab[] = [
  { id: 'pid', name: 'PID Tuning', Icon: Gauge, color: 'text-blue-400', description: 'Fine-tune PID gains for each axis' },
  { id: 'rates', name: 'Rates', Icon: Activity, color: 'text-purple-400', description: 'Configure rate curves and expo' },
  { id: 'modes', name: 'Flight Modes', Icon: Settings, color: 'text-green-400', description: 'Configure your transmitter switch positions' },
  { id: 'receiver', name: 'Receiver', Icon: Radio, color: 'text-teal-400', description: 'RC receiver protocol and live channel monitor' },
  { id: 'serial-ports', name: 'Serial Ports', Icon: Cable, color: 'text-sky-400', description: 'Configure serial port protocols and baud rates' },
  { id: 'safety', name: 'Safety', Icon: Shield, color: 'text-amber-400', description: 'Failsafes, arming checks, geofence' },
  { id: 'sensors', name: 'Sensors', Icon: Cpu, color: 'text-cyan-400', description: 'Live telemetry and sensor health' },
  { id: 'tuning', name: 'Tuning', Icon: Sliders, color: 'text-emerald-400', description: 'Performance presets and basic tuning' },
  { id: 'battery', name: 'Battery', Icon: Battery, color: 'text-orange-400', description: 'Battery monitor configuration' },
  { id: 'parameters', name: 'All Parameters', Icon: Table, color: 'text-zinc-400', description: 'Full parameter list for experts', badge: 'Expert' },
];

// Rover/Boat tabs
const ROVER_TABS: Tab[] = [
  { id: 'rover-tuning', name: 'Speed & Steering', Icon: Car, color: 'text-blue-400', description: 'Configure speed limits and steering behavior' },
  { id: 'rover-nav', name: 'Navigation', Icon: Navigation, color: 'text-purple-400', description: 'Waypoint following and loiter settings' },
  { id: 'modes', name: 'Drive Modes', Icon: Settings, color: 'text-green-400', description: 'Configure your transmitter switch positions' },
  { id: 'receiver', name: 'Receiver', Icon: Radio, color: 'text-teal-400', description: 'RC receiver protocol and live channel monitor' },
  { id: 'serial-ports', name: 'Serial Ports', Icon: Cable, color: 'text-sky-400', description: 'Configure serial port protocols and baud rates' },
  { id: 'safety', name: 'Safety', Icon: Shield, color: 'text-amber-400', description: 'Failsafes, arming checks, geofence' },
  { id: 'sensors', name: 'Sensors', Icon: Cpu, color: 'text-cyan-400', description: 'Live telemetry and sensor health' },
  { id: 'battery', name: 'Battery', Icon: Battery, color: 'text-orange-400', description: 'Battery monitor configuration' },
  { id: 'parameters', name: 'All Parameters', Icon: Table, color: 'text-zinc-400', description: 'Full parameter list for experts', badge: 'Expert' },
];

export const MavlinkConfigView: React.FC = () => {
  const paramCount = useParameterStore((s) => s.paramCount);
  const isLoading = useParameterStore((s) => s.isLoading);
  const fetchParameters = useParameterStore((s) => s.fetchParameters);
  const modifiedCount = useParameterStore((s) => s.modifiedCount);
  const modifiedParameters = useParameterStore((s) => s.modifiedParameters);
  const markAllAsSaved = useParameterStore((s) => s.markAllAsSaved);
  const isRebootRequired = useParameterStore((s) => s.isRebootRequired);
  const connectionState = useConnectionStore((s) => s.connectionState);

  // Determine vehicle type and appropriate tabs
  const vehicleCategory = getVehicleCategory(connectionState.mavType);
  const isRover = vehicleCategory === 'rover';
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
  const [showHistory, setShowHistory] = useState(false);
  const [rebooting, setRebooting] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebootRequiredParams, setRebootRequiredParams] = useState<string[]>([]);
  // Tracks whether we initiated a reboot from the banner and should auto-refresh params
  const pendingParamRefresh = useRef(false);

  // Auto-hide toast after 3 seconds
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // Load parameters on mount if not loaded
  useEffect(() => {
    if (connectionState.isConnected && paramCount === 0 && !isLoading) {
      fetchParameters();
    }
  }, [connectionState.isConnected, paramCount, isLoading, fetchParameters]);

  const handleWriteToFlashClick = useCallback(() => {
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      // Auto-checkpoint before writing to flash
      const modified = modifiedParameters();
      if (modified.length > 0) {
        const boardUid = connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`;
        const boardName = connectionState.vehicleType || 'Unknown';
        const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
        await window.electronAPI?.saveParamCheckpoint(boardUid, boardName,
          modified.map(p => ({ paramId: p.id, oldValue: p.originalValue ?? p.value, newValue: p.value })),
          vehicleType
        );
      }

      const result = await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        // Check if any written params require a reboot
        const rebootParams = modified.filter(p => isRebootRequired(p.id)).map(p => p.id);
        if (rebootParams.length > 0) {
          setRebootRequiredParams(rebootParams);
        }

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
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState, isRebootRequired]);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (success) {
        // Don't clear banner yet - keep it showing reconnection progress
        // Set flag so we auto-refresh params when reconnection completes
        if (rebootRequiredParams.length > 0) {
          pendingParamRefresh.current = true;
        } else {
          showToast('Rebooting flight controller...', 'info');
        }
      } else {
        setRebooting(false);
        showToast('Failed to send reboot command', 'error');
      }
    } catch {
      setRebooting(false);
      showToast('Failed to reboot flight controller', 'error');
    }
  }, [showToast, rebootRequiredParams]);

  // Watch for reconnection completion after a reboot we initiated
  useEffect(() => {
    if (!pendingParamRefresh.current) return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      // Reconnection complete - store already has correct values from markAllAsSaved()
      pendingParamRefresh.current = false;
      setRebooting(false);
      setRebootRequiredParams([]);
      showToast('Reboot complete', 'success');
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, showToast]);

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
        return <FlightModesTab vehicleCategory={vehicleCategory} />;
      case 'receiver':
        return <ReceiverTab />;
      case 'serial-ports':
        return <SerialPortsTab />;
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
      <div className="shrink-0 px-6 py-4 border-b border-gray-800/50 bg-gradient-to-r from-gray-900/90 to-gray-900/50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center shadow-lg">
              <Cpu className="w-7 h-7 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">
                {connectionState.autopilot || 'ArduPilot'} Configuration
              </h2>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                {connectionState.vehicleType && (
                  <>
                    <span className="text-emerald-400">{connectionState.vehicleType}</span>
                    <span>•</span>
                  </>
                )}
                <span>{paramCount} parameters</span>
                {connectionState.systemId != null && (
                  <>
                    <span>•</span>
                    <span>SysID {connectionState.systemId}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />
                <span className="text-sm text-blue-400">Loading...</span>
              </div>
            )}

            {modified > 0 && (
              <span className="px-3 py-1 text-sm rounded-lg bg-yellow-500/20 text-yellow-400 border border-yellow-500/30">
                Unsaved
              </span>
            )}

            <button
              onClick={() => fetchParameters()}
              disabled={isLoading}
              className="px-4 py-2 text-sm rounded-lg bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
            >
              Refresh
            </button>

            <button
              onClick={handleReboot}
              disabled={rebooting}
              className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
              title="Reboot flight controller"
            >
              <RotateCw className={`w-4 h-4 ${rebooting ? 'animate-spin' : ''}`} />
              {rebooting ? 'Rebooting...' : 'Reboot'}
            </button>

            <button
              onClick={() => setShowHistory(true)}
              className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 border border-gray-700"
              title="View parameter change history"
            >
              <History className="w-4 h-4" />
              History
            </button>

            <button
              onClick={handleWriteToFlashClick}
              disabled={isWritingFlash || modified === 0}
              className={`px-5 py-2 text-sm font-medium rounded-lg shadow-lg transition-all flex items-center gap-2 ${
                modified > 0
                  ? 'bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white shadow-emerald-500/25'
                  : 'bg-gray-800 text-gray-500 cursor-not-allowed'
              }`}
              title="Save parameters to flight controller's permanent storage"
            >
              <Save className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} />
              {isWritingFlash ? 'Saving...' : 'Save All Changes'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1.5 mt-4 flex-wrap items-center">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 transition-all ${
                  isActive
                    ? 'bg-gray-800 text-white shadow-lg'
                    : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                }`}
              >
                <tab.Icon className={`w-4 h-4 ${isActive ? tab.color : `${tab.color} opacity-50`}`} />
                <span className="text-sm font-medium">{tab.name}</span>
                {tab.badge && (
                  <span className="ml-0.5 px-1.5 py-0.5 text-[10px] bg-zinc-700/50 rounded text-zinc-400">
                    {tab.badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Reboot Required Banner */}
      {rebootRequiredParams.length > 0 && (
        <div className={`shrink-0 px-6 py-3 border-b flex items-center justify-between ${
          rebooting
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {rebooting ? (
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin shrink-0" />
            ) : (
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
            )}
            <div>
              {rebooting ? (
                <>
                  <span className="text-sm text-blue-300 font-medium">
                    {connectionState.isReconnecting
                      ? `Reconnecting to flight controller...`
                      : 'Rebooting flight controller...'}
                  </span>
                  {connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
                    <span className="text-sm text-blue-400/70 ml-2">
                      Attempt {connectionState.reconnectAttempt}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
                    </span>
                  )}
                </>
              ) : (
                <>
                  <span className="text-sm text-amber-300 font-medium">Reboot Required</span>
                  <span className="text-sm text-amber-400/70 ml-2">
                    {rebootRequiredParams.length} parameter{rebootRequiredParams.length !== 1 ? 's' : ''} need a reboot to take effect:
                    {' '}<span className="font-mono text-xs">{rebootRequiredParams.join(', ')}</span>
                  </span>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!rebooting && (
              <>
                <button
                  onClick={() => setRebootRequiredParams([])}
                  className="px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors"
                >
                  Dismiss
                </button>
                <button
                  onClick={handleReboot}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-colors flex items-center gap-1.5"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                  Reboot Now
                </button>
              </>
            )}
          </div>
        </div>
      )}

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
              {modifiedParameters().some(p => isRebootRequired(p.id)) && (
                <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Some parameters require a reboot to take effect.
                </p>
              )}
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
                      <td className="py-2 font-mono text-zinc-300">
                        {param.id}
                        {isRebootRequired(param.id) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                            Reboot
                          </span>
                        )}
                      </td>
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

      {/* Parameter History Modal */}
      {showHistory && (
        <ParamHistoryModal
          boardUid={connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`}
          boardName={connectionState.vehicleType || 'Unknown'}
          onClose={() => setShowHistory(false)}
          showToast={showToast}
        />
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
