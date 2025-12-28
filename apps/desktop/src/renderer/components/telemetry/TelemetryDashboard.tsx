import { useEffect, useRef, useState, useCallback } from 'react';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';

import { useTelemetryStore } from '../../stores/telemetry-store';
import { useLayoutStore } from '../../stores/layout-store';
import {
  AttitudePanel,
  AltitudePanel,
  SpeedPanel,
  BatteryPanel,
  GpsPanel,
  PositionPanel,
  VelocityPanel,
  FlightModePanel,
  MapPanel,
  PANEL_COMPONENTS,
} from '../panels';

// Panel component wrapper for dockview
function PanelWrapper({ component }: { component: React.ComponentType }) {
  const Component = component;
  return <Component />;
}

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  AttitudePanel: () => <PanelWrapper component={AttitudePanel} />,
  AltitudePanel: () => <PanelWrapper component={AltitudePanel} />,
  SpeedPanel: () => <PanelWrapper component={SpeedPanel} />,
  BatteryPanel: () => <PanelWrapper component={BatteryPanel} />,
  GpsPanel: () => <PanelWrapper component={GpsPanel} />,
  PositionPanel: () => <PanelWrapper component={PositionPanel} />,
  VelocityPanel: () => <PanelWrapper component={VelocityPanel} />,
  FlightModePanel: () => <PanelWrapper component={FlightModePanel} />,
  MapPanel: () => <PanelWrapper component={MapPanel} />,
};

// Default layout configuration
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
  const leftGroup = api.addGroup({ direction: 'left', size: 220 });
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
  const rightGroup = api.addGroup({ direction: 'right', size: 180 });
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

// Layout toolbar component
function LayoutToolbar({
  onSave,
  onLoad,
  onReset,
  layouts,
  activeLayout,
}: {
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  layouts: string[];
  activeLayout: string;
}) {
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [layoutName, setLayoutName] = useState('');

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
        <option value="default">Default</option>
        {layouts.filter(l => l !== 'default').map((name) => (
          <option key={name} value={name}>{name}</option>
        ))}
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
      <AddPanelDropdown />
    </div>
  );
}

// Add panel dropdown
function AddPanelDropdown() {
  const [isOpen, setIsOpen] = useState(false);

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
            {Object.entries(PANEL_COMPONENTS).map(([id, { title }]) => (
              <button
                key={id}
                onClick={() => {
                  // Panel will be added via context - for now just close
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

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  const onReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // Try to load saved layout
    const savedLayout = layouts[activeLayoutName];
    if (savedLayout?.data) {
      try {
        event.api.fromJSON(savedLayout.data as SerializedDockview);
        return;
      } catch (e) {
        console.warn('Failed to load saved layout, using default:', e);
      }
    }

    // Create default layout
    createDefaultLayout(event.api);
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

    const layout = layouts[name];
    if (layout?.data) {
      try {
        apiRef.current.fromJSON(layout.data as SerializedDockview);
      } catch (e) {
        console.warn('Failed to load layout:', e);
        apiRef.current.clear();
        createDefaultLayout(apiRef.current);
      }
    } else {
      apiRef.current.clear();
      createDefaultLayout(apiRef.current);
    }
  }, [layouts, setActiveLayout]);

  const handleResetLayout = useCallback(() => {
    if (!apiRef.current) return;
    apiRef.current.clear();
    createDefaultLayout(apiRef.current);
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
        layouts={Object.keys(layouts)}
        activeLayout={activeLayoutName}
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
