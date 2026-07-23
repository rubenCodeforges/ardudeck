import { useEffect, useState, useRef } from 'react';
import { AppShell } from './components/layout/AppShell';
import { ConnectionPanel } from './components/connection/ConnectionPanel';
import { TelemetryDashboard } from './components/telemetry/TelemetryDashboard';
import { NavigationRail } from './components/navigation/NavigationRail';
import { ParametersView } from './components/parameters/ParametersView';
import { DeepLinkInstallPrompt } from './components/modules/DeepLinkInstallPrompt';
import { MissionPlanningView } from './components/mission';
import { SettingsView } from './components/settings';
import { FirmwareFlashView } from './components/firmware';
import CliView from './components/cli/CliView';
import { OsdView } from './components/osd/OsdView';
import { ErrorBoundary } from './components/ui/ErrorBoundary';
import ReportBugView from './components/report/ReportBugView';
import SitlView from './components/sitl/SitlView';
import { CalibrationView } from './components/calibration/CalibrationView';
import { MissionLibraryView } from './components/mission-library/MissionLibraryView';
import { LuaGraphView } from './components/lua-graph/LuaGraphView';
import { ModuleManagerView } from './components/modules/ModuleManagerView';
import { ModuleRuntime } from './modules/ModuleRuntime';
import { MountPoint } from './modules/MountPoint';
import { ModuleDock } from './modules/ModuleDock';
import { CompanionDashboard } from './components/companion/CompanionDashboard';
import { LogsView } from './components/logs/LogsView';
import { MavlinkInspectorView } from './components/inspector/MavlinkInspectorView';
import { setupWorkspaceSync } from './stores/workspace-store';
import { startInspector } from './stores/inspector-store';
import { startPerfProbe, probeCount } from './lib/perf-probe';
import { startSafetyMonitor, refreshContext as refreshSafetyMonitorContext } from './safety-monitor/source';
import { useConnectionStore } from './stores/connection-store';
import { useActiveVehicleSync } from './hooks/useActiveVehicleSync';
import { useActiveVehicleIdentity } from './hooks/useFleet';
import { useActiveVehicleStore } from './stores/active-vehicle-store';
import { useFleetTelemetryStore } from './stores/fleet-telemetry-store';
import { shouldMirrorToSharedStore } from './lib/telemetry-routing';
import { useCalibrationStore } from './stores/calibration-store';
import { useTelemetryStore } from './stores/telemetry-store';
import { useNavigationStore, isViewId, type ViewId } from './stores/navigation-store';
import { useModuleStore } from './stores/module-store';
import { isViewAvailable, useEnabledCapabilitySlugs } from './modules/capabilities';
import { useParameterStore } from './stores/parameter-store';
import { useMissionStore, hasMissionAutosave, restoreMissionAutosave } from './stores/mission-store';
import { useSurveyStore } from './stores/survey-store';
import type { SurveyConfig } from './components/survey/survey-types';
import { useFenceStore } from './stores/fence-store';
import { useRallyStore } from './stores/rally-store';
import { useLegacyConfigStore } from './stores/legacy-config-store';
import { useCliStore, setupCliDataListener, cleanupCliDataListener } from './stores/cli-store';
import { initializeSettings, useSettingsStore, type VehicleType, type ExperienceLevel } from './stores/settings-store';
import { ExperienceLevelDialog } from './components/ui/ExperienceLevelDialog';
import { AppTourProvider } from './components/tours/AppTourProvider';
import { useFlightControlStore } from './stores/flight-control-store';
import { useCompanionStore } from './stores/companion-store';
import { useMessagesStore } from './stores/messages-store';
import { useSigningStore } from './stores/signing-store';
import { useBoardProfileAssociation } from './hooks/useBoardProfileAssociation';
import { SitlAutoApplyWatcher } from './components/settings/vehicle-profile/SitlAutoApplyWatcher';
import { ProfileApplyOverlay } from './components/settings/vehicle-profile/ProfileApplyOverlay';
import { ParameterCompareModalRoot } from './components/parameters/ParameterCompareModalRoot';
import { GlobalTooltip } from './components/GlobalTooltip';
import { FleetMinimap } from './components/fleet/FleetMinimap';
import { ActivityIndicator } from './components/ui/ActivityIndicator';
import type { ElectronAPI } from '../main/preload';
import logoImage from './assets/logo.png';

// Welcome-screen quick-link cards. Every entry works WITHOUT a connected
// vehicle - the welcome screen only shows while disconnected. Add a card by
// appending here; the grid renders them generically. Static class strings keep
// them Tailwind-purge-safe (no dynamically built class names).
type WelcomeCardColor = 'orange' | 'teal' | 'purple' | 'blue' | 'amber' | 'indigo' | 'emerald';

