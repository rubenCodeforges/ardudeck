import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
  themeDark,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useLayoutStore } from '../../stores/layout-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useEditModeStore } from '../../stores/edit-mode-store';
import { useTelemetryLayoutStore } from '../../stores/telemetry-layout-store';
import { useResolvedTheme } from '../../hooks/useTheme';
import type { TelemetrySpeed } from '../../../shared/ipc-channels';
import { formatAltitudeFromMeters, formatSpeedFromMetersPerSecond } from '../../../shared/user-units.js';

// Reserved layout name for auto-save (separate from user-named layouts)
const TELEMETRY_AUTOSAVE_NAME = '__telemetry_autosave';
import {
  AttitudePanel,
  AltitudePanel,
  SpeedPanel,
  BatteryPanel,
  GpsPanel,
  PositionPanel,
  VelocityPanel,
  FlightModePanel,
  FlightControlPanel,
  MapPanel,
  MessagesPanel,
  PreflightCheckCard,
  // Mission panels (for monitoring during flight) - MissionMapPanel removed (merged into MapPanel)
  WaypointTablePanel,
  AltitudeProfilePanel,
  // SITL simulation panels
  SitlEnvironmentDockPanel,
  SitlFailureDockPanel,
  PANEL_COMPONENTS,
} from '../panels';
import { useArduPilotSitlStore } from '../../stores/ardupilot-sitl-store';
import type { IDockviewHeaderActionsProps } from 'dockview-react';

// Panel component wrapper for dockview. Plain — no decoration. The pop-out
// affordance lives in dockview's header action slot (see PanelPopoutAction
// below), where it's actually discoverable.
function PanelWrapper({ component }: { component: React.ComponentType }) {
  const Component = component;
  return <Component />;
}

/**
 * dockview panel id (camelCase, e.g. "flightControl") → detached
 * component-registry id (kebab, e.g. "flight-control").
 */
const PANEL_ID_TO_DETACHED: Record<string, { componentId: string; defaultBounds?: { width: number; height: number } }> = {
  attitude: { componentId: 'attitude' },
  altitude: { componentId: 'altitude' },
  speed: { componentId: 'speed' },
  battery: { componentId: 'battery' },
  gps: { componentId: 'gps' },
  position: { componentId: 'position' },
  velocity: { componentId: 'velocity' },
  flightMode: { componentId: 'flight-mode' },
  flightControl: { componentId: 'flight-control' },
  map: { componentId: 'map', defaultBounds: { width: 960, height: 720 } },
  messages: { componentId: 'messages' },
};

/**
 * Right-aligned action slot in every dockview tab header. Spawns a native
 * Electron BrowserWindow for the active panel via our window manager —
 * NOT dockview's `addPopoutGroup`. Dockview popout requires the parent and
 * child windows to share one renderer process so it can DOM-portal between
 * them; Electron's security model gives each child window its own renderer
 * and the popped window ends up unstyled. Native Electron windows with IPC-
 * driven state are the only reliable path here.
 */
