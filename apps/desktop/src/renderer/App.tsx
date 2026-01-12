import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ConnectionPanel } from './components/connection/ConnectionPanel';
import { TelemetryDashboard } from './components/telemetry/TelemetryDashboard';
import { NavigationRail } from './components/navigation/NavigationRail';
import { ParametersView } from './components/parameters/ParametersView';
import { MissionPlanningView } from './components/mission';
import { SettingsView } from './components/settings';
import { FirmwareFlashView } from './components/firmware';
import CliView from './components/cli/CliView';
import { OsdView } from './components/osd/OsdView';
import ReportBugView from './components/report/ReportBugView';
import SitlView from './components/sitl/SitlView';
import { useConnectionStore } from './stores/connection-store';
import { useTelemetryStore } from './stores/telemetry-store';
import { useNavigationStore, type ViewId } from './stores/navigation-store';
import { useParameterStore } from './stores/parameter-store';
import { useMissionStore } from './stores/mission-store';
import { useFenceStore } from './stores/fence-store';
import { useRallyStore } from './stores/rally-store';
import { useLegacyConfigStore } from './stores/legacy-config-store';
import { useCliStore, setupCliDataListener, cleanupCliDataListener } from './stores/cli-store';
import { initializeSettings, useSettingsStore, type VehicleType } from './stores/settings-store';
import { useFlightControlStore } from './stores/flight-control-store';
import type { ElectronAPI } from '../main/preload';
import logoImage from './assets/logo.png';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

// Map MAV_TYPE to our vehicle types
const mavTypeToVehicleType: Record<number, VehicleType> = {
  0: 'copter', 1: 'plane', 2: 'copter', 3: 'copter', 4: 'copter',
  10: 'rover', 11: 'boat', 12: 'sub', 13: 'copter', 14: 'copter',
  15: 'copter', 16: 'plane', 19: 'vtol', 20: 'vtol', 21: 'vtol',
  22: 'vtol', 23: 'vtol', 24: 'vtol', 25: 'vtol',
};

const VEHICLE_TYPE_NAMES: Record<VehicleType, string> = {
  copter: 'Multicopter', plane: 'Fixed Wing', vtol: 'VTOL',
  rover: 'Rover', boat: 'Boat', sub: 'Submarine',
};

// Module-level flag to track if user dismissed mismatch warning this session
let mismatchDismissedForSession = false;