const WELCOME_CARD_STYLES: Record<WelcomeCardColor, { border: string; ring: string; iconBg: string; iconText: string }> = {
  orange: { border: 'hover:border-orange-500/40', ring: 'focus:ring-orange-500/40', iconBg: 'bg-orange-500/10', iconText: 'text-orange-400' },
  teal: { border: 'hover:border-teal-500/40', ring: 'focus:ring-teal-500/40', iconBg: 'bg-teal-500/10', iconText: 'text-teal-400' },
  purple: { border: 'hover:border-purple-500/40', ring: 'focus:ring-purple-500/40', iconBg: 'bg-purple-500/10', iconText: 'text-purple-400' },
  blue: { border: 'hover:border-blue-500/40', ring: 'focus:ring-blue-500/40', iconBg: 'bg-blue-500/10', iconText: 'text-blue-400' },
  amber: { border: 'hover:border-amber-500/40', ring: 'focus:ring-amber-500/40', iconBg: 'bg-amber-500/10', iconText: 'text-amber-400' },
  indigo: { border: 'hover:border-indigo-500/40', ring: 'focus:ring-indigo-500/40', iconBg: 'bg-indigo-500/10', iconText: 'text-indigo-400' },
  emerald: { border: 'hover:border-emerald-500/40', ring: 'focus:ring-emerald-500/40', iconBg: 'bg-emerald-500/10', iconText: 'text-emerald-400' },
};

interface WelcomeCard {
  title: string;
  desc: string;
  color: WelcomeCardColor;
  iconPath: string;
  badge?: string;
  /** Navigate to a view, or run a custom action (e.g. open a window). */
  view?: ViewId;
  run?: () => void;
}