function PanelHeaderActions(props: IDockviewHeaderActionsProps): JSX.Element | null {
  const active = props.activePanel;
  if (!active) return null;
  const mapping = PANEL_ID_TO_DETACHED[active.id];
  if (!mapping) return null;
  const title = active.title ?? active.id;

  const handleClick = () => {
    window.electronAPI.openDetachedWindow({
      componentId: mapping.componentId,
      title,
      ...(mapping.defaultBounds !== undefined ? { initialBounds: mapping.defaultBounds } : {}),
    });
  };

  return (
    <button
      onClick={handleClick}
      className="h-7 px-2 mx-0.5 rounded-md inline-flex items-center gap-1.5 text-xs transition-colors text-content-secondary hover:text-content hover:bg-surface-raised"
      title={`Open ${title} in new window`}
    >
      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
          d="M14 3h7m0 0v7m0-7L10 14M5 5h4M5 19h14a0 0 0 010 0v-4" />
      </svg>
      <span>Pop out</span>
    </button>
  );
}

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  // Telemetry panels
  AttitudePanel: () => <PanelWrapper component={AttitudePanel} />,
  AltitudePanel: () => <PanelWrapper component={AltitudePanel} />,
  SpeedPanel: () => <PanelWrapper component={SpeedPanel} />,
  BatteryPanel: () => <PanelWrapper component={BatteryPanel} />,
  GpsPanel: () => <PanelWrapper component={GpsPanel} />,
  PositionPanel: () => <PanelWrapper component={PositionPanel} />,
  VelocityPanel: () => <PanelWrapper component={VelocityPanel} />,
  FlightModePanel: () => <PanelWrapper component={FlightModePanel} />,
  FlightControlPanel: () => <PanelWrapper component={FlightControlPanel} />,
  MapPanel: () => <PanelWrapper component={MapPanel} />,
  MessagesPanel: () => <PanelWrapper component={MessagesPanel} />,
  PreflightCheckCard: () => <PanelWrapper component={PreflightCheckCard} />,
  // Mission panels (for monitoring during flight) - readOnly mode
  // Note: MissionMapPanel removed - mission data now integrated into MapPanel
  WaypointTablePanel: () => <WaypointTablePanel readOnly />,
  AltitudeProfilePanel: () => <AltitudeProfilePanel readOnly />,
  // SITL simulation panels
  SitlEnvironmentDockPanel: () => <PanelWrapper component={SitlEnvironmentDockPanel} />,
  SitlFailureDockPanel: () => <PanelWrapper component={SitlFailureDockPanel} />,
};

// Preset layout definitions (pilotView is the default)
const PRESET_LAYOUTS = {
  pilotView: 'Pilot View',
  missionTelemetry: 'Mission Telemetry',
  sitl: 'SITL',
  allPanels: 'All Panels',
} as const;

// The default preset to load when no saved layout exists
const DEFAULT_PRESET: PresetLayoutKey = 'pilotView';

type PresetLayoutKey = keyof typeof PRESET_LAYOUTS;

// Check if a layout name is a preset
function isPresetLayout(name: string): name is PresetLayoutKey {
  return name in PRESET_LAYOUTS;
}

// Pilot View preset - Map + FlightControl left, compact telemetry on right.
// Attitude panel intentionally omitted - the map already renders an attitude indicator overlay.
const PILOT_VIEW_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Map (primary, takes most of the horizontal space)
        {
          type: 'leaf',
          data: { views: ['map'], activeView: 'map', id: '1' },
          size: 620,
        },
        // Flight Control gets its own tall column next to the map
        {
          type: 'leaf',
          data: { views: ['flightControl'], activeView: 'flightControl', id: '8' },
          size: 280,
        },
        // Right telemetry stack
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '3' }, size: 180 },
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '4' }, size: 210 },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '7' }, size: 160 },
                { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '6' }, size: 160 },
              ],
              size: 220,
            },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '5' }, size: 180 },
          ],
          size: 320,
        },
      ],
      size: 900,
    },
    width: 1220,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
  },
  activeGroup: '1',
};

// Mission Telemetry preset - Map (with mission overlays) left, Waypoints/Battery top-right, AltProfile/Attitude bottom-right
const MISSION_TELEMETRY_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: { views: ['map'], activeView: 'map', id: '1' },
          size: 807,
        },
        {
          type: 'branch',
          data: [
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['waypoints'], activeView: 'waypoints', id: '3' }, size: 476 },
                { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '4' }, size: 331 },
              ],
              size: 321,
            },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['altitudeProfile'], activeView: 'altitudeProfile', id: '2' }, size: 476 },
                { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '5' }, size: 331 },
              ],
              size: 401,
            },
          ],
          size: 807,
        },
      ],
      size: 722,
    },
    width: 1614,
    height: 722,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' }, // Uses unified MapPanel with mission overlays
    altitudeProfile: { id: 'altitudeProfile', contentComponent: 'AltitudeProfilePanel', title: 'Altitude Profile' },
    waypoints: { id: 'waypoints', contentComponent: 'WaypointTablePanel', title: 'Waypoints' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
  },
  activeGroup: '5',
};