// Vehicle type mismatch dialog
function VehicleMismatchDialog({
  profileType,
  fcType,
  onUpdateProfile,
  onIgnore,
  onDismissSession,
}: {
  profileType: VehicleType;
  fcType: VehicleType;
  onUpdateProfile: () => void;
  onIgnore: () => void;
  onDismissSession: () => void;
}) {
  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl border border-amber-500/50 w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700 bg-amber-500/10">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-white">Vehicle Type Mismatch</h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-gray-300 mb-4">
            Your vehicle profile is set to <span className="font-semibold text-amber-400">{VEHICLE_TYPE_NAMES[profileType]}</span> but
            the connected flight controller is a <span className="font-semibold text-blue-400">{VEHICLE_TYPE_NAMES[fcType]}</span>.
          </p>
          <p className="text-gray-400 text-sm">
            Performance estimates and settings may not be accurate for your actual vehicle.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-700 flex flex-col gap-2">
          <button
            onClick={onUpdateProfile}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Update Profile to {VEHICLE_TYPE_NAMES[fcType]}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onIgnore}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Ignore Once
            </button>
            <button
              onClick={onDismissSession}
              className="flex-1 px-4 py-2 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
            >
              Don't Ask Again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function CollapsedSidebar({ onExpand }: { onExpand: () => void }) {
  const { connectionState } = useConnectionStore();

  const handleDisconnect = async () => {
    await window.electronAPI?.disconnect();
  };

  return (
    <div className="h-full flex flex-col items-center py-4 px-2 gap-4">
      {/* Expand button */}
      <button
        onClick={onExpand}
        className="p-2 rounded-lg hover:bg-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
        title="Expand sidebar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>

      {/* Connection status indicator */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        connectionState.isConnected
          ? 'bg-emerald-500/20 border border-emerald-500/30'
          : 'bg-gray-700/50 border border-gray-600/30'
      }`}>
        <div className={`w-2.5 h-2.5 rounded-full ${
          connectionState.isConnected ? 'bg-emerald-400' : 'bg-gray-500'
        }`} />
      </div>

      {/* System ID */}
      {connectionState.isConnected && connectionState.systemId && (
        <div className="text-center">
          <div className="text-[10px] text-gray-500 uppercase">SYS</div>
          <div className="text-sm font-mono text-gray-300">{connectionState.systemId}</div>
        </div>
      )}

      <div className="flex-1" />

      {/* Disconnect button */}
      {connectionState.isConnected && (
        <button
          onClick={handleDisconnect}
          className="p-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-red-300 transition-colors"
          title="Disconnect"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
          </svg>
        </button>
      )}
    </div>
  );
}

function App() {
  const { connectionState, setConnectionState } = useConnectionStore();
  const { updateAttitude, updatePosition, updateGps, updateBattery, updateVfrHud, updateFlight, reset } = useTelemetryStore();
  const { currentView, setView } = useNavigationStore();
  const { updateParameter, setProgress, setComplete, setError, reset: resetParameters, fetchParameters, fetchMetadata } = useParameterStore();
  const {
    fetchMission,
    setMissionItems,
    updateProgress: updateMissionProgress,
    setCurrentSeq,
    setError: setMissionError,
    setUploadComplete,
    setClearComplete,
    reset: resetMission,
  } = useMissionStore();

  // Fence store
  const {
    setFenceItems,
    updateProgress: updateFenceProgress,
    setFenceStatus,
    setError: setFenceError,
    setUploadComplete: setFenceUploadComplete,
    setClearComplete: setFenceClearComplete,
    reset: resetFence,
  } = useFenceStore();

  // Rally store
  const {
    setRallyItems,
    updateProgress: updateRallyProgress,
    setError: setRallyError,
    setUploadComplete: setRallyUploadComplete,
    setClearComplete: setRallyClearComplete,
    reset: resetRally,
  } = useRallyStore();
  const { reset: resetLegacyConfig } = useLegacyConfigStore();
  const { reset: resetCli } = useCliStore();
  const { clearModeMappings: resetFlightControl, stopOverride } = useFlightControlStore();
  const { vehicles, activeVehicleId, updateVehicle } = useSettingsStore();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Mismatch dialog state
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [pendingView, setPendingView] = useState<ViewId | null>(null);
  const [detectedFcType, setDetectedFcType] = useState<VehicleType | null>(null);

  // Get active vehicle profile type
  const activeVehicle = vehicles.find(v => v.id === activeVehicleId);
  const profileType = activeVehicle?.type || 'copter';

  // Custom view change handler that checks for mismatch
  const handleViewChange = (viewId: ViewId) => {
    // Only check mismatch when connected and not already dismissed
    if (connectionState.isConnected && !mismatchDismissedForSession && connectionState.mavType !== undefined) {
      const fcType = mavTypeToVehicleType[connectionState.mavType] || 'copter';

      // Check if profile type mismatches FC type
      if (profileType !== fcType) {
        setDetectedFcType(fcType);
        setPendingView(viewId);
        setShowMismatchDialog(true);
        return;
      }
    }

    // No mismatch or dismissed, proceed with view change
    setView(viewId);
  };

  // Handle mismatch dialog actions
  const handleUpdateProfile = () => {
    if (activeVehicle && detectedFcType) {
      updateVehicle(activeVehicle.id, { type: detectedFcType });
    }
    setShowMismatchDialog(false);
    if (pendingView) {
      setView(pendingView);
      setPendingView(null);
    }
  };

  const handleIgnoreMismatch = () => {
    setShowMismatchDialog(false);
    if (pendingView) {
      setView(pendingView);
      setPendingView(null);
    }
  };

  const handleDismissSession = () => {
    mismatchDismissedForSession = true;
    setShowMismatchDialog(false);
    if (pendingView) {
      setView(pendingView);
      setPendingView(null);
    }
  };

  // Initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, []);

  // Initialize CLI data listener globally (captures CLI output from any view)
  useEffect(() => {
    console.log('[App] Setting up global CLI data listener');
    setupCliDataListener();
    return () => {
      console.log('[App] Cleaning up global CLI data listener');
      cleanupCliDataListener();
    };
  }, []);

  // Auto-collapse sidebar when connected (keep user's current view)
  useEffect(() => {
    if (connectionState.isConnected) {
      setSidebarCollapsed(true);
    } else {
      setSidebarCollapsed(false);
    }
  }, [connectionState.isConnected]);

  // Auto-load parameters, metadata, and mission when connected (MAVLink only)
  useEffect(() => {
    // Only fetch MAVLink-specific data for MAVLink connections
    if (connectionState.isConnected && connectionState.protocol !== 'msp') {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        fetchParameters();
        // Fetch metadata based on vehicle type
        if (connectionState.mavType !== undefined) {
          fetchMetadata(connectionState.mavType);
        }
        // Auto-download mission from flight controller
        fetchMission();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState.isConnected, connectionState.protocol, connectionState.mavType, fetchParameters, fetchMetadata, fetchMission]);

  // MSP telemetry: only run when on telemetry view (saves CPU/serial when on config screens)
  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      if (currentView === 'telemetry') {
        // Start telemetry when viewing telemetry dashboard
        window.electronAPI.mspStartTelemetry(10);
        console.log('[App] MSP telemetry started (telemetry view active)');
      } else {
        // Stop telemetry when on other views (parameters, mission, etc.)
        window.electronAPI.mspStopTelemetry();
        console.log('[App] MSP telemetry stopped (switched to', currentView, 'view)');
      }
    }

    // Cleanup: stop telemetry when component unmounts or connection drops
    return () => {
      if (connectionState.protocol === 'msp') {
        window.electronAPI.mspStopTelemetry();
      }
    };
  }, [connectionState.isConnected, connectionState.protocol, currentView]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onConnectionState((state) => {
      setConnectionState(state);
      // Reset stores when disconnected, but NOT during:
      // 1. platformChangeInProgress (board is rebooting for platform change)
      // 2. isReconnecting (auto-reconnect in progress after expected reboot)
      const { platformChangeInProgress } = useConnectionStore.getState();
      const shouldSkipReset = platformChangeInProgress || state.isReconnecting;
      if (!state.isConnected && !state.isWaitingForHeartbeat && !shouldSkipReset) {
        reset();
        resetParameters();
        resetMission();
        resetFence();
        resetRally();
        resetLegacyConfig();
        resetCli();
        stopOverride();
        resetFlightControl();
      }
    });
    return unsubscribe;
  }, [setConnectionState, reset, resetParameters, resetMission, resetFence, resetRally, resetLegacyConfig, resetCli, stopOverride, resetFlightControl]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onTelemetryUpdate((update) => {
      switch (update.type) {
        case 'attitude': updateAttitude(update.data); break;
        case 'position': updatePosition(update.data); break;
        case 'gps': updateGps(update.data); break;
        case 'battery': updateBattery(update.data); break;
        case 'vfrHud': updateVfrHud(update.data); break;
        case 'flight': updateFlight(update.data); break;
      }
    });
    return unsubscribe;
  }, [updateAttitude, updatePosition, updateGps, updateBattery, updateVfrHud, updateFlight]);

  // Parameter events
  useEffect(() => {
    const unsubParamValue = window.electronAPI?.onParamValue(updateParameter);
    const unsubProgress = window.electronAPI?.onParamProgress(setProgress);
    const unsubComplete = window.electronAPI?.onParamComplete(setComplete);
    const unsubError = window.electronAPI?.onParamError(setError);

    return () => {
      unsubParamValue?.();
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [updateParameter, setProgress, setComplete, setError]);

  // Mission events
  useEffect(() => {
    const unsubComplete = window.electronAPI?.onMissionComplete(setMissionItems);
    const unsubProgress = window.electronAPI?.onMissionProgress(updateMissionProgress);
    const unsubCurrent = window.electronAPI?.onMissionCurrent(setCurrentSeq);
    const unsubError = window.electronAPI?.onMissionError(setMissionError);
    const unsubUploadComplete = window.electronAPI?.onMissionUploadComplete(setUploadComplete);
    const unsubClearComplete = window.electronAPI?.onMissionClearComplete(setClearComplete);

    return () => {
      unsubComplete?.();
      unsubProgress?.();
      unsubCurrent?.();
      unsubError?.();
      unsubUploadComplete?.();
      unsubClearComplete?.();
    };
  }, [setMissionItems, updateMissionProgress, setCurrentSeq, setMissionError, setUploadComplete, setClearComplete]);

  // Fence events
  useEffect(() => {
    const unsubComplete = window.electronAPI?.onFenceComplete(setFenceItems);
    const unsubProgress = window.electronAPI?.onFenceProgress(updateFenceProgress);
    const unsubStatus = window.electronAPI?.onFenceStatus(setFenceStatus);
    const unsubError = window.electronAPI?.onFenceError(setFenceError);
    const unsubUploadComplete = window.electronAPI?.onFenceUploadComplete(setFenceUploadComplete);
    const unsubClearComplete = window.electronAPI?.onFenceClearComplete(setFenceClearComplete);

    return () => {
      unsubComplete?.();
      unsubProgress?.();
      unsubStatus?.();
      unsubError?.();
      unsubUploadComplete?.();
      unsubClearComplete?.();
    };
  }, [setFenceItems, updateFenceProgress, setFenceStatus, setFenceError, setFenceUploadComplete, setFenceClearComplete]);

  // Rally events
  useEffect(() => {
    const unsubComplete = window.electronAPI?.onRallyComplete(setRallyItems);
    const unsubProgress = window.electronAPI?.onRallyProgress(updateRallyProgress);
    const unsubError = window.electronAPI?.onRallyError(setRallyError);
    const unsubUploadComplete = window.electronAPI?.onRallyUploadComplete(setRallyUploadComplete);
    const unsubClearComplete = window.electronAPI?.onRallyClearComplete(setRallyClearComplete);

    return () => {
      unsubComplete?.();
      unsubProgress?.();
      unsubError?.();
      unsubUploadComplete?.();
      unsubClearComplete?.();
    };
  }, [setRallyItems, updateRallyProgress, setRallyError, setRallyUploadComplete, setRallyClearComplete]);

  // Render the appropriate view based on navigation
  const renderMainContent = () => {
    if (!connectionState.isConnected) {
      // Show view-specific content when disconnected
      if (currentView === 'parameters') {
        return <ParametersView />;
      }
      if (currentView === 'mission') {
        return <MissionPlanningView />;
      }
      if (currentView === 'firmware') {
        return <FirmwareFlashView />;
      }
      if (currentView === 'cli') {
        return <CliView />;
      }
      if (currentView === 'sitl') {
        return <SitlView />;
      }
      if (currentView === 'osd') {
        return <OsdView />;
      }
      if (currentView === 'report') {
        return <ReportBugView />;
      }
      // Default welcome screen for telemetry
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            {/* Logo */}
            <div className="mx-auto w-48 h-48 mb-6 rounded-3xl overflow-hidden">
              <img src={logoImage} alt="ArduDeck" className="w-full h-full object-cover" />
            </div>

            <h2 className="text-2xl font-semibold text-white mb-3">
              Welcome to ArduDeck
            </h2>
            <p className="text-gray-400 mb-8 leading-relaxed">
              Connect to your flight controller using the panel on the left.
              Choose serial, TCP, or UDP connection method.
            </p>

            {/* Feature cards */}
            <div className="grid grid-cols-2 gap-3 text-left">
              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-200 mb-1">Auto-detect</h3>
                <p className="text-xs text-gray-500">Automatically find MAVLink devices</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-200 mb-1">Real-time</h3>
                <p className="text-xs text-gray-500">Live telemetry streaming</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-200 mb-1">Parameters</h3>
                <p className="text-xs text-gray-500">Configure your vehicle</p>
              </div>

              <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30">
                <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center mb-3">
                  <svg className="w-4 h-4 text-orange-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                  </svg>
                </div>
                <h3 className="text-sm font-medium text-gray-200 mb-1">Mission Planning</h3>
                <p className="text-xs text-gray-500">Create flight plans</p>
              </div>
            </div>
          </div>
        </div>
      );
    }

    // Connected - show appropriate view
    switch (currentView) {
      case 'parameters':
        return <ParametersView />;
      case 'mission':
        return <MissionPlanningView />;
      case 'settings':
        return <SettingsView />;
      case 'firmware':
        return <FirmwareFlashView />;
      case 'cli':
        return <CliView />;
      case 'sitl':
        return <SitlView />;
      case 'osd':
        return <OsdView />;
      case 'report':
        return <ReportBugView />;
      case 'telemetry':
      default:
        return <TelemetryDashboard />;
    }
  };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Navigation Rail */}
        <NavigationRail onViewChange={handleViewChange} />

        {/* Sidebar - collapsible */}
        <aside className={`border-r border-gray-800/50 bg-gray-900/30 shrink-0 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-80'
        }`}>
          {sidebarCollapsed ? (
            <CollapsedSidebar onExpand={() => setSidebarCollapsed(false)} />
          ) : (
            <div className="relative h-full">
              <ConnectionPanel />
              {connectionState.isConnected && (
                <button
                  onClick={() => setSidebarCollapsed(true)}
                  className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
                  title="Collapse sidebar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {renderMainContent()}
        </main>
      </div>

      {/* Vehicle type mismatch dialog */}
      {showMismatchDialog && detectedFcType && (
        <VehicleMismatchDialog
          profileType={profileType}
          fcType={detectedFcType}
          onUpdateProfile={handleUpdateProfile}
          onIgnore={handleIgnoreMismatch}
          onDismissSession={handleDismissSession}
        />
      )}
    </AppShell>
  );
}

export default App;
