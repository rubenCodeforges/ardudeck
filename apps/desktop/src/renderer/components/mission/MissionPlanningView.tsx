import { useRef, useCallback, useEffect, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useResolvedTheme } from '../../hooks/useTheme';

import { MissionToolbar } from './MissionToolbar';
import { MissionStatusBar } from './MissionStatusBar';
import { MissionMapPanel } from './MissionMapPanel';
import { WaypointTablePanel } from './WaypointTablePanel';
import { AltitudeProfilePanel } from './AltitudeProfilePanel';
import { SurveyConfigPanel } from '../survey/SurveyConfigPanel';
import { useMissionStore } from '../../stores/mission-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useFirmwareStore } from '../../stores/firmware-store';
import { useSurveyStore } from '../../stores/survey-store';
import { isUnsupportedF3Board, hasInavF3Support } from '../../../shared/board-mappings';
import { Map, AlertTriangle, Lightbulb, RefreshCw, Plane, Wrench } from 'lucide-react';

// Reserved layout name for mission view (auto-save/restore)
const MISSION_LAYOUT_NAME = '__mission_autosave';

// Toast type
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  MissionMapPanel: () => <MissionMapPanel />,
  WaypointTablePanel: () => <WaypointTablePanel />,
  AltitudeProfilePanel: () => <AltitudeProfilePanel />,
  SurveyConfigPanel: () => <SurveyConfigPanel />,
};

// Stable panel id for the Survey tab — opened/closed dynamically based on
// whether survey mode is active. Lives as a sibling tab next to Waypoints.
const SURVEY_PANEL_ID = 'surveyConfig';

// Default layout configuration - Map top-left, Waypoints top-right, Altitude Profile bottom
function createDefaultLayout(api: DockviewApi): void {
  // Main group - Mission Map
  const mainGroup = api.addGroup();
  api.addPanel({
    id: 'missionMap',
    component: 'MissionMapPanel',
    title: 'Mission Map',
    position: { referenceGroup: mainGroup },
  });

  // Right group - Waypoint Table
  const rightGroup = api.addGroup({ direction: 'right', initialWidth: 400 });
  api.addPanel({
    id: 'waypointTable',
    component: 'WaypointTablePanel',
    title: 'Waypoints',
    position: { referenceGroup: rightGroup },
  });

  // Bottom group - Altitude Profile (below the map)
  const bottomGroup = api.addGroup({
    direction: 'below',
    initialHeight: 180,
    referenceGroup: mainGroup,
  });
  api.addPanel({
    id: 'altitudeProfile',
    component: 'AltitudeProfilePanel',
    title: 'Altitude Profile',
    position: { referenceGroup: bottomGroup },
  });
}

