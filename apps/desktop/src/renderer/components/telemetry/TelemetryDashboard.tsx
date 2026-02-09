import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useLayoutStore } from '../../stores/layout-store';
import { useConnectionStore } from '../../stores/connection-store';

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
  // Mission panels (for monitoring during flight) - MissionMapPanel removed (merged into MapPanel)
  WaypointTablePanel,
  AltitudeProfilePanel,
  PANEL_COMPONENTS,
} from '../panels';

// Panel component wrapper for dockview
function PanelWrapper({ component }: { component: React.ComponentType }) {
  const Component = component;
  return <Component />;
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
  MapPanel: () => <PanelWrapper component={MapPanel} />, // Now includes mission overlays
  // Mission panels (for monitoring during flight) - readOnly mode
  // Note: MissionMapPanel removed - mission data now integrated into MapPanel
  WaypointTablePanel: () => <WaypointTablePanel readOnly />,
  AltitudeProfilePanel: () => <AltitudeProfilePanel readOnly />,
};

// Preset layout definitions (pilotView is the default)
const PRESET_LAYOUTS = {
  pilotView: 'Pilot View',
  missionTelemetry: 'Mission Telemetry',
  allPanels: 'All Panels',
} as const;

// The default preset to load when no saved layout exists
const DEFAULT_PRESET: PresetLayoutKey = 'pilotView';

type PresetLayoutKey = keyof typeof PRESET_LAYOUTS;

// Check if a layout name is a preset
function isPresetLayout(name: string): name is PresetLayoutKey {
  return name in PRESET_LAYOUTS;
}

// Pilot View preset - Map on left, all telemetry panels in 3x2 grid on right
const PILOT_VIEW_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: { views: ['map'], activeView: 'map', id: '1' },
          size: 600,
        },
        {
          type: 'branch',
          data: [
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '3' }, size: 200 },
                { type: 'leaf', data: { views: ['attitude'], activeView: 'attitude', id: '2' }, size: 200 },
              ],
              size: 300,
            },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '4' }, size: 200 },
                { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '7' }, size: 200 },
              ],
              size: 300,
            },
            {
              type: 'branch',
              data: [
                { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '5' }, size: 200 },
                { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '6' }, size: 200 },
              ],
              size: 300,
            },
          ],
          size: 400,
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
    attitude: { id: 'attitude', contentComponent: 'AttitudePanel', title: 'Attitude' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
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
                { type: 'leaf', data: { views: ['attitude'], activeView: 'attitude', id: '5' }, size: 331 },
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
    attitude: { id: 'attitude', contentComponent: 'AttitudePanel', title: 'Attitude' },
  },
  activeGroup: '5',
};

// All Panels preset - Map center, all telemetry panels around it
const ALL_PANELS_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['attitude'], activeView: 'attitude', id: '1' }, size: 200 },
            { type: 'leaf', data: { views: ['altitude'], activeView: 'altitude', id: '2' }, size: 200 },
            { type: 'leaf', data: { views: ['speed'], activeView: 'speed', id: '3' }, size: 200 },
          ],
          size: 200,
        },
        {
          type: 'leaf',
          data: { views: ['map'], activeView: 'map', id: '4' },
          size: 600,
        },
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['battery'], activeView: 'battery', id: '5' }, size: 150 },
            { type: 'leaf', data: { views: ['gps'], activeView: 'gps', id: '6' }, size: 150 },
            { type: 'leaf', data: { views: ['position'], activeView: 'position', id: '7' }, size: 150 },
            { type: 'leaf', data: { views: ['velocity'], activeView: 'velocity', id: '8' }, size: 150 },
            { type: 'leaf', data: { views: ['flightMode'], activeView: 'flightMode', id: '9' }, size: 150 },
          ],
          size: 200,
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
    attitude: { id: 'attitude', contentComponent: 'AttitudePanel', title: 'Attitude' },
    altitude: { id: 'altitude', contentComponent: 'AltitudePanel', title: 'Altitude' },
    speed: { id: 'speed', contentComponent: 'SpeedPanel', title: 'Speed' },
    battery: { id: 'battery', contentComponent: 'BatteryPanel', title: 'Battery' },
    gps: { id: 'gps', contentComponent: 'GpsPanel', title: 'GPS' },
    position: { id: 'position', contentComponent: 'PositionPanel', title: 'Position' },
    velocity: { id: 'velocity', contentComponent: 'VelocityPanel', title: 'Velocity' },
    flightMode: { id: 'flightMode', contentComponent: 'FlightModePanel', title: 'Flight Mode' },
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

  // Left group - Attitude and flight data
  const leftGroup = api.addGroup({ direction: 'left', initialWidth: 220 });
  api.addPanel({
    id: 'attitude',
    component: 'AttitudePanel',
    title: 'Attitude',
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
}: {
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  onAddPanel: (id: string, component: string, title: string) => void;
  layouts: string[];
  activeLayout: string;
  supportsMissionPlanning: boolean;
}) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [layoutName, setLayoutName] = useState('');

  // Filter presets to hide Mission Telemetry for boards without mission planning
  const availablePresets = Object.entries(PRESET_LAYOUTS).filter(([key]) => {
    if (key === 'missionTelemetry' && !supportsMissionPlanning) {
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700/50">
      <span className="text-xs text-gray-500">Layout:</span>

      <select
        value={activeLayout}
        onChange={(e) => onLoad(e.target.value)}
        className="bg-gray-700/50 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
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
            className="bg-gray-700/50 border border-gray-600/50 rounded px-2 py-1 text-xs text-gray-200 w-32 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
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
            className="px-2 py-1 bg-gray-600/50 hover:bg-gray-500/50 text-gray-300 text-xs rounded transition-colors"
          >
            Cancel
          </button>
        </div>
      ) : (
        <>
          <button
            onClick={() => setShowSaveDialog(true)}
            className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs rounded transition-colors"
          >
            Save As...
          </button>
          <button
            onClick={onReset}
            className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs rounded transition-colors"
          >
            Reset
          </button>
        </>
      )}

      <div className="flex-1" />

      {/* Add panel dropdown */}
      <AddPanelDropdown onAddPanel={onAddPanel} supportsMissionPlanning={supportsMissionPlanning} />
    </div>
  );
}