const WELCOME_CARDS: WelcomeCard[] = [
  { title: 'Mission Planning', desc: 'Waypoints, surveys & geofences', color: 'orange', view: 'mission', iconPath: 'M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7' },
  { title: 'Area Editor', desc: 'Draw mission areas on a live map', color: 'teal', badge: 'New', run: () => { window.electronAPI?.openAreaEditor?.().catch(() => undefined); }, iconPath: 'M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z' },
  { title: 'Firmware Flash', desc: 'Flash firmware over USB or DFU', color: 'amber', view: 'firmware', iconPath: 'M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z' },
  { title: 'SITL Simulator', desc: 'Test firmware without hardware', color: 'purple', view: 'sitl', iconPath: 'M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { title: '3D Sim World', desc: 'Fly SITL in a persistent 3D world', color: 'emerald', badge: 'New', run: () => { window.electronAPI?.openDetachedWindow?.({ componentId: 'sim-world', title: '3D Sim World', initialBounds: { width: 1280, height: 800 } }); }, iconPath: 'M21 12a9 9 0 11-18 0 9 9 0 0118 0zM3.6 9h16.8M3.6 15h16.8M12 3a15 15 0 010 18M12 3a15 15 0 000 18' },
  { title: 'Flight Log Analysis', desc: 'AI-powered flight log review', color: 'blue', view: 'logs', iconPath: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z' },
  { title: 'Mission Library', desc: 'Browse & manage saved plans', color: 'indigo', view: 'library', iconPath: 'M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253' },
];

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
      <div className="bg-surface-raised rounded-xl border border-amber-500/50 w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle bg-amber-500/10">
          <div className="flex items-center gap-3">
            <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <h2 className="text-lg font-semibold text-content">Vehicle Type Mismatch</h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          <p className="text-content mb-4">
            Your vehicle profile is set to <span className="font-semibold text-amber-400">{VEHICLE_TYPE_NAMES[profileType]}</span> but
            the connected flight controller is a <span className="font-semibold text-blue-400">{VEHICLE_TYPE_NAMES[fcType]}</span>.
          </p>
          <p className="text-content-secondary text-sm">
            Performance estimates and settings may not be accurate for your actual vehicle.
          </p>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-subtle flex flex-col gap-2">
          <button
            onClick={onUpdateProfile}
            className="w-full px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-medium transition-colors"
          >
            Update Profile to {VEHICLE_TYPE_NAMES[fcType]}
          </button>
          <div className="flex gap-2">
            <button
              onClick={onIgnore}
              className="flex-1 px-4 py-2 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors"
            >
              Ignore Once
            </button>
            <button
              onClick={onDismissSession}
              className="flex-1 px-4 py-2 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors"
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
  // Status chrome follows the active fleet vehicle, not the idle primary link.
  const identity = useActiveVehicleIdentity();

  const handleDisconnect = async () => {
    await window.electronAPI?.disconnect();
  };

  return (
    <div className="h-full flex flex-col items-center py-4 px-2 gap-4">
      {/* Expand button */}
      <button
        onClick={onExpand}
        className="p-2 rounded-lg hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
        title="Expand sidebar"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
        </svg>
      </button>

      {/* Connection status indicator (fleet-aware: lit when a fleet is live too) */}
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
        identity.connected
          ? 'bg-emerald-500/20 border border-emerald-500/30'
          : 'bg-surface-raised border border-subtle'
      }`}>
        <div className={`w-2.5 h-2.5 rounded-full ${
          identity.connected ? 'bg-emerald-400' : 'bg-gray-500'
        }`} />
      </div>

      {/* Active vehicle identity (SYS id of the selected fleet vehicle, or the
          fleet size when nothing is selected) */}
      {identity.connected && identity.label && (
        <div className="text-center">
          <div className="text-[10px] text-content-secondary uppercase">{identity.sysid !== null ? 'SYS' : ''}</div>
          <div className="text-sm font-mono text-content">{identity.sysid !== null ? identity.sysid : identity.label}</div>
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
  // Mirror the main-process connection registry into the active-vehicle store
  // (vehicle discovery/loss, active selection). Single-vehicle behavior is
  // unchanged - the store auto-promotes the first discovered vehicle.
  useActiveVehicleSync();

  const { connectionState, setConnectionState } = useConnectionStore();
  // A multi-vehicle/swarm fleet connects over background transports that never
  // set the primary `isConnected` flag. Treat "the fleet exists" as connected for
  // view-routing + status, so the dashboard stays up. We key off the known-vehicle
  // COUNT (not the active selection) so DESELECTING a vehicle keeps you on the
  // telemetry page with nothing selected, instead of bouncing to the Welcome screen.
  const activeVehicleKey = useActiveVehicleStore((s) => s.activeVehicleKey);
  const fleetVehicleCount = useActiveVehicleStore((s) => Object.keys(s.knownVehicles).length);
  const isConnected = connectionState.isConnected || activeVehicleKey !== null || fleetVehicleCount > 0;
  // Select telemetry ACTIONS individually (not the whole store). Actions are
  // referentially stable, so App no longer re-renders on every 10 Hz telemetry
  // batch - which, with an unmemoised TelemetryDashboard below, was reconciling
  // the entire telemetry page at packet rate and starving the main thread.
  const updateAttitude = useTelemetryStore((s) => s.updateAttitude);
  const updatePosition = useTelemetryStore((s) => s.updatePosition);
  const updateGps = useTelemetryStore((s) => s.updateGps);
  const updateBattery = useTelemetryStore((s) => s.updateBattery);
  const updateVfrHud = useTelemetryStore((s) => s.updateVfrHud);
  const updateFlight = useTelemetryStore((s) => s.updateFlight);
  const updateBatch = useTelemetryStore((s) => s.updateBatch);
  const reset = useTelemetryStore((s) => s.reset);
  const addStatusMessage = useMessagesStore((s) => s.addMessage);
  const clearMessages = useMessagesStore((s) => s.clear);
  const { currentView, setView } = useNavigationStore();
  // Parameter ACTIONS individually - whole-subscribing this store re-rendered
  // App on every PARAM_VALUE during a download (hundreds/sec), the hard freeze
  // on connect. `paramCount` is read live via getState() inside the effects
  // below, so App never re-renders on it.
  const updateParameter = useParameterStore((s) => s.updateParameter);
  const bulkLoadParameters = useParameterStore((s) => s.bulkLoadParameters);
  const setProgress = useParameterStore((s) => s.setProgress);
  const setComplete = useParameterStore((s) => s.setComplete);
  const setError = useParameterStore((s) => s.setError);
  const resetParameters = useParameterStore((s) => s.reset);
  const fetchParameters = useParameterStore((s) => s.fetchParameters);
  const fetchMetadata = useParameterStore((s) => s.fetchMetadata);
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
  const { vehicles, activeVehicleId, updateVehicle, experienceLevel, experienceLevelVersion, setExperienceLevel } = useSettingsStore();
  const sidebarCollapsedByContext = useSettingsStore((s) => s.sidebarCollapsedByContext);
  const setSidebarCollapsedForContext = useSettingsStore((s) => s.setSidebarCollapsedForContext);
  // Per-context collapse: shared "connected" state while connected, otherwise
  // per-screen while offline. Default: collapsed when connected (connect panel
  // not needed), expanded when offline. A manual toggle is remembered for that
  // exact context and persisted, so e.g. collapsing on Mission Planning while
  // offline sticks there without affecting other screens.
  const sidebarContextKey = connectionState.isConnected ? 'connected' : `offline:${currentView}`;
  const sidebarCollapsed =
    sidebarCollapsedByContext[sidebarContextKey] ?? connectionState.isConnected;
  const setSidebarCollapsed = (collapsed: boolean) =>
    setSidebarCollapsedForContext(sidebarContextKey, collapsed);
  const {
    reset: resetCalibration,
    handleProgressUpdate: handleCalibrationProgressUpdate,
    handleCalibrationComplete,
  } = useCalibrationStore();
  // Board-profile association (auto-link boards to vehicle profiles)
  useBoardProfileAssociation();

  // Mismatch dialog state
  const [showMismatchDialog, setShowMismatchDialog] = useState(false);
  const [pendingView, setPendingView] = useState<ViewId | null>(null);
  const [detectedFcType, setDetectedFcType] = useState<VehicleType | null>(null);

  // CLI exit dialog state
  const [showCliExitDialog, setShowCliExitDialog] = useState(false);
  const [cliExitPendingView, setCliExitPendingView] = useState<ViewId | null>(null);

  // Experience level dialog state
  const [showExperienceDialog, setShowExperienceDialog] = useState(false);

  // Get active vehicle profile type
  const activeVehicle = vehicles.find(v => v.id === activeVehicleId);
  const profileType = activeVehicle?.type || 'copter';

  // Custom view change handler that checks for CLI exit and mismatch
  const handleViewChange = (viewId: ViewId) => {
    // Check if navigating away from CLI while in CLI mode
    if (currentView === 'cli' && useCliStore.getState().isCliMode && connectionState.isConnected) {
      setCliExitPendingView(viewId);
      setShowCliExitDialog(true);
      return;
    }

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

  // CLI exit dialog handlers
  const handleCliExitConfirm = async () => {
    setShowCliExitDialog(false);
    const targetView = cliExitPendingView;
    setCliExitPendingView(null);
    // Exit CLI mode (triggers scheduleReconnect in main process)
    await useCliStore.getState().exitCliMode();
    if (targetView) {
      setView(targetView);
    }
  };

  const handleCliExitCancel = () => {
    setShowCliExitDialog(false);
    setCliExitPendingView(null);
  };

  // Initialize settings on mount
  useEffect(() => {
    initializeSettings();
  }, []);

  // Crash recovery: if a mission was autosaved last session and nothing has
  // been loaded yet, restore it so hours of survey prep survive a crash/close.
  useEffect(() => {
    const s = useMissionStore.getState();
    if (s.missionItems.length === 0 && s.groups.length === 0 && hasMissionAutosave()) {
      restoreMissionAutosave();
    }
  }, []);

  // Start the MAVLink Inspector pipeline (packet listener + 4Hz tick) and
  // hydrate the workspace store with any detached windows already open. Both
  // are idempotent — safe across hot-reloads.
  useEffect(() => {
    startInspector();
    startSafetyMonitor();
    const cleanup = setupWorkspaceSync();
    // TEMP perf probe (diagnosing in-flight telemetry freeze). Counts the raw
    // packet rate reaching this window; the [PERF] summary logs every 2s.
    startPerfProbe('telemetry-win');
    const unsubProbe = window.electronAPI?.onPacket?.(() => probeCount('pkt.rx'));
    return () => { cleanup?.(); unsubProbe?.(); };
  }, []);

  // Show experience level dialog on first launch or version change
  useEffect(() => {
    if (!useSettingsStore.getState()._isInitialized) return;
    (async () => {
      const currentVersion = await window.electronAPI?.getAppVersion();
      if (!currentVersion) return;
      if (!experienceLevel || experienceLevelVersion !== currentVersion) {
        setShowExperienceDialog(true);
      }
    })();
  }, [experienceLevel, experienceLevelVersion]);

  const handleExperienceLevelSelect = async (level: ExperienceLevel) => {
    const currentVersion = await window.electronAPI?.getAppVersion();
    setExperienceLevel(level, currentVersion || '0.0.0');
    setShowExperienceDialog(false);
  };

  // Initialize CLI data listener globally (captures CLI output from any view)
  useEffect(() => {
    console.log('[App] Setting up global CLI data listener');
    setupCliDataListener();
    return () => {
      console.log('[App] Cleaning up global CLI data listener');
      cleanupCliDataListener();
    };
  }, []);


  // Auto-load parameters, metadata, and mission when connected (MAVLink only)
  useEffect(() => {
    // Only fetch MAVLink-specific data for MAVLink connections
    if (connectionState.isConnected && connectionState.protocol !== 'msp') {
      // Small delay to ensure connection is stable
      const timer = setTimeout(() => {
        // Only fetch params on fresh connection (not reconnection after reboot)
        if (useParameterStore.getState().paramCount === 0) {
          fetchParameters();
        }
        // Fetch metadata based on vehicle type
        if (connectionState.mavType !== undefined) {
          fetchMetadata(connectionState.mavType);
        }
        // Auto-download the vehicle's mission ONLY when we have nothing locally.
        // The FC holds the flattened union of whatever was uploaded, so if the
        // operator has been planning (surveys, hand-placed WPs, a loaded file),
        // an auto-download drops a redundant flat "From vehicle" group on top of
        // their work, duplicating every waypoint and inflating the group list.
        // With local content present they can still pull it manually from the
        // toolbar (which replaces the prior FC import rather than stacking).
        const mission = useMissionStore.getState();
        if (mission.missionItems.length === 0 && mission.groups.length === 0) {
          fetchMission();
        }
        // Refresh the safety monitor's parameter context (IMAX / AHRS_TRIM /
        // GCS_PID_MASK) so the integrator gauges and PID signals are scaled.
        void refreshSafetyMonitorContext();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState.isConnected, connectionState.protocol, connectionState.mavType, fetchParameters, fetchMetadata, fetchMission]);

  // Signing-aware retry: when signing state changes mid-connection (e.g. key auto-matched
  // or mismatch resolved), re-fetch params if they haven't loaded yet.
  const signingEnabled = useSigningStore((s) => s.enabled);
  const signingKeyMismatch = useSigningStore((s) => s.keyMismatch);
  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol !== 'msp' && useParameterStore.getState().paramCount === 0) {
      // Signing state just changed - retry param fetch after short delay
      const timer = setTimeout(() => {
        if (useParameterStore.getState().paramCount === 0) {
          fetchParameters();
        }
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [signingEnabled, signingKeyMismatch]);

  // MSP telemetry: only run when on telemetry view
  // Parameters view handles its own telemetry via MspConfigView (sensors tab only)
  // OSD view manages its own telemetry start/stop based on demo/live mode
  useEffect(() => {
    if (connectionState.isConnected && connectionState.protocol === 'msp') {
      if (currentView === 'telemetry') {
        // Start telemetry when viewing telemetry dashboard
        window.electronAPI.mspStartTelemetry(10);
        console.log('[App] MSP telemetry started (telemetry view active)');
      } else if (currentView !== 'osd') {
        // Stop telemetry when on other views (OSD manages its own)
        // Note: Parameters/Sensors tab handles its own telemetry in MspConfigView
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
        // Keep mission, fence, and rally data on disconnect - user may be planning offline
        resetLegacyConfig();
        resetCli();
        stopOverride();
        resetFlightControl();
        resetCalibration();
        clearMessages();
      }
    });
    return () => { unsubscribe?.(); };
  }, [setConnectionState, reset, resetParameters, resetMission, resetFence, resetRally, resetLegacyConfig, resetCli, stopOverride, resetFlightControl, resetCalibration, clearMessages]);

  // Batched telemetry handler (preferred - single IPC message, single store update)
  const firstSeenVehicleKeyRef = useRef<string | null>(null);
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onTelemetryBatch((batch) => {
      const vehicleKey = batch.__vehicleKey ?? '__primary__';
      // Always accumulate per-vehicle telemetry for the fleet strip / map.
      const fleet = useFleetTelemetryStore.getState();
      fleet.applyBatch(vehicleKey, batch);
      // The flat legacy store (which the map/HUD follow) must reflect exactly ONE
      // vehicle. Lock it onto the active vehicle, or — before one is selected —
      // a single fallback vehicle. Without this lock a fleet with no active
      // vehicle let every vehicle overwrite the store, so the map auto-follow
      // flew to each one in turn (endless looping over the fleet). The fallback
      // self-heals: if the locked vehicle drops (or on reconnect) the next batch
      // adopts a live vehicle, so the shared view never freezes on a stale key.
      if (vehicleKey !== '__primary__') {
        const fs = firstSeenVehicleKeyRef.current;
        if (fs === null || !(fs in fleet.byVehicle)) {
          firstSeenVehicleKeyRef.current = vehicleKey;
        }
      }
      const activeKey = useActiveVehicleStore.getState().activeVehicleKey;
      if (shouldMirrorToSharedStore(vehicleKey, activeKey, firstSeenVehicleKeyRef.current)) {
        updateBatch(batch);
      }
    });
    return () => { unsubscribe?.(); };
  }, [updateBatch]);

  // Legacy individual telemetry handler (for MAVLink or fallback)
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
    return () => { unsubscribe?.(); };
  }, [updateAttitude, updatePosition, updateGps, updateBattery, updateVfrHud, updateFlight]);

  // MAVLink STATUSTEXT handler
  useEffect(() => {
    const unsubscribe = window.electronAPI?.onStatusText((msg) => {
      addStatusMessage(msg.severity, msg.severityLabel as any, msg.text);
    });
    return () => { unsubscribe?.(); };
  }, [addStatusMessage]);

  // Parameter events
  useEffect(() => {
    const unsubParamValue = window.electronAPI?.onParamValue(updateParameter);
    const unsubBulkLoad = window.electronAPI?.onParamBulkLoad(bulkLoadParameters);
    const unsubProgress = window.electronAPI?.onParamProgress(setProgress);
    const unsubComplete = window.electronAPI?.onParamComplete(setComplete);
    const unsubError = window.electronAPI?.onParamError(setError);

    return () => {
      unsubParamValue?.();
      unsubBulkLoad?.();
      unsubProgress?.();
      unsubComplete?.();
      unsubError?.();
    };
  }, [updateParameter, bulkLoadParameters, setProgress, setComplete, setError]);

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

  // Mirror the authored mission (items + groups + home + fcSeqOffset) to any
  // detached pop-out window (map, 3D world) so they render the SAME mission the
  // main window holds — including survey / file-loaded / hand-placed missions,
  // not just FC downloads. Only the primary window (App) publishes; pop-outs
  // apply it via useDetachedSubscriptions. `currentSeq` is intentionally left
  // out (it streams live over MISSION_CURRENT to every window already).
  useEffect(() => {
    const publish = () => {
      const s = useMissionStore.getState();
      window.electronAPI?.publishMissionMirror?.({
        items: s.missionItems,
        groups: s.groups,
        home: s.homePosition,
        fcSeqOffset: s.fcSeqOffset,
      }).catch(() => {});
    };
    publish(); // seed the cache for pop-outs opened before the first edit
    let prevItems = useMissionStore.getState().missionItems;
    let prevGroups = useMissionStore.getState().groups;
    let prevHome = useMissionStore.getState().homePosition;
    return useMissionStore.subscribe((state) => {
      if (state.missionItems === prevItems && state.groups === prevGroups && state.homePosition === prevHome) return;
      prevItems = state.missionItems;
      prevGroups = state.groups;
      prevHome = state.homePosition;
      publish();
    });
  }, []);

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

  // Companion computer IPC listeners
  const setCompanionConnectionState = useCompanionStore((s) => s.setConnectionState);
  const setCompanionMetrics = useCompanionStore((s) => s.setMetrics);
  const setCompanionProcesses = useCompanionStore((s) => s.setProcesses);
  const addCompanionLog = useCompanionStore((s) => s.addLog);

  useEffect(() => {
    const cleanups = [
      window.electronAPI.onCompanionConnectionState(setCompanionConnectionState),
      window.electronAPI.onCompanionMetrics(setCompanionMetrics),
      window.electronAPI.onCompanionProcesses(setCompanionProcesses),
      window.electronAPI.onCompanionLogs(addCompanionLog),
      window.electronAPI.onCompanionHeartbeat((data) => {
        useCompanionStore.getState().setHeartbeat(data.online, data.lastSeen, data.systemType);
      }),
    ];
    return () => cleanups.forEach((fn) => fn());
  }, [setCompanionConnectionState, setCompanionMetrics, setCompanionProcesses, addCompanionLog]);

  // Load installed modules once so capability gating reflects what's enabled.
  useEffect(() => {
    void useModuleStore.getState().loadModules();
  }, []);

  // ardudeck://open?view=<id> deep link -> navigate, but only to a real view
  // whose capability (if any) is enabled.
  const enabledCapabilitySlugs = useEnabledCapabilitySlugs();
  useEffect(() => {
    const unsub = window.electronAPI.onNavDeepLinkOpen(({ view }) => {
      if (isViewId(view) && isViewAvailable(view, enabledCapabilitySlugs)) {
        setView(view);
      }
    });
    return () => { unsub(); };
  }, [setView, enabledCapabilitySlugs]);

  // Calibration events
  useEffect(() => {
    const unsubProgress = window.electronAPI?.onCalibrationProgress?.((event) => {
      handleCalibrationProgressUpdate(
        event.progress,
        event.statusText,
        event.currentPosition,
        event.positionStatus,
        event.countdown,
        event.compassProgress
      );
    });
    const unsubComplete = window.electronAPI?.onCalibrationComplete?.((event) => {
      handleCalibrationComplete(event.success, event.data, event.error);
    });

    return () => {
      unsubProgress?.();
      unsubComplete?.();
    };
  }, [handleCalibrationProgressUpdate, handleCalibrationComplete]);

  // Area Editor commit: receive a polygon from the detached editor window,
  // create a persistent survey group from it, and navigate to the mission view.
  // Only App (main window) mounts this — the editor renders DetachedRoot, which
  // never renders App.
  useEffect(() => {
    const unsub = window.electronAPI?.onAreaReceived?.((data) => {
      void useSurveyStore.getState().addSurveyAreaFromPolygon(data.polygon);
      useNavigationStore.getState().setView('mission');
    });
    return () => { unsub?.(); };
  }, []);

  // Area Editor multi-area commit: receive multiple polygons (each with optional
  // holes) from the detached editor window, create persistent survey groups for
  // all of them in one atomic step, then navigate to the mission view.
  useEffect(() => {
    const unsub = window.electronAPI?.onAreasReceived?.((data) => {
      // Use the editor's own survey config so the mission reproduces exactly
      // what the editor briefing showed. A corridor additionally forces the
      // corridor pattern + swath width so its polygon is treated as an open
      // centerline rather than a filled area.
      const areas = data.areas.map((a) => {
        const base = a.config as Partial<Omit<SurveyConfig, 'polygon' | 'holes'>> | undefined;
        // The editor's workspace polygon (allowed flight area) rides in via the
        // config so it lands on SurveyConfig.workspace -> SurveyGroup.workspace.
        const workspace = a.workspace && a.workspace.length >= 3 ? { workspace: a.workspace } : undefined;
        const configOverride =
          a.kind === 'corridor'
            ? {
                ...(base ?? {}),
                pattern: 'corridor' as const,
                ...(a.corridorWidth ? { corridorWidth: a.corridorWidth } : {}),
                ...(a.corridorBranches && a.corridorBranches.length > 0 ? { corridorBranches: a.corridorBranches } : {}),
                ...(workspace ?? {}),
              }
            : workspace
              ? { ...(base ?? {}), ...workspace }
              : base;
        return { polygon: a.polygon, holes: a.holes, name: a.name, configOverride };
      });
      void useSurveyStore.getState().addSurveyAreasFromPolygons(areas);
      useNavigationStore.getState().setView('mission');
    });
    return () => { unsub?.(); };
  }, []);

  // Render the appropriate view based on navigation
  const renderMainContent = () => {
    if (!isConnected) {
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
      if (currentView === 'library') {
        return <MissionLibraryView />;
      }
      if (currentView === 'report') {
        return <ReportBugView />;
      }
      if (currentView === 'lua-graph') {
        return <LuaGraphView />;
      }
      if (currentView === 'modules') {
        return <ModuleManagerView />;
      }
      if (currentView === 'companion') {
        return <CompanionDashboard />;
      }
      if (currentView === 'logs') {
        return <LogsView />;
      }
      if (currentView === 'inspector') {
        return <MavlinkInspectorView />;
      }
      if (currentView === 'settings') {
        return <SettingsView />;
      }
      // Default welcome screen for telemetry
      return (
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center max-w-2xl">
            {/* Logo */}
            <div className="mx-auto w-48 h-48 mb-6 rounded-3xl overflow-hidden">
              <img src={logoImage} alt="ArduDeck" className="w-full h-full object-cover" />
            </div>

            <h2 className="text-2xl font-semibold text-content mb-3">
              Welcome to ArduDeck
            </h2>
            <p className="text-content-secondary mb-8 leading-relaxed max-w-md mx-auto">
              Connect to your flight controller using the panel on the left,
              or jump straight into one of the tools below.
            </p>

            {/* Feature cards - quick links to the most-used tools. Every card
                works without a connected vehicle. Defined in WELCOME_CARDS. */}
            <div data-tour="welcome-cards" className="grid grid-cols-3 auto-rows-fr gap-3 text-left">
              {WELCOME_CARDS.map((card) => {
                const s = WELCOME_CARD_STYLES[card.color];
                return (
                  <button
                    key={card.title}
                    type="button"
                    onClick={() => { if (card.run) card.run(); else if (card.view) setView(card.view); }}
                    className={`group relative h-full p-4 text-left rounded-xl bg-surface border border-subtle transition-colors hover:bg-surface-raised ${s.border} focus:outline-none focus:ring-2 ${s.ring}`}
                  >
                    {card.badge ? (
                      <span className="absolute top-3 right-3 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-300 bg-teal-500/15 border border-teal-500/30 rounded">
                        {card.badge}
                      </span>
                    ) : (
                      <svg className="absolute top-4 right-4 w-4 h-4 text-content-tertiary opacity-0 -translate-x-1 transition-all group-hover:opacity-100 group-hover:translate-x-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    )}
                    <div className={`w-8 h-8 rounded-lg ${s.iconBg} flex items-center justify-center mb-3`}>
                      <svg className={`w-4 h-4 ${s.iconText}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={card.iconPath} />
                      </svg>
                    </div>
                    <h3 className="text-sm font-medium text-content mb-1">{card.title}</h3>
                    <p className="text-xs text-content-secondary">{card.desc}</p>
                  </button>
                );
              })}
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
      case 'library':
        return <MissionLibraryView />;
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
      case 'calibration':
        return <CalibrationView />;
      case 'lua-graph':
        return <LuaGraphView />;
      case 'modules':
        return <ModuleManagerView />;
      case 'companion':
        return <CompanionDashboard />;
      case 'logs':
        return <LogsView />;
      case 'inspector':
        return <MavlinkInspectorView />;
      case 'telemetry':
      default:
        return <TelemetryDashboard />;
    }
  };

  return (
    <ModuleRuntime>
    <AppTourProvider>
    <AppShell>
      <GlobalTooltip />
      <FleetMinimap />
      <ActivityIndicator />
      <SitlAutoApplyWatcher />
      <ProfileApplyOverlay />
      <ParameterCompareModalRoot />
      <div className="flex h-full">
        {/* Navigation Rail */}
        <NavigationRail onViewChange={handleViewChange} />

        {/* Sidebar - collapsible */}
        <aside className={`border-r border-subtle bg-surface-nav shrink-0 transition-all duration-300 ${
          sidebarCollapsed ? 'w-16' : 'w-80'
        }`}>
          {sidebarCollapsed ? (
            <CollapsedSidebar onExpand={() => setSidebarCollapsed(false)} />
          ) : (
            <div className="relative h-full">
              <ConnectionPanel />
              <button
                onClick={() => setSidebarCollapsed(true)}
                className="absolute top-3 right-3 p-1.5 rounded-md hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
                title="Collapse sidebar"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
                </svg>
              </button>
            </div>
          )}
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-auto">
          {/* A crash in any single view must not unmount the whole tree (that
              blacks out the entire window - sidebar and all). Keyed on the view
              so navigating away from a crashed screen resets the boundary. */}
          <ErrorBoundary key={currentView} label={`${currentView} screen`}>
            {renderMainContent()}
          </ErrorBoundary>
        </main>
      </div>

      {/* Deep-link module install prompt (ardudeck://install) */}
      <DeepLinkInstallPrompt />

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

      {/* Experience level dialog */}
      {showExperienceDialog && (
        <ExperienceLevelDialog onSelect={handleExperienceLevelSelect} />
      )}

      {/* CLI exit confirmation dialog */}
      {showCliExitDialog && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-surface-raised rounded-xl border border-amber-500/50 w-full max-w-md mx-4 overflow-hidden shadow-2xl">
            {/* Header */}
            <div className="px-6 py-4 border-b border-subtle bg-amber-500/10">
              <div className="flex items-center gap-3">
                <svg className="w-6 h-6 text-amber-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <h2 className="text-lg font-semibold text-content">Leave CLI Terminal?</h2>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 py-5">
              <p className="text-content mb-3">
                Leaving the CLI tab will send an exit command which triggers a flight controller reboot (2-4 seconds).
              </p>
              <p className="text-content-secondary text-sm">
                The app will automatically reconnect after the board restarts.
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 border-t border-subtle flex gap-3">
              <button
                onClick={handleCliExitCancel}
                className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface text-content rounded-lg transition-colors"
              >
                Stay in CLI
              </button>
              <button
                onClick={handleCliExitConfirm}
                className="flex-1 px-4 py-2.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium transition-colors"
              >
                Leave and Reboot
              </button>
            </div>
          </div>
        </div>
      )}

    </AppShell>
    </AppTourProvider>
    <MountPoint name="floatingOverlay" />
    <ModuleDock />
    </ModuleRuntime>
  );
}

export default App;
