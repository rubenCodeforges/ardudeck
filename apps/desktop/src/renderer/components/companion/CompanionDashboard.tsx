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
import { CompanionStoreTab } from './CompanionStoreTab';
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
import { DroneBridgeStatusPanel } from './panels/DroneBridgeStatusPanel';
import { DroneBridgeSettingsPanel } from './panels/DroneBridgeSettingsPanel';

// ─── Tab types ──────────────────────────────────────────────────────────────

type CompanionTab = 'store' | 'dronebridge' | 'dashboard';

const TAB_ITEMS: Array<{ id: CompanionTab; label: string; icon: string }> = [
  { id: 'store', label: 'Store', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'dronebridge', label: 'DroneBridge', icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0' },
  { id: 'dashboard', label: 'Dashboard', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
];

// ─── Dockview component registry ────────────────────────────────────────────

const dockviewComponents: Record<string, React.FC<IDockviewPanelProps>> = {
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
  CompanionDroneBridgeStatusPanel: () => <DroneBridgeStatusPanel />,
  CompanionDroneBridgeSettingsPanel: () => <DroneBridgeSettingsPanel />,
};

// ─── Preset layouts ─────────────────────────────────────────────────────────

const COMPANION_AUTOSAVE_NAME = '__companion_autosave';

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

const DEBUG_LAYOUT: SerializedDockview = {
  grid: {
    root: {
      type: 'branch',
      data: [
        { type: 'leaf', data: { views: ['terminal'], activeView: 'terminal', id: '1' }, size: 500 },
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
    case 'overview': api.fromJSON(OVERVIEW_LAYOUT); break;
    case 'debug': api.fromJSON(DEBUG_LAYOUT); break;
    case 'manage': api.fromJSON(MANAGE_LAYOUT); break;
    default: api.fromJSON(OVERVIEW_LAYOUT); break;
  }
}

// ─── Tab bar ────────────────────────────────────────────────────────────────

function CompanionTabBar({ activeTab, onTabChange }: { activeTab: CompanionTab; onTabChange: (tab: CompanionTab) => void }) {
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-gray-800/60 border-b border-gray-700/50">
      {TAB_ITEMS.map(({ id, label, icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
            activeTab === id
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-gray-400 hover:text-gray-200 hover:bg-gray-700/40'
          }`}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          {label}
        </button>
      ))}
    </div>
  );
}

// ─── DroneBridge tab ────────────────────────────────────────────────────────

function DroneBridgeTab() {
  const droneBridgeIp = useCompanionStore((s) => s.droneBridgeIp);
  const droneBridgeInfo = useCompanionStore((s) => s.droneBridgeInfo);
  const setDroneBridgeIp = useCompanionStore((s) => s.setDroneBridgeIp);
  const [autoProbing, setAutoProbing] = useState(false);

  // Auto-probe default IP on mount if nothing is set
  useEffect(() => {
    if (droneBridgeIp || droneBridgeInfo) return;
    let cancelled = false;

    const autoProbe = async () => {
      setAutoProbing(true);
      try {
        const result = await window.electronAPI.dronebridgeDetect();
        if (!cancelled && result) {
          setDroneBridgeIp(result.ip);
        }
      } catch {
        // Not found
      } finally {
        if (!cancelled) setAutoProbing(false);
      }
    };
    autoProbe();
    return () => { cancelled = true; };
  }, [droneBridgeIp, droneBridgeInfo, setDroneBridgeIp]);

  if (!droneBridgeIp && !droneBridgeInfo) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-md text-center space-y-4">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-800/50 border border-gray-700/30">
            <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-gray-300">
            {autoProbing ? 'Scanning for DroneBridge...' : 'No DroneBridge Detected'}
          </h3>
          {autoProbing ? (
            <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              Trying 192.168.2.1...
            </div>
          ) : (
            <p className="text-xs text-gray-500">
              Connect to your DroneBridge WiFi network, or read settings directly via USB.
            </p>
          )}
          {!autoProbing && (
            <div className="space-y-3">
              <DroneBridgeUsbReader />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-gray-700/30" />
                <span className="text-[10px] text-gray-600">or connect via WiFi</span>
                <div className="flex-1 h-px bg-gray-700/30" />
              </div>
              <DroneBridgeManualProbe />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-2 gap-0 divide-x divide-gray-700/30">
      <div className="overflow-y-auto">
        <DroneBridgeStatusPanel />
      </div>
      <div className="overflow-y-auto">
        <DroneBridgeSettingsPanel />
      </div>
    </div>
  );
}

interface SerialReadResult {
  ssid: string | null;
  apIp: string | null;
  settings: Record<string, unknown> | null;
  error?: string;
}

function DroneBridgeUsbReader() {
  const [ports, setPorts] = useState<string[]>([]);
  const [selectedPort, setSelectedPort] = useState('');
  const [reading, setReading] = useState(false);
  const [result, setResult] = useState<SerialReadResult | null>(null);
  const setDroneBridgeIp = useCompanionStore((s) => s.setDroneBridgeIp);

  // Load ports on mount
  useEffect(() => {
    window.electronAPI?.listSerialPorts().then((res) => {
      if (res?.ports) setPorts(res.ports.map((p) => p.path));
    });
  }, []);

  const handleRefresh = async () => {
    const res = await window.electronAPI?.listSerialPorts();
    if (res?.ports) setPorts(res.ports.map((p) => p.path));
  };

  const handleRead = async () => {
    if (!selectedPort) return;
    setReading(true);
    setResult(null);

    // Disconnect first in case ArduDeck holds the port
    try { await window.electronAPI?.disconnect(); } catch { /* fine */ }
    await new Promise((r) => setTimeout(r, 300));

    try {
      const info = await window.electronAPI?.dronebridgeReadSerialReset(selectedPort);
      if (info?.settings) {
        setResult({ ssid: info.ssid, apIp: info.apIp, settings: info.settings });
      } else {
        setResult({ ssid: null, apIp: null, settings: null, error: 'No DroneBridge data received. Is this a DroneBridge device?' });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ ssid: null, apIp: null, settings: null, error: `Failed to read serial: ${msg}` });
    } finally {
      setReading(false);
    }
  };

  const handleGoLive = () => {
    if (result?.apIp) {
      setDroneBridgeIp(result.apIp);
    }
  };

  // Show serial-read device info card
  if (result?.settings) {
    const s = result.settings;
    return (
      <div className="space-y-3 text-left">
        <div className="bg-gray-800/50 border border-gray-700/30 rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">Device Found (USB)</span>
          </div>

          <div className="space-y-1.5">
            {result.ssid && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">WiFi SSID</span>
                <span className="text-gray-200 font-mono">{result.ssid}</span>
              </div>
            )}
            {s['wifi_pass'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Password</span>
                <span className="text-gray-200 font-mono">{String(s['wifi_pass'])}</span>
              </div>
            )}
            {result.apIp && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">AP IP</span>
                <span className="text-gray-200 font-mono">{result.apIp}</span>
              </div>
            )}
            {s['esp32_mode'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Mode</span>
                <span className="text-gray-200">{
                  ({ 1: 'Access Point', 2: 'Station', 3: 'Long Range', 4: 'ESP-NOW Air', 5: 'ESP-NOW Ground' } as Record<number, string>)[Number(s['esp32_mode'])] ?? `Mode ${s['esp32_mode']}`
                }</span>
              </div>
            )}
            {s['baud'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Baud Rate</span>
                <span className="text-gray-200 font-mono">{String(s['baud'])}</span>
              </div>
            )}
            {s['proto'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-gray-500">Protocol</span>
                <span className="text-gray-200">{
                  ({ 0: 'MSP / LTM', 1: 'MAVLink', 2: 'Transparent' } as Record<number, string>)[Number(s['proto'])] ?? `Proto ${s['proto']}`
                }</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-blue-300">
            To manage settings live, connect your computer to the
            <span className="font-mono font-medium"> {result.ssid ?? 'DroneBridge'} </span>
            WiFi network, then click below.
          </p>
          <button
            onClick={handleGoLive}
            className="w-full py-2 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            I'm on the WiFi — Connect
          </button>
        </div>

        <button
          onClick={() => setResult(null)}
          className="w-full text-[10px] text-gray-600 hover:text-gray-400 transition-colors"
        >
          Back
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <select
          value={selectedPort}
          onChange={(e) => setSelectedPort(e.target.value)}
          disabled={reading}
          className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
        >
          <option value="">Select USB port...</option>
          {ports.map((port) => (
            <option key={port} value={port}>{port}</option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={reading}
          className="px-2 py-2 bg-gray-700/50 hover:bg-gray-600/50 disabled:opacity-40 text-gray-300 rounded-lg transition-colors"
          title="Refresh ports"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <button
        onClick={handleRead}
        disabled={!selectedPort || reading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600/80 hover:bg-amber-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
      >
        {reading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            Reading from USB...
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 5h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
            Read from USB
          </>
        )}
      </button>
      {reading && (
        <p className="text-[10px] text-gray-600 text-center">
          Resetting device and reading boot log (~10s)
        </p>
      )}
      {result?.error && (
        <div className="text-[10px] text-red-400">{result.error}</div>
      )}
    </div>
  );
}

function DroneBridgeManualProbe() {
  const [ip, setIp] = useState('192.168.2.1');
  const [probing, setProbing] = useState(false);
  const setDroneBridgeIp = useCompanionStore((s) => s.setDroneBridgeIp);
  const setDroneBridgeInfo = useCompanionStore((s) => s.setDroneBridgeInfo);

  const handleProbe = async () => {
    const target = ip.trim();
    if (!target) return;
    setProbing(true);
    try {
      const info = await window.electronAPI.dronebridgeGetInfo(target);
      if (info) {
        setDroneBridgeIp(target);
        setDroneBridgeInfo(info);
      } else {
        setDroneBridgeIp(target);
      }
    } catch {
      setDroneBridgeIp(target);
    } finally {
      setProbing(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        value={ip}
        onChange={(e) => setIp(e.target.value)}
        placeholder="192.168.2.1"
        className="flex-1 bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 font-mono placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        onKeyDown={(e) => { if (e.key === 'Enter') handleProbe(); }}
      />
      <button
        onClick={handleProbe}
        disabled={!ip.trim() || probing}
        className="px-3 py-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
      >
        {probing ? 'Probing...' : 'Connect'}
      </button>
    </div>
  );
}

// ─── Dashboard tab ──────────────────────────────────────────────────────────

function DashboardTab() {
  const apiRef = useRef<DockviewApi | null>(null);
  const connectionState = useCompanionStore((s) => s.connectionState);
  const { layouts: allLayouts, saveLayout, loadLayouts } = useLayoutStore();
  const [activeLayout, setActiveLayout] = useState<string>(DEFAULT_PRESET);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { loadLayouts(); }, [loadLayouts]);

  const userLayouts = Object.keys(allLayouts).filter(
    (name) => name.startsWith('companion:') && name !== COMPANION_AUTOSAVE_NAME,
  ).map((name) => name.replace('companion:', ''));

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
    const autoSaved = allLayouts[COMPANION_AUTOSAVE_NAME];
    if (autoSaved?.data) {
      try {
        event.api.fromJSON(autoSaved.data as SerializedDockview);
        setActiveLayout(COMPANION_AUTOSAVE_NAME);
        return;
      } catch { /* fall through */ }
    }
    loadPresetLayout(event.api, DEFAULT_PRESET);
    setActiveLayout(DEFAULT_PRESET);
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
    const savedData = allLayouts[`companion:${name}`]?.data;
    if (savedData) {
      try {
        apiRef.current.fromJSON(savedData as SerializedDockview);
        setActiveLayout(name);
        scheduleAutoSave();
      } catch { /* invalid layout */ }
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
    apiRef.current.addPanel({ id: `${id}-${Date.now()}`, component, title });
    scheduleAutoSave();
  }, [scheduleAutoSave]);

  // Disconnected state
  if (connectionState.state === 'disconnected') {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="max-w-lg text-center space-y-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-800/50 border border-gray-700/30">
            <svg className="w-7 h-7 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-gray-300">ArduDeck Agent Not Connected</h3>
            <p className="text-xs text-gray-500 mt-2 max-w-sm mx-auto">
              Install the ArduDeck Agent on your companion computer to enable real-time metrics, terminal access, and service management.
            </p>
          </div>

          <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-5 text-left space-y-4">
            <h4 className="text-xs font-medium text-gray-300">Quick Install</h4>
            <div className="bg-gray-900/60 rounded-lg px-3 py-2 font-mono text-xs text-gray-400 select-all">
              curl -fsSL https://ardudeck.com/agent/install.sh | bash
            </div>
            <DashboardConnectForm />
          </div>
        </div>
      </div>
    );
  }

  // Connected state — dockview dashboard
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
          components={dockviewComponents}
          onReady={handleReady}
          className="dockview-theme-abyss"
        />
      </div>
    </div>
  );
}

function DashboardConnectForm() {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const [connecting, setConnecting] = useState(false);

  const handleConnect = () => {
    if (!host.trim() || !token.trim()) return;
    setConnecting(true);
    window.electronAPI.companionConnect({ host: host.trim(), token: token.trim() });
    setTimeout(() => setConnecting(false), 3000);
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-medium text-gray-300">Connect to Agent</h4>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.1.100"
          className="bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
        />
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Pairing token"
          className="bg-gray-900/60 border border-gray-700/50 rounded-lg px-3 py-2 text-xs text-gray-200 placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
        />
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting || !host.trim() || !token.trim()}
        className="w-full py-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-gray-700/50 disabled:text-gray-600 text-white text-xs font-medium rounded-lg transition-colors"
      >
        {connecting ? 'Connecting...' : 'Connect'}
      </button>
    </div>
  );
}

// ─── Status bar (shown in dashboard tab when connected) ─────────────────────

function CompanionStatusBar() {
  const connectionState = useCompanionStore((s) => s.connectionState);
  const metrics = useCompanionStore((s) => s.metrics);

  const stateDots: Record<string, string> = {
    connected: 'bg-emerald-400',
    connecting: 'bg-yellow-400 animate-pulse',
    reconnecting: 'bg-yellow-400 animate-pulse',
    disconnected: 'bg-gray-600',
  };

  const stateColors: Record<string, string> = {
    connected: 'text-emerald-400',
    connecting: 'text-yellow-400',
    reconnecting: 'text-yellow-400',
    disconnected: 'text-gray-500',
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

// ─── Layout toolbar ─────────────────────────────────────────────────────────

function CompanionLayoutToolbar({
  onSave, onLoad, onReset, onAddPanel, layouts, activeLayout,
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
          <button onClick={handleSave} className="px-2 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs rounded transition-colors">Save</button>
          <button onClick={() => setShowSaveDialog(false)} className="px-2 py-1 bg-gray-600/50 hover:bg-gray-500/50 text-gray-300 text-xs rounded transition-colors">Cancel</button>
        </div>
      ) : (
        <>
          <button onClick={() => setShowSaveDialog(true)} className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs rounded transition-colors">Save As...</button>
          <button onClick={onReset} className="px-2 py-1 bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 text-xs rounded transition-colors">Reset</button>
        </>
      )}

      <div className="flex-1" />

      <div className="relative">
        <CompanionAddPanelDropdown onAddPanel={onAddPanel} />
      </div>
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
                onClick={() => { onAddPanel(id, component, title); setIsOpen(false); }}
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

// ─── Main companion view ────────────────────────────────────────────────────

export function CompanionDashboard() {
  const connectionState = useCompanionStore((s) => s.connectionState);
  const droneBridgeIp = useCompanionStore((s) => s.droneBridgeIp);
  const setDroneBridgeIp = useCompanionStore((s) => s.setDroneBridgeIp);

  // Default to Store tab when nothing is connected, Dashboard when agent is connected
  const defaultTab: CompanionTab = connectionState.state === 'connected' ? 'dashboard'
    : droneBridgeIp ? 'dronebridge'
    : 'store';
  const [activeTab, setActiveTab] = useState<CompanionTab>(defaultTab);

  // Called by CompanionStoreTab after a successful ESP32 flash
  const handleFlashComplete = useCallback((templateId: string, apIp?: string) => {
    // DroneBridge templates — auto-set IP (from serial boot log or default) and switch tab
    if (templateId.startsWith('dronebridge')) {
      setDroneBridgeIp(apIp ?? '192.168.2.1');
      setActiveTab('dronebridge');
    }
  }, [setDroneBridgeIp]);

  return (
    <div className="h-full flex flex-col bg-gray-900">
      <CompanionTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'store' && <CompanionStoreTab onFlashComplete={handleFlashComplete} />}
        {activeTab === 'dronebridge' && <DroneBridgeTab />}
        {activeTab === 'dashboard' && <DashboardTab />}
      </div>
    </div>
  );
}
