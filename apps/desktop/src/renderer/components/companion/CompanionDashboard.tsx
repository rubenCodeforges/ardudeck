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

import { useCompanionStore } from '../../stores/companion-store';
import { useLayoutStore } from '../../stores/layout-store';
import { COMPANION_PANEL_COMPONENTS, type CompanionPanelId } from './index';
import { StatusPanel } from './panels/StatusPanel';
import { MetricsPanel } from './panels/MetricsPanel';
import { NetworkPanel } from './panels/NetworkPanel';
import { ProcessesPanel } from './panels/ProcessesPanel';
import { LogsPanel } from './panels/LogsPanel';
import { TerminalPanel } from './panels/TerminalPanel';
import { FileBrowserPanel } from './panels/FileBrowserPanel';
import { ServicesPanel } from './panels/ServicesPanel';
import { ContainersPanel } from './panels/ContainersPanel';
import { ExtensionsPanel } from './panels/ExtensionsPanel';

// Reserved layout name for auto-save (separate namespace from telemetry)
const COMPANION_AUTOSAVE_NAME = '__companion_autosave';

// Component registry for dockview
const components: Record<string, React.FC<IDockviewPanelProps>> = {
  CompanionStatusPanel: () => <StatusPanel />,
  CompanionMetricsPanel: () => <MetricsPanel />,
  CompanionNetworkPanel: () => <NetworkPanel />,
  CompanionProcessesPanel: () => <ProcessesPanel />,
  CompanionLogsPanel: () => <LogsPanel />,
  CompanionTerminalPanel: () => <TerminalPanel />,
  CompanionFileBrowserPanel: () => <FileBrowserPanel />,
  CompanionServicesPanel: () => <ServicesPanel />,
  CompanionContainersPanel: () => <ContainersPanel />,
  CompanionExtensionsPanel: () => <ExtensionsPanel />,
};

// Preset layouts
const PRESET_LAYOUTS = {
  overview: 'Overview',
  debug: 'Debug',
  manage: 'Manage',
} as const;

type PresetLayoutKey = keyof typeof PRESET_LAYOUTS;
const DEFAULT_PRESET: PresetLayoutKey = 'overview';

function isPresetLayout(name: string): name is PresetLayoutKey {
  return name in PRESET_LAYOUTS;
}

// Overview preset: Status + Metrics + Network + Containers
const OVERVIEW_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['status'], activeView: 'status', id: '1' }, size: 300 },
            { type: 'leaf', data: { views: ['network'], activeView: 'network', id: '3' }, size: 300 },
          ],
          size: 400,
        },
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['metrics'], activeView: 'metrics', id: '2' }, size: 300 },
            { type: 'leaf', data: { views: ['containers'], activeView: 'containers', id: '4' }, size: 300 },
          ],
          size: 600,
        },
      ],
      size: 900,
    },
    width: 1000,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    status: { id: 'status', contentComponent: 'CompanionStatusPanel', title: 'Status' },
    metrics: { id: 'metrics', contentComponent: 'CompanionMetricsPanel', title: 'System Metrics' },
    network: { id: 'network', contentComponent: 'CompanionNetworkPanel', title: 'Network' },
    containers: { id: 'containers', contentComponent: 'CompanionContainersPanel', title: 'Containers' },
  },
  activeGroup: '1',
};

// Debug preset: Terminal + Logs + Processes
const DEBUG_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'leaf',
          data: { views: ['terminal'], activeView: 'terminal', id: '1' },
          size: 500,
        },
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['logs'], activeView: 'logs', id: '2' }, size: 450 },
            { type: 'leaf', data: { views: ['processes'], activeView: 'processes', id: '3' }, size: 450 },
          ],
          size: 500,
        },
      ],
      size: 900,
    },
    width: 1000,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    terminal: { id: 'terminal', contentComponent: 'CompanionTerminalPanel', title: 'Terminal' },
    logs: { id: 'logs', contentComponent: 'CompanionLogsPanel', title: 'Logs' },
    processes: { id: 'processes', contentComponent: 'CompanionProcessesPanel', title: 'Processes' },
  },
  activeGroup: '1',
};