// Component for when mission planning is not available
function MissionNotAvailable({ fcVariant, boardId }: { fcVariant: string; boardId: string }) {
  const { setView } = useNavigationStore();
  const { setSelectedSource, setPendingBoardMatch } = useFirmwareStore();

  // Check if this is an F3 board (not supported by modern iNav either)
  const isF3Board = isUnsupportedF3Board(boardId);

  const handleFlashInav = async () => {
    // Save the Betaflight board ID to match against iNav boards
    const betaflightBoardId = boardId;

    // Disconnect from current board first (they'll need to reconnect in bootloader mode)
    try {
      await window.electronAPI.disconnect();
    } catch {
      // Ignore disconnect errors
    }

    // Wait for connection state to fully update
    await new Promise(resolve => setTimeout(resolve, 200));

    // Set pending board match BEFORE setting source (so fetchBoards can use it)
    if (betaflightBoardId && betaflightBoardId !== 'Unknown Board') {
      setPendingBoardMatch(betaflightBoardId);
    }

    // Pre-select iNav firmware source BEFORE navigating
    // This sets sourceExplicitlySet=true and prevents auto-detect from overriding
    // It also triggers fetchBoards which will auto-match the board
    setSelectedSource('inav');

    // Now navigate - the firmware view will see 'inav' already selected
    setView('firmware');
  };

  // F3 boards with iNav support can flash legacy iNav 2.6.1
  const canUseInavF3 = isF3Board && hasInavF3Support(boardId);

  if (isF3Board && canUseInavF3) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base p-8">
        <div className="max-w-2xl text-center">
          {/* Icon */}
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500/20 to-yellow-600/20 border border-orange-500/30 flex items-center justify-center">
            <Map className="w-12 h-12 text-orange-400" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-content mb-3">
            Legacy iNav Available
          </h1>

          {/* Explanation */}
          <p className="text-content-secondary mb-6 leading-relaxed">
            Your <span className="text-orange-400 font-medium">{boardId}</span> is an F3 board with 256KB flash.
            You can flash <span className="text-blue-400 font-medium">iNav 2.6.1</span> for basic mission planning and GPS navigation.
          </p>

          {/* Note about limitations */}
          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6 text-left">
            <p className="text-yellow-400/90 text-sm">
              <strong>Note:</strong> iNav 2.6.1 supports waypoint missions but lacks newer features like safehome and advanced failsafes available in modern iNav 7.x on F4+ boards.
            </p>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setView('telemetry')}
              className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content-secondary rounded-lg text-sm transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleFlashInav}
              className="px-6 py-2.5 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white rounded-lg font-medium transition-all shadow-lg shadow-blue-500/25"
            >
              Flash iNav 2.6.1
            </button>
          </div>
        </div>
      </div>
    );
  }

  // F3 boards WITHOUT iNav support - need hardware upgrade
  if (isF3Board && !canUseInavF3) {
    return (
      <div className="h-full flex items-center justify-center bg-surface-base p-8">
        <div className="max-w-2xl text-center">
          {/* Icon */}
          <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-600/20 border border-red-500/30 flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-red-400" />
          </div>

          {/* Title */}
          <h1 className="text-2xl font-bold text-content mb-3">
            Hardware Upgrade Needed
          </h1>

          {/* Explanation */}
          <p className="text-content-secondary mb-6 leading-relaxed">
            Your <span className="text-red-400 font-medium">{boardId}</span> is an F3 board that was never supported by iNav.
            For mission planning, you need an F4 or newer board.
          </p>

          {/* Upgrade suggestions */}
          <div className="bg-surface rounded-xl border border-subtle p-4 text-left mb-6">
            <p className="text-sm text-content-secondary mb-3">Recommended upgrades:</p>
            <div className="flex flex-wrap gap-2">
              {['SpeedyBee F405 V3', 'Matek F405-SE', 'Kakute F7'].map((board) => (
                <span key={board} className="px-2 py-1 bg-surface-raised rounded text-content text-xs">
                  {board}
                </span>
              ))}
            </div>
          </div>

          {/* Actions */}
          <button
            onClick={() => setView('telemetry')}
            className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content-secondary rounded-lg text-sm transition-colors"
          >
            ← Back to Telemetry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex items-center justify-center bg-surface-base p-8">
      <div className="max-w-2xl text-center">
        {/* Icon */}
        <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-gradient-to-br from-orange-500/20 to-red-600/20 border border-orange-500/30 flex items-center justify-center">
          <Map className="w-12 h-12 text-orange-400" />
        </div>

        {/* Title */}
        <h1 className="text-2xl font-bold text-content mb-3">
          Mission Planning Not Available
        </h1>

        {/* Explanation */}
        <p className="text-content-secondary mb-6 leading-relaxed">
          Your <span className="text-orange-400 font-medium">{fcVariant === 'BTFL' ? 'Betaflight' : fcVariant}</span> flight controller
          on <span className="text-blue-400">{boardId}</span> doesn't support autonomous waypoint missions.
          {fcVariant === 'BTFL' && (
            <> Betaflight is designed for FPV racing and freestyle flying with manual control.</>
          )}
        </p>

        {/* What you can do */}
        <div className="bg-surface rounded-xl border border-subtle p-6 text-left mb-6">
          <h3 className="text-sm font-medium text-content mb-4 flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-amber-400 inline" /> Want autonomous missions? Here are your options:
          </h3>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/20 flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <h4 className="font-medium text-blue-400">Flash iNav Firmware</h4>
                <p className="text-sm text-content-secondary">
                  iNav is a fork of Betaflight with full GPS navigation and mission planning support.
                  Same board, different firmware. Go to <span className="text-content-secondary">Firmware Flash</span> and select iNav.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/20 flex items-center justify-center shrink-0">
                <Plane className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <h4 className="font-medium text-green-400">Use ArduPilot Hardware</h4>
                <p className="text-sm text-content-secondary">
                  For the most advanced mission planning, consider a Pixhawk or compatible board running ArduPilot.
                  Supports copters, planes, VTOLs, rovers, boats, and submarines.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Supported boards */}
        <div className="text-sm text-content-secondary">
          <p className="mb-2">Boards that support mission planning:</p>
          <div className="flex flex-wrap justify-center gap-2">
            {['Pixhawk', 'Cube', 'Matek F405-WSE', 'Kakute F7', 'Any iNav board'].map((board) => (
              <span key={board} className="px-2 py-1 bg-surface-raised rounded text-content-secondary text-xs">
                {board}
              </span>
            ))}
          </div>
        </div>

        {/* Quick actions */}
        <div className="flex items-center justify-center gap-3 mt-8">
          <button
            onClick={handleFlashInav}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm font-medium transition-colors"
          >
            Flash iNav Firmware
          </button>
          <button
            onClick={() => setView('telemetry')}
            className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content-secondary rounded-lg text-sm transition-colors"
          >
            ← Back to Telemetry
          </button>
        </div>
      </div>
    </div>
  );
}

