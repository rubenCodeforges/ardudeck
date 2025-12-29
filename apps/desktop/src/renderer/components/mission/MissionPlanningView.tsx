import { useRef, useCallback, useEffect, useState } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { MissionToolbar } from './MissionToolbar';
import { MissionStatusBar } from './MissionStatusBar';
import { MissionMapPanel } from './MissionMapPanel';
import { WaypointTablePanel } from './WaypointTablePanel';
import { AltitudeProfilePanel } from './AltitudeProfilePanel';
import { useMissionStore } from '../../stores/mission-store';

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
};

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
  const rightGroup = api.addGroup({ direction: 'right', size: 400 });
  api.addPanel({
    id: 'waypointTable',
    component: 'WaypointTablePanel',
    title: 'Waypoints',
    position: { referenceGroup: rightGroup },
  });

  // Bottom group - Altitude Profile (below the map)
  const bottomGroup = api.addGroup({
    direction: 'below',
    size: 180,
    referenceGroup: mainGroup,
  });
  api.addPanel({
    id: 'altitudeProfile',
    component: 'AltitudeProfilePanel',
    title: 'Altitude Profile',
    position: { referenceGroup: bottomGroup },
  });
}

export function MissionPlanningView() {
  const apiRef = useRef<DockviewApi | null>(null);
  const { lastSuccessMessage, error, clearLastSuccessMessage } = useMissionStore();
  const [toast, setToast] = useState<Toast | null>(null);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

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

  return (
    <div className="h-full flex flex-col relative">
      {/* Mission Toolbar */}
      <MissionToolbar onResetLayout={handleResetLayout} showToast={showToast} />

      {/* Dockview container */}
      <div className="flex-1 dockview-theme-dark">
        <DockviewReact
          components={components}
          onReady={onReady}
          className="h-full"
        />
      </div>

      {/* Status bar */}
      <MissionStatusBar />

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-16 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
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
          {toast.type === 'info' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
}