// Mission-related panel IDs that require mission planning support
// Note: missionMap removed - now integrated into unified MapPanel
const MISSION_PANEL_IDS = ['waypoints', 'altitudeProfile'];

// Add panel dropdown
function AddPanelDropdown({ onAddPanel, supportsMissionPlanning }: { onAddPanel: (id: string, component: string, title: string) => void; supportsMissionPlanning: boolean }) {
  const [isOpen, setIsOpen] = useState(false);

  // Filter out mission panels if mission planning is not supported
  const availablePanels = Object.entries(PANEL_COMPONENTS).filter(([id]) => {
    if (MISSION_PANEL_IDS.includes(id) && !supportsMissionPlanning) {
      return false;
    }
    return true;
  });

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs rounded transition-colors flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        Add Panel
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-gray-800 border border-gray-700/50 rounded-lg shadow-xl z-20 py-1 min-w-[150px]">
            {availablePanels.map(([id, { component, title }]) => (
              <button
                key={id}
                onClick={() => {
                  onAddPanel(id, component, title);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-1.5 text-left text-xs text-gray-300 hover:bg-gray-700/50 transition-colors"
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

// Quick stats bar
function QuickStatsBar() {
  const { flight, vfrHud, battery } = useTelemetryStore();
  const batteryColor = battery.remaining > 30 ? 'text-emerald-400' : battery.remaining > 15 ? 'text-yellow-400' : 'text-red-400';

  return (
    <div className={`shrink-0 px-4 py-2 flex items-center justify-between border-b ${
      flight.armed
        ? 'bg-red-500/10 border-red-500/30'
        : 'bg-gray-800/40 border-gray-700/40'
    }`}>
      <div className="flex items-center gap-3">
        <span className={`px-2.5 py-1 rounded text-xs font-bold uppercase tracking-wide ${
          flight.armed ? 'bg-red-500 text-white' : 'bg-gray-700 text-gray-400'
        }`}>
          {flight.armed ? 'Armed' : 'Disarmed'}
        </span>
        <span className="text-lg font-medium text-white">{flight.mode}</span>
      </div>
      <div className="flex items-center gap-6 text-xs">
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500">HDG</span>
          <span className="font-mono text-sm text-gray-200">{vfrHud.heading.toFixed(0)}°</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500">ALT</span>
          <span className="font-mono text-sm text-gray-200">{vfrHud.alt.toFixed(1)}m</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500">SPD</span>
          <span className="font-mono text-sm text-gray-200">{vfrHud.groundspeed.toFixed(1)}m/s</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500">THR</span>
          <span className="font-mono text-sm text-gray-200">{vfrHud.throttle}%</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-gray-500">BAT</span>
          <span className={`font-mono text-sm ${batteryColor}`}>{battery.voltage.toFixed(1)}V</span>
        </div>
      </div>
    </div>
  );
}

export function TelemetryDashboard() {
  const apiRef = useRef<DockviewApi | null>(null);
  const { layouts, activeLayoutName, loadLayouts, saveLayout, setActiveLayout } = useLayoutStore();
  const { connectionState } = useConnectionStore();
  const [layoutLoaded, setLayoutLoaded] = useState(false);

  // Check if mission planning is supported
  // Betaflight (BTFL) and Cleanflight (CLFL) do NOT support missions
  // iNav (INAV) and MAVLink (ArduPilot) DO support missions
  const isMspBetaflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'BTFL';
  const isMspCleanflight = connectionState.protocol === 'msp' && connectionState.fcVariant === 'CLFL';
  const supportsMissionPlanning = !isMspBetaflight && !isMspCleanflight;

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
      />

      {/* Dockview container */}
      <div className="flex-1 dockview-theme-dark">
        <DockviewReact
          components={components}
          onReady={onReady}
          className="h-full"
        />
      </div>
    </div>
  );
}