// All Panels preset - Map center, all telemetry panels around it
const ALL_PANELS_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Left column - flight data
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '10' }, size: 360 },
            { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '2' }, size: 200 },
            { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '3' }, size: 200 },
          ],
          size: 220,
        },
        // Center - Map + Messages
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '4' }, size: 650 },
            { type: 'leaf', data: { views: ['messages', 'preflightCheck'], activeView: 'messages', id: '11' }, size: 250 },
          ],
          size: 560,
        },
        // Right column - system status
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '5' }, size: 250 },
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '6' }, size: 150 },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '7' }, size: 150 },
            { type: 'leaf', data: { views: ['velocity'], activeView: 'velocity', id: '8' }, size: 150 },
            { type: 'leaf', data: { views: ['flightMode'], activeView: 'flightMode', id: '9' }, size: 150 },
          ],
          size: 220,
        },
      ],
      size: 900,
    },
    width: 1000,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
    velocity: { id: 'velocity', contentComponent: 'VelocityPanel', title: 'Velocity' },
    flightMode: { id: 'flightMode', contentComponent: 'FlightModePanel', title: 'Flight Mode' },
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    messages: { id: 'messages', contentComponent: 'MessagesPanel', title: 'Messages' },
    preflightCheck: { id: 'preflightCheck', contentComponent: 'PreflightCheckCard', title: 'Pre-flight Checks' },
  },
  activeGroup: '4',
};

// SITL preset - Map + Messages center, Flight Control + telemetry left, GPS + SITL panels right
const SITL_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        // Left column - core telemetry
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['flightControl'], activeView: 'flightControl', id: '1' }, size: 360 },
            { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '2' }, size: 260 },
            { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '3' }, size: 260 },
          ],
          size: 200,
        },
        // Center - Map + Messages
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['map'], activeView: 'map', id: '4' }, size: 650 },
            { type: 'leaf', data: { views: ['messages'], activeView: 'messages', id: '5' }, size: 250 },
          ],
          size: 600,
        },
        // Right column - GPS + SITL controls (tabbed)
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '6' }, size: 200 },
            { type: 'leaf', data: { views: ['sitlFailures', 'sitlEnvironment'], activeView: 'sitlFailures', id: '7' }, size: 700 },
          ],
          size: 280,
        },
      ],
      size: 900,
    },
    width: 1080,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    flightControl: { id: 'flightControl', contentComponent: 'FlightControlPanel', title: 'Flight Control' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    map: { id: 'map', contentComponent: 'MapPanel', title: 'Map' },
    messages: { id: 'messages', contentComponent: 'MessagesPanel', title: 'Messages' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    sitlFailures: { id: 'sitlFailures', contentComponent: 'SitlFailureDockPanel', title: 'SITL Failures' },
    sitlEnvironment: { id: 'sitlEnvironment', contentComponent: 'SitlEnvironmentDockPanel', title: 'SITL Environment' },
  },
  activeGroup: '4',
};

// Legacy default layout configuration - Map center, panels on sides (used as fallback)
function createDefaultLayout(api: DockviewApi): void {
  // Main center group - Map (primary view)
  const centerGroup = api.addGroup();
  api.addPanel({
    id: 'map',
    component: 'MapPanel',
    title: 'Map',
    position: { referenceGroup: centerGroup },
  });

  // Left group - Flight control + altitude/speed
  const leftGroup = api.addGroup({ direction: 'left', initialWidth: 260 });
  api.addPanel({
    id: 'flightControl',
    component: 'FlightControlPanel',
    title: 'Flight Control',
    position: { referenceGroup: leftGroup },
  });
  api.addPanel({
    id: 'altitude',
    component: 'AltitudePanel',
    title: 'Altitude',
    position: { referenceGroup: leftGroup, index: 1 },
  });
  api.addPanel({
    id: 'speed',
    component: 'SpeedPanel',
    title: 'Speed',
    position: { referenceGroup: leftGroup, index: 2 },
  });

  // Right group - System status
  const rightGroup = api.addGroup({ direction: 'right', initialWidth: 180 });
  api.addPanel({
    id: 'battery',
    component: 'BatteryPanel',
    title: 'Battery',
    position: { referenceGroup: rightGroup },
  });
  api.addPanel({
    id: 'gps',
    component: 'GpsPanel',
    title: 'GPS',
    position: { referenceGroup: rightGroup, index: 1 },
  });
  api.addPanel({
    id: 'position',
    component: 'PositionPanel',
    title: 'Position',
    position: { referenceGroup: rightGroup, index: 2 },
  });
}

