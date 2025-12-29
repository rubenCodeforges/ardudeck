import { useEffect, useState } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ConnectionPanel } from './components/connection/ConnectionPanel';
import { TelemetryDashboard } from './components/telemetry/TelemetryDashboard';
import { NavigationRail } from './components/navigation/NavigationRail';
import { ParametersView } from './components/parameters/ParametersView';
import { useConnectionStore } from './stores/connection-store';
import { useTelemetryStore } from './stores/telemetry-store';
import { useNavigationStore } from './stores/navigation-store';
import { useParameterStore } from './stores/parameter-store';
import type { ElectronAPI } from '../main/preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Auto-collapse sidebar and reset to telemetry view when connected
  useEffect(() => {
    if (connectionState.isConnected) {
      setSidebarCollapsed(true);
      setView('telemetry');
    } else {
      setSidebarCollapsed(false);
    }
  }, [connectionState.isConnected, setView]);

  // Auto-load parameters and metadata when connected
  useEffect(() => {
    if (connectionState.isConnected) {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        fetchParameters();
        // Fetch metadata based on vehicle type
        if (connectionState.mavType !== undefined) {
          fetchMetadata(connectionState.mavType);
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState.isConnected, connectionState.mavType, fetchParameters, fetchMetadata]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onConnectionState((state) => {
      setConnectionState(state);
      // Reset telemetry and parameters when disconnected
      if (!state.isConnected && !state.isWaitingForHeartbeat) {
        reset();
        resetParameters();
      }
    });
    return unsubscribe;
  }, [setConnectionState, reset, resetParameters]);

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

  // Render the appropriate view based on navigation
  const renderMainContent = () => {
    if (!connectionState.isConnected) {
      // Show welcome screen for telemetry view, or parameters placeholder for parameters view
      if (currentView === 'parameters') {
        return <ParametersView />;
      }
      // Default welcome screen for telemetry
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-md">
            {/* Icon */}
            <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-500/20 to-purple-500/20 border border-gray-700/50 flex items-center justify-center mb-6">
              <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
              </svg>
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
      case 'telemetry':
      default:
        return <TelemetryDashboard />;
    }
  };

  return (
    <AppShell>
      <div className="flex h-full">
        {/* Navigation Rail */}
        <NavigationRail />

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
    </AppShell>
  );
}

export default App;