// Manage preset: Containers + Services + File Browser + Extensions
const MANAGE_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['containers'], activeView: 'containers', id: '1' }, size: 450 },
            { type: 'leaf', data: { views: ['services'], activeView: 'services', id: '2' }, size: 450 },
          ],
          size: 500,
        },
        {
          type: 'branch',
          data: [
            { type: 'leaf', data: { views: ['fileBrowser'], activeView: 'fileBrowser', id: '3' }, size: 450 },
            { type: 'leaf', data: { views: ['extensions'], activeView: 'extensions', id: '4' }, size: 450 },
          ],
          size: 500,
        },
      ],
      size: 900,
    },
    width: 1000,
    height: 900,
    orientation: Orientation.HORIZONTAL,
  },
  panels: {
    containers: { id: 'containers', contentComponent: 'CompanionContainersPanel', title: 'Containers' },
    services: { id: 'services', contentComponent: 'CompanionServicesPanel', title: 'Services' },
    fileBrowser: { id: 'fileBrowser', contentComponent: 'CompanionFileBrowserPanel', title: 'File Browser' },
    extensions: { id: 'extensions', contentComponent: 'CompanionExtensionsPanel', title: 'Extensions' },
  },
  activeGroup: '1',
};

function loadPresetLayout(api: DockviewApi, preset: PresetLayoutKey): void {
  switch (preset) {
    case 'overview':
      api.fromJSON(OVERVIEW_LAYOUT);
      break;
    case 'debug':
      api.fromJSON(DEBUG_LAYOUT);
      break;
    case 'manage':
      api.fromJSON(MANAGE_LAYOUT);
      break;
    default:
      api.fromJSON(OVERVIEW_LAYOUT);
      break;
  }
}