// Load a preset layout by name
function loadPresetLayout(api: DockviewApi, preset: PresetLayoutKey): void {
  switch (preset) {
    case 'pilotView':
      api.fromJSON(PILOT_VIEW_LAYOUT);
      break;
    case 'missionTelemetry':
      api.fromJSON(MISSION_TELEMETRY_LAYOUT);
      break;
    case 'sitl':
      api.fromJSON(SITL_LAYOUT);
      break;
    case 'allPanels':
      api.fromJSON(ALL_PANELS_LAYOUT);
      break;
    default:
      // Default to Pilot View
      api.fromJSON(PILOT_VIEW_LAYOUT);
      break;
  }
}

// Layout toolbar component
function LayoutToolbar({
  onSave,
  onLoad,
  onReset,
  onAddPanel,
  layouts,
  activeLayout,
  supportsMissionPlanning,
  isMavlink,
  isSitlRunning,
}: {
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  onAddPanel: (id: string, component: string, title: string) => void;
  layouts: string[];
  activeLayout: string;
  supportsMissionPlanning: boolean;
  isMavlink: boolean;
  isSitlRunning: boolean;
}) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const mapMode = useEditModeStore((s) => s.mapMode);
  const setMapMode = useEditModeStore((s) => s.setMapMode);
  const [layoutName, setLayoutName] = useState('');

  // Filter presets based on capabilities
  const availablePresets = Object.entries(PRESET_LAYOUTS).filter(([key]) => {
    if (key === 'missionTelemetry' && !supportsMissionPlanning) {
      return false;
    }
    if (key === 'sitl' && !isSitlRunning) {
      return false;
    }
    return true;
  });

  const handleSave = () => {
    if (layoutName.trim()) {
      onSave(layoutName.trim());
      setShowSaveDialog(false);
      setLayoutName('');
    }
  };

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-subtle">
      <span className="text-xs text-content-secondary">Layout:</span>

      <select
        data-tour="telemetry-layout-select"
        value={activeLayout}
        onChange={(e) => onLoad(e.target.value)}
        className="bg-surface-raised border border-default rounded px-2 py-1 text-xs text-content focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      >
        <optgroup label="Presets">
          {availablePresets.map(([key, name]) => (
            <option key={key} value={key}>{name}</option>
          ))}
        </optgroup>
        {layouts.length > 0 && (
          <optgroup label="Saved">
            {layouts.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </optgroup>
        )}
      </select>

      {showSaveDialog ? (
        <div className="flex items-center gap-1">
          <input
            type="text"
            value={layoutName}
            onChange={(e) => setLayoutName(e.target.value)}
            placeholder="Layout name"
            className="bg-surface-input border border-default rounded px-2 py-1 text-xs text-content w-32 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
          />
          <button
            onClick={handleSave}
            className="px-2 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs rounded transition-colors"
          >
            Save
          </button>
          <button
            onClick={() => setShowSaveDialog(false)}
            className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors"
          >
            Save As...
          </button>
          <button
            onClick={onReset}
            className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors"
          >
            Reset
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* 2D/3D Map Toggle - dev-only until 3D is reworked */}
      {import.meta.env.DEV && (
        <div className="flex items-center rounded-lg overflow-hidden border border-subtle shrink-0">
          <button
            onClick={() => setMapMode('2d')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              mapMode === '2d'
                ? 'bg-surface-raised text-content'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            title="2D Map"
          >
            2D
          </button>
          <div className="w-px h-4 bg-subtle" />
          <button
            onClick={() => setMapMode('3d')}
            className={`px-2.5 py-1 text-xs font-medium transition-colors ${
              mapMode === '3d'
                ? 'bg-indigo-600 text-white'
                : 'text-content-secondary hover:bg-surface-raised'
            }`}
            title="3D Terrain View"
          >
            3D
          </button>
        </div>
      )}

      {/* Add panel dropdown */}
      <AddPanelDropdown onAddPanel={onAddPanel} supportsMissionPlanning={supportsMissionPlanning} isMavlink={isMavlink} isSitlRunning={isSitlRunning} />
    </div>
  );
}

// Mission-related panel IDs that require mission planning support
// Note: missionMap removed - now integrated into unified MapPanel
const MISSION_PANEL_IDS = ['waypoints', 'altitudeProfile'];

// MAVLink-only panel IDs (STATUSTEXT doesn't exist in MSP)
const MAVLINK_PANEL_IDS = ['messages', 'preflightCheck'];

// SITL-only panel IDs (only shown when ArduPilot SITL is running)
const SITL_PANEL_IDS = ['sitlEnvironment', 'sitlFailures'];

// Add panel dropdown
function AddPanelDropdown({ onAddPanel, supportsMissionPlanning, isMavlink, isSitlRunning }: { onAddPanel: (id: string, component: string, title: string) => void; supportsMissionPlanning: boolean; isMavlink: boolean; isSitlRunning: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out panels based on protocol support and SITL state
  const availablePanels = Object.entries(PANEL_COMPONENTS).filter(([id]) => {
    if (MISSION_PANEL_IDS.includes(id) && !supportsMissionPlanning) {
      return false;
    }
    if (MAVLINK_PANEL_IDS.includes(id) && !isMavlink) {
      return false;
    }
    if (SITL_PANEL_IDS.includes(id) && !isSitlRunning) {
      return false;
    }
    return true;
  });

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Panel
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface-solid border border-subtle rounded-lg shadow-xl z-20 py-1 min-w-[150px]">
            {availablePanels.map(([id, { component, title }]) => (
              <button
                key={id}
                onClick={() => {
                  onAddPanel(id, component, title);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-content hover:bg-surface-raised transition-colors"
              >
                {title}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// Sensor health warning badge - shows unhealthy sensor names
function SensorHealthWarning({ sensors }: { sensors: string[] }) {
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/10 border border-red-500/30 rounded"
      title={`Unhealthy: ${sensors.join(', ')} - check Messages panel for details`}
    >
      <svg className="w-3.5 h-3.5 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
      </svg>
      <span className="font-mono text-xs text-red-400">{sensors.join(' ')}</span>
    </div>
  );
}

// Telemetry speed selector labels
const SPEED_OPTIONS: { value: TelemetrySpeed; label: string }[] = [
  { value: 'eco', label: 'Eco' },
  { value: 'normal', label: 'Normal' },
  { value: 'max', label: 'Max' },
];

// Quick stats bar
function QuickStatsBar() {
  const flight = useTelemetryStore((s) => s.flight);
  const vfrHud = useTelemetryStore((s) => s.vfrHud);
  const battery = useTelemetryStore((s) => s.battery);
  const gps = useTelemetryStore((s) => s.gps);
  const sensorHealth = useTelemetryStore((s) => s.sensorHealth);
  const connectionState = useConnectionStore((s) => s.connectionState);
  const telemetrySpeed = useSettingsStore((s) => s.telemetrySpeed);
  const setTelemetrySpeed = useSettingsStore((s) => s.setTelemetrySpeed);
  const altitudeUnit = useSettingsStore((s) => s.unitPreferences.altitude);
  const speedUnit = useSettingsStore((s) => s.unitPreferences.speed);
  const batteryColor = battery.remaining < 0 ? 'text-content-secondary' : battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-yellow-400' : 'text-red-400';
  const isMavlink = connectionState.protocol === 'mavlink';

  // GPS satellite color
  const satColor = gps.fixType >= 3 ? 'text-emerald-400' : gps.fixType >= 2 ? 'text-yellow-400' : 'text-red-400';

  // Unhealthy sensors from SYS_STATUS
  const unhealthySensors: string[] = [];
  if (sensorHealth) {
    const { present, health } = sensorHealth;
    const check = (bit: number, name: string) => {
      if ((present & bit) && !(health & bit)) unhealthySensors.push(name);
    };
    check(0x20, 'GPS');
    check(0x04, 'MAG');
    check(0x08, 'BARO');
    check(0x02, 'ACC');
    check(0x01, 'GYR');
  }

  const handleSpeedChange = (speed: TelemetrySpeed) => {
    setTelemetrySpeed(speed);
    window.electronAPI?.setTelemetryStreamRate(speed);
  };

  return (
    <div className={`shrink-0 px-4 py-2 flex items-center justify-between border-b ${
      flight.armed
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-surface border-subtle'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
          flight.armed ? 'bg-red-500 text-white' : 'bg-surface-raised text-content-secondary'
        }`}>
          {flight.armed ? 'Armed' : 'Disarmed'}
        </span>
        <span className="text-lg font-medium text-content">{flight.mode}</span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">HDG</span>
          <span className="font-mono text-sm text-content">{vfrHud.heading.toFixed(0)}°</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">ALT</span>
          <span className="font-mono text-sm text-content">{formatAltitudeFromMeters(vfrHud.alt, altitudeUnit)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">SPD</span>
          <span className="font-mono text-sm text-content">{formatSpeedFromMetersPerSecond(vfrHud.groundspeed, speedUnit)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">THR</span>
          <span className="font-mono text-sm text-content">{vfrHud.throttle}%</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">BAT</span>
          <span className={`font-mono text-sm ${batteryColor}`}>{battery.voltage.toFixed(1)}V</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-content-secondary">SAT</span>
          <span className={`font-mono text-sm ${satColor}`}>{gps.satellites}</span>
        </div>
        {unhealthySensors.length > 0 && (
          <SensorHealthWarning sensors={unhealthySensors} />
        )}
        {isMavlink && (
          <div className="flex items-center gap-1.5 ml-2">
            <span className="text-content-secondary">RATE</span>
            <div className="flex bg-surface-raised rounded-lg p-0.5">
              {SPEED_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => handleSpeedChange(opt.value)}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${
                    telemetrySpeed === opt.value
                      ? 'bg-blue-500/20 text-blue-400'
                      : 'text-content-secondary hover:text-content'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function TelemetryDashboard() {
  const resolvedTheme = useResolvedTheme();
  const apiRef = useRef<DockviewApi | null>(null);
  const { layouts, activeLayoutName, loadLayouts, saveLayout, setActiveLayout } = useLayoutStore();
  const connectionState = useConnectionStore((s) => s.connectionState);
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Check if mission planning is supported
  // Betaflight (BTFL) and Cleanflight (CLFL) do NOT support missions
  // iNav (INAV) and MAVLink (ArduPilot) DO support missions
  const isMspBetaflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'BTFL';
  const isMspCleanflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'CLFL';
  const supportsMissionPlanning = !isMspBetaflight && !isMspCleanflight;

  // Check if ArduPilot SITL is running (for SITL-only panels)
  const isSitlRunning = useArduPilotSitlStore((s) => s.isRunning);

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Auto-save layout when it changes
  useEffect(() => {
    if (!apiRef.current || !layoutLoaded) return;

    const handleLayoutChange = () => {
      if (apiRef.current) {
        const data = apiRef.current.toJSON();
        window.electronAPI?.saveLayout(TELEMETRY_AUTOSAVE_NAME, data);
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

    // First, try to load auto-saved layout (most recent state)
    try {
      const autoSaved = await window.electronAPI?.getLayout(TELEMETRY_AUTOSAVE_NAME);
      if (autoSaved?.data) {
        event.api.fromJSON(autoSaved.data as SerializedDockview);
        setLayoutLoaded(true);
        return;
      }
    } catch (e) {
      console.warn('Failed to load auto-saved layout:', e);
    }

    // Fall back to named layout from store
    const savedLayout = layouts[activeLayoutName];
    if (savedLayout?.data) {
      try {
        event.api.fromJSON(savedLayout.data as SerializedDockview);
        setLayoutLoaded(true);
        return;
      } catch (e) {
        console.warn('Failed to load saved layout, using default:', e);
      }
    }

    // Create default layout (Pilot View)
    loadPresetLayout(event.api, DEFAULT_PRESET);
    setLayoutLoaded(true);
  }, [layouts, activeLayoutName]);

  const handleSaveLayout = useCallback(async (name: string) => {
    if (!apiRef.current) return;
    const data = apiRef.current.toJSON();
    await saveLayout(name, data);
    await setActiveLayout(name);
  }, [saveLayout, setActiveLayout]);

  const handleLoadLayout = useCallback(async (name: string) => {
    if (!apiRef.current) return;
    await setActiveLayout(name);

    // Check if it's a preset layout
    if (isPresetLayout(name)) {
      apiRef.current.clear();
      loadPresetLayout(apiRef.current, name);
      return;
    }

    // Otherwise load from saved layouts
    const layout = layouts[name];
    if (layout?.data) {
      try {
        apiRef.current.fromJSON(layout.data as SerializedDockview);
      } catch (e) {
        console.warn('Failed to load layout:', e);
        apiRef.current.clear();
        loadPresetLayout(apiRef.current, DEFAULT_PRESET);
      }
    } else {
      apiRef.current.clear();
      loadPresetLayout(apiRef.current, DEFAULT_PRESET);
    }
  }, [layouts, setActiveLayout]);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    loadPresetLayout(apiRef.current, DEFAULT_PRESET);
  }, []);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;

    // Generate unique panel id (in case the panel is already open)
    const uniqueId = `${id}-${Date.now()}`;

    // Add panel to the currently active group or create new one
    apiRef.current.addPanel({
      id: uniqueId,
      component,
      title,
    });
  }, []);

  // Expose a tour-facing bridge so the tour manager can check/provision panels.
  useEffect(() => {
    const setBridge = useTelemetryLayoutStore.getState().setBridge;
    setBridge({
      hasPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return false;
        // Preset layouts use panelId as the panel id directly.
        // User-added panels use `${panelId}-${timestamp}`.
        return api.panels.some(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
      },
      addPanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const entry = PANEL_COMPONENTS[panelId as keyof typeof PANEL_COMPONENTS];
        if (!entry) return;
        const uniqueId = `${panelId}-${Date.now()}`;
        const panel = api.addPanel({
          id: uniqueId,
          component: entry.component,
          title: entry.title,
        });
        // Make sure the new panel's tab is the active one in its group,
        // otherwise it renders hidden and selectors won't find it.
        panel?.api.setActive();
      },
      activatePanel: (panelId) => {
        const api = apiRef.current;
        if (!api) return;
        const existing = api.panels.find(
          (p) => p.id === panelId || p.id.startsWith(`${panelId}-`),
        );
        existing?.api.setActive();
      },
      loadPreset: (presetKey) => {
        if (!apiRef.current || !isPresetLayout(presetKey)) return;
        apiRef.current.clear();
        loadPresetLayout(apiRef.current, presetKey);
      },
    });
    return () => {
      useTelemetryLayoutStore.getState().setBridge(null);
    };
  }, [handleAddPanel]);

  return (
    <div className="h-full flex flex-col">
      {/* Quick stats bar */}
      <QuickStatsBar />

      {/* Layout toolbar */}
      <LayoutToolbar
        onSave={handleSaveLayout}
        onLoad={handleLoadLayout}
        onReset={handleResetLayout}
        onAddPanel={handleAddPanel}
        layouts={Object.keys(layouts).filter(name => !name.startsWith('__'))}
        activeLayout={activeLayoutName}
        supportsMissionPlanning={supportsMissionPlanning}
        isMavlink={connectionState.protocol === 'mavlink'}
        isSitlRunning={isSitlRunning}
      />

      {/* Dockview container */}
      <div className="flex-1">
        <DockviewReact
          components={components}
          onReady={onReady}
          theme={resolvedTheme === 'light' ? themeLight : themeDark}
          rightHeaderActionsComponent={PanelHeaderActions}
          className="h-full"
        />
      </div>
    </div>
  );
}