export function MissionPlanningView() {
  const apiRef = useRef<DockviewApi | null>(null);
  const resolvedTheme = useResolvedTheme();
  const { connectionState } = useConnectionStore();
  const { lastSuccessMessage, error, clearLastSuccessMessage, missionItems, fetchMission, isLoading } = useMissionStore();
  const surveyIsActive = useSurveyStore((s) => s.isActive);
  const deactivateSurvey = useSurveyStore((s) => s.deactivateSurvey);
  const [toast, setToast] = useState<Toast | null>(null);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Check if mission planning is supported
  // Betaflight (BTFL) does NOT support missions
  // iNav (INAV) DOES support missions
  // MAVLink (ArduPilot) DOES support missions
  const isMspBetaflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'BTFL';
  const isMspCleanflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'CLFL';
  const missionPlanningUnavailable = isMspBetaflight || isMspCleanflight;

  // ALL HOOKS MUST BE CALLED BEFORE ANY EARLY RETURNS
  // React requires hooks to be called in the same order every render

  // Watch for success messages from store
  useEffect(() => {
    if (lastSuccessMessage) {
      setToast({ message: lastSuccessMessage, type: 'success' });
      clearLastSuccessMessage();
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastSuccessMessage, clearLastSuccessMessage]);

  // Watch for errors from store
  useEffect(() => {
    if (error) {
      setToast({ message: error, type: 'error' });
      const timer = setTimeout(() => setToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [error]);

  // Add/remove the Survey panel as a tab next to Waypoints whenever survey
  // mode toggles. We attach it to the same group as the waypoint table so it
  // becomes a sibling tab (user can switch between Waypoints / Survey) rather
  // than carving out additional screen real estate. When survey mode ends we
  // remove the panel and let dockview restore focus to Waypoints.
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;
    const api = apiRef.current;
    const existing = api.getPanel(SURVEY_PANEL_ID);

    if (surveyIsActive && !existing) {
      const waypointPanel = api.getPanel('waypointTable');
      const refGroup = waypointPanel?.group;
      api.addPanel({
        id: SURVEY_PANEL_ID,
        component: 'SurveyConfigPanel',
        title: 'Survey',
        ...(refGroup ? { position: { referenceGroup: refGroup } } : {}),
      });
      // Focus the new tab so the user lands on it after starting survey mode.
      api.getPanel(SURVEY_PANEL_ID)?.api.setActive();
    } else if (!surveyIsActive && existing) {
      api.removePanel(existing);
    }
  }, [surveyIsActive, layoutLoaded]);

  // Closing the Survey tab manually should also exit survey mode — otherwise
  // the add/remove effect above would just re-create it on the next render.
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;
    const api = apiRef.current;
    const disposable = api.onDidRemovePanel((panel) => {
      if (panel.id === SURVEY_PANEL_ID && useSurveyStore.getState().isActive) {
        deactivateSurvey();
      }
    });
    return () => disposable.dispose();
  }, [layoutLoaded, deactivateSurvey]);

  // Auto-save layout when it changes
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;

    const handleLayoutChange = () => {
      if (apiRef.current) {
        const data = apiRef.current.toJSON();
        window.electronAPI?.saveLayout(MISSION_LAYOUT_NAME, data);
      }
    };

    // Subscribe to layout changes
    const disposable = apiRef.current.onDidLayoutChange(handleLayoutChange);

    return () => {
      disposable.dispose();
    };
  }, [layoutLoaded]);

  // Auto-fetch mission from board when connected (if store is empty)
  // Track previous connection state to detect new connections
  const prevConnectedRef = useRef(false);
  useEffect(() => {
    const isConnected = connectionState.isConnected;
    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = isConnected;

    // Only fetch on new connection (transition from disconnected to connected)
    // Don't fetch if we already have mission items (user might be working on something)
    // Don't fetch if Betaflight/Cleanflight (no mission support)
    const shouldFetch = isConnected && !wasConnected &&
                        missionItems.length === 0 &&
                        !isLoading &&
                        !missionPlanningUnavailable;

    if (shouldFetch) {
      // Small delay to let connection stabilize
      const timer = setTimeout(() => {
        fetchMission();
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [connectionState.isConnected, missionItems.length, isLoading, missionPlanningUnavailable, fetchMission]);

  const onReady = useCallback(async (event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // Try to load saved mission layout
    try {
      const savedLayout = await window.electronAPI?.getLayout(MISSION_LAYOUT_NAME);
      if (savedLayout?.data) {
        event.api.fromJSON(savedLayout.data as SerializedDockview);
        setLayoutLoaded(true);
        return;
      }
    } catch (e) {
      console.warn('Failed to load saved mission layout:', e);
    }

    // Create default layout if no saved layout
    createDefaultLayout(event.api);
    setLayoutLoaded(true);
  }, []);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    createDefaultLayout(apiRef.current);
    // Save the reset layout
    const data = apiRef.current.toJSON();
    window.electronAPI?.saveLayout(MISSION_LAYOUT_NAME, data);
  }, []);

  // Show toast for file operations
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  // EARLY RETURNS - After all hooks have been called

  // If connected to Betaflight, show "Not Available" message
  if (connectionState.isConnected && missionPlanningUnavailable) {
    return (
      <MissionNotAvailable
        fcVariant={connectionState.fcVariant || 'Unknown'}
        boardId={connectionState.boardId || 'Unknown Board'}
      />
    );
  }

  return (
    <div className="h-full flex flex-col relative">
      {/* Mission Toolbar */}
      <MissionToolbar onResetLayout={handleResetLayout} showToast={showToast} />

      {/* Dockview container */}
      <div className="flex-1">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={resolvedTheme === 'light' ? themeLight : themeDark}
          className="h-full"
        />
      </div>

      {/* Status bar */}
      <MissionStatusBar />

      {/* Toast notification - positioned at top center */}
      {toast && (
        <div className="absolute top-12 left-1/2 -translate-x-1/2 z-[1000] pointer-events-none">
          <div className={`px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 pointer-events-auto ${
            toast.type === 'success' ? 'bg-emerald-900/90 border border-emerald-500/50 text-emerald-300' :
            toast.type === 'error' ? 'bg-red-900/90 border border-red-500/50 text-red-300' :
            'bg-blue-900/90 border border-blue-500/50 text-blue-300'
          }`}>
            {toast.type === 'success' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            )}
            {toast.type === 'error' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            )}
            {toast.type === 'info' && (
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
            <span className="text-sm font-medium">{toast.message}</span>
          </div>
        </div>
      )}
    </div>
  );
}