// Layout toolbar (mirrors TelemetryDashboard pattern)
function CompanionLayoutToolbar({
  onSave,
  onLoad,
  onReset,
  onAddPanel,
  layouts,
  activeLayout,
}: {
  onSave: (name: string) => void;
  onLoad: (name: string) => void;
  onReset: () => void;
  onAddPanel: (id: string, component: string, title: string) => void;
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
        <optgroup label="Presets">
          {Object.entries(PRESET_LAYOUTS).map(([key, name]) => (
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
      <CompanionAddPanelDropdown onAddPanel={onAddPanel} />
    </div>
  );
}

function CompanionAddPanelDropdown({ onAddPanel }: { onAddPanel: (id: string, component: string, title: string) => void }) {
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
            {Object.entries(COMPANION_PANEL_COMPONENTS).map(([id, { component, title }]) => (
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

// Connection status bar
function CompanionStatusBar() {
  const connectionState = useCompanionStore((s) => s.connectionState);
  const metrics = useCompanionStore((s) => s.metrics);

  const stateColors: Record<string, string> = {
    connected: 'text-emerald-400',
    connecting: 'text-yellow-400',
    reconnecting: 'text-yellow-400',
    disconnected: 'text-gray-500',
  };

  const stateDots: Record<string, string> = {
    connected: 'bg-emerald-400',
    connecting: 'bg-yellow-400 animate-pulse',
    reconnecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-gray-600',
  };

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-gray-800/40 border-b border-gray-700/30 text-xs">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${stateDots[connectionState.state] ?? 'bg-gray-600'}`} />
        <span className={stateColors[connectionState.state] ?? 'text-gray-500'}>
          {connectionState.state === 'connected' && connectionState.host
            ? connectionState.host
            : connectionState.state === 'reconnecting'
              ? `Reconnecting (attempt ${connectionState.reconnectAttempt})...`
              : connectionState.state.charAt(0).toUpperCase() + connectionState.state.slice(1)
          }
        </span>
      </div>

      {connectionState.state === 'connected' && connectionState.agentVersion && (
        <span className="text-gray-600">Agent v{connectionState.agentVersion}</span>
      )}

      {connectionState.versionMismatch && (
        <span className="text-yellow-500">Protocol version mismatch - update your agent</span>
      )}

      {metrics && (
        <>
          <span className="text-gray-600">|</span>
          <span className="text-gray-400">CPU {metrics.cpu.toFixed(0)}%</span>
          <span className="text-gray-400">RAM {metrics.ram.toFixed(0)}%</span>
          {metrics.temp > 0 && (
            <span className={metrics.temp > 80 ? 'text-red-400' : 'text-gray-400'}>
              {metrics.temp.toFixed(0)}C
            </span>
          )}
        </>
      )}
    </div>
  );
}

// Onboarding screen shown when agent is not connected
function CompanionOnboarding({ onConnect }: { onConnect: (host: string, token: string) => void }) {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (!host.trim() || !token.trim()) return;
    setConnecting(true);
    setError(null);
    try {
      onConnect(host.trim(), token.trim());
    } catch {
      setError('Connection failed');
    } finally {
      setConnecting(false);
    }
  };

  return (
    <div className="h-full flex items-center justify-center p-8">
      <div className="max-w-2xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-500/10 border border-blue-500/20">
            <svg className="w-8 h-8 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <h2 className="text-xl font-semibold text-gray-100">Companion Computer</h2>
          <p className="text-sm text-gray-400 max-w-md mx-auto">
            Monitor and manage your companion computer (Raspberry Pi, Jetson, ESP32, etc.) directly from ArduDeck.
          </p>
        </div>

        {/* Setup steps */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-200">Setup</h3>

          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-medium">1</div>
              <div>
                <p className="text-sm text-gray-300">Install the ArduDeck Agent on your companion computer</p>
                <div className="mt-2 bg-gray-900/60 rounded-lg px-3 py-2 font-mono text-xs text-gray-400 select-all">
                  curl -fsSL https://ardudeck.com/agent/install.sh | bash
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-medium">2</div>
              <div>
                <p className="text-sm text-gray-300">Note the pairing token shown after installation</p>
                <p className="text-xs text-gray-500 mt-1">The agent generates a unique token for authentication. You can find it later with: <span className="font-mono">ardudeck-agent token</span></p>
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-medium">3</div>
              <div>
                <p className="text-sm text-gray-300">Connect below using the companion's IP and token</p>
              </div>
            </div>
          </div>
        </div>

        {/* Connect form */}
        <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-6 space-y-4">
          <h3 className="text-sm font-medium text-gray-200">Connect</h3>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Host / IP Address</label>
              <input
                type="text"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                placeholder="192.168.1.100"
                className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pairing Token</label>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste token here"
                className="w-full bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-sm text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
                onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
              />
            </div>
          </div>

          {error && (
            <p className="text-xs text-red-400">{error}</p>
          )}

          <button
            onClick={handleConnect}
            disabled={connecting || !host.trim() || !token.trim()}
            className="w-full py-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-sm font-medium rounded-lg transition-colors"
          >
            {connecting ? 'Connecting...' : 'Connect to Companion'}
          </button>
        </div>

        {/* What you get */}
        <div className="grid grid-cols-3 gap-3 text-center">
          {[
            { label: 'System Metrics', desc: 'CPU, RAM, temp, disk' },
            { label: 'Terminal Access', desc: 'Remote shell, no SSH needed' },
            { label: 'Service Control', desc: 'Docker, systemd, files' },
          ].map((item) => (
            <div key={item.label} className="bg-gray-800/20 rounded-lg border border-gray-700/20 p-3">
              <p className="text-xs font-medium text-gray-300">{item.label}</p>
              <p className="text-xs text-gray-600 mt-0.5">{item.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Main dashboard component
export function CompanionDashboard() {
  const apiRef = useRef<DockviewApi | null>(null);
  const connectionState = useCompanionStore((s) => s.connectionState);
  const { layouts: allLayouts, saveLayout, loadLayouts } = useLayoutStore();
  const [activeLayout, setActiveLayout] = useState<string>(DEFAULT_PRESET);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load layouts on mount
  useEffect(() => {
    loadLayouts();
  }, [loadLayouts]);

  // Filter to companion-namespaced layouts
  const userLayouts = Object.keys(allLayouts).filter(
    (name) => name.startsWith('companion:') && name !== COMPANION_AUTOSAVE_NAME,
  ).map((name) => name.replace('companion:', ''));

  // Auto-save current layout on changes
  const scheduleAutoSave = useCallback(() => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      if (apiRef.current) {
        const data = apiRef.current.toJSON();
        saveLayout(COMPANION_AUTOSAVE_NAME, data);
      }
    }, 1000);
  }, [saveLayout]);

  const handleReady = useCallback((event: DockviewReadyEvent) => {
    apiRef.current = event.api;

    // Try to restore auto-saved layout
    const autoSaved = allLayouts[COMPANION_AUTOSAVE_NAME];
    if (autoSaved?.data) {
      try {
        event.api.fromJSON(autoSaved.data as SerializedDockview);
        setActiveLayout(COMPANION_AUTOSAVE_NAME);
        return;
      } catch {
        // Fall through to default preset
      }
    }

    // Default: load overview preset
    loadPresetLayout(event.api, DEFAULT_PRESET);
    setActiveLayout(DEFAULT_PRESET);

    // Listen for layout changes to auto-save
    event.api.onDidLayoutChange(() => scheduleAutoSave());
  }, [allLayouts, scheduleAutoSave]);

  const handleLoadLayout = useCallback((name: string) => {
    if (!apiRef.current) return;

    if (isPresetLayout(name)) {
      loadPresetLayout(apiRef.current, name);
      setActiveLayout(name);
      scheduleAutoSave();
      return;
    }

    // Load user-saved layout (companion-namespaced)
    const savedData = allLayouts[`companion:${name}`]?.data;
    if (savedData) {
      try {
        apiRef.current.fromJSON(savedData as SerializedDockview);
        setActiveLayout(name);
        scheduleAutoSave();
      } catch {
        // Invalid layout data
      }
    }
  }, [allLayouts, scheduleAutoSave]);

  const handleSaveLayout = useCallback((name: string) => {
    if (!apiRef.current) return;
    const data = apiRef.current.toJSON();
    saveLayout(`companion:${name}`, data);
    setActiveLayout(name);
  }, [saveLayout]);

  const handleReset = useCallback(() => {
    if (!apiRef.current) return;
    loadPresetLayout(apiRef.current, DEFAULT_PRESET);
    setActiveLayout(DEFAULT_PRESET);
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleAddPanel = useCallback((id: string, component: string, title: string) => {
    if (!apiRef.current) return;
    // Add panel with unique id to allow duplicates
    apiRef.current.addPanel({
      id: `${id}-${Date.now()}`,
      component,
      title,
    });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  const handleOnboardingConnect = useCallback((host: string, token: string) => {
    window.electronAPI.companionConnect({ host, token });
  }, []);

  // Show onboarding when not connected
  if (connectionState.state === 'disconnected') {
    return <CompanionOnboarding onConnect={handleOnboardingConnect} />;
  }

  return (
    <div className="h-full flex flex-col">
      <CompanionStatusBar />
      <CompanionLayoutToolbar
        onSave={handleSaveLayout}
        onLoad={handleLoadLayout}
        onReset={handleReset}
        onAddPanel={handleAddPanel}
        layouts={userLayouts}
        activeLayout={activeLayout}
      />
      <div className="flex-1">
        <DockviewReact
          components={components}
          onReady={handleReady}
          className="dockview-theme-abyss"
        />
      </div>
    </div>
  );
}
