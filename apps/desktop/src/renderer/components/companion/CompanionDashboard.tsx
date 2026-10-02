import { useEffect, useRef, useState, useCallback } from 'react';
import type { TFunction } from 'i18next';
import {
  DockviewReact,
  DockviewReadyEvent,
  IDockviewPanelProps,
  DockviewApi,
  SerializedDockview,
  Orientation,
  themeAbyss,
  themeLight,
} from 'dockview-react';
import 'dockview-react/dist/styles/dockview.css';
import { useResolvedTheme } from '../../hooks/useTheme';

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
import { Trans, useTranslation } from 'react-i18next';

// ─── Tab types ──────────────────────────────────────────────────────────────

type CompanionTab = 'store' | 'dronebridge' | 'dashboard';

const TAB_ITEMS: Array<{ id: CompanionTab; labelKey: string; icon: string }> = [
  { id: 'store', labelKey: 'companion:dashboard.tabTemplates', icon: 'M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4' },
  { id: 'dronebridge', labelKey: 'companion:dashboard.tabDroneBridge', icon: 'M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0' },
  { id: 'dashboard', labelKey: 'companion:dashboard.tabDashboard', icon: 'M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z' },
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

const DRONEBRIDGE_MODE_KEYS: Record<number, string> = {
  1: 'companion:dashboard.modeAp',
  2: 'companion:dashboard.modeStation',
  3: 'companion:dashboard.modeLongRange',
  4: 'companion:dashboard.modeEspNowAir',
  5: 'companion:dashboard.modeEspNowGround',
};

// ─── Preset layouts ─────────────────────────────────────────────────────────

const COMPANION_AUTOSAVE_NAME = '__companion_autosave';

const PRESET_LAYOUTS = {
  overview: 'companion:dashboard.presetOverview',
  debug: 'companion:dashboard.presetDebug',
  manage: 'companion:dashboard.presetManage',
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
    status: { id: 'status', contentComponent: 'CompanionStatusPanel' },
    metrics: { id: 'metrics', contentComponent: 'CompanionMetricsPanel' },
    network: { id: 'network', contentComponent: 'CompanionNetworkPanel' },
    containers: { id: 'containers', contentComponent: 'CompanionContainersPanel' },
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
    terminal: { id: 'terminal', contentComponent: 'CompanionTerminalPanel' },
    logs: { id: 'logs', contentComponent: 'CompanionLogsPanel' },
    processes: { id: 'processes', contentComponent: 'CompanionProcessesPanel' },
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
    containers: { id: 'containers', contentComponent: 'CompanionContainersPanel' },
    services: { id: 'services', contentComponent: 'CompanionServicesPanel' },
    fileBrowser: { id: 'fileBrowser', contentComponent: 'CompanionFileBrowserPanel' },
    extensions: { id: 'extensions', contentComponent: 'CompanionExtensionsPanel' },
  },
  activeGroup: '1',
};

/** Panel ids are registry keys, optionally suffixed with "-<timestamp>" for added panels. */
function localizePanelTitles(api: DockviewApi, t: TFunction): void {
  for (const panel of api.panels) {
    const entry = COMPANION_PANEL_COMPONENTS[panel.id.split('-')[0] as CompanionPanelId];
    if (entry) panel.api.setTitle(t(entry.titleKey));
  }
}

function loadPresetLayout(api: DockviewApi, preset: PresetLayoutKey, t: TFunction): void {
  switch (preset) {
    case 'overview': api.fromJSON(OVERVIEW_LAYOUT); break;
    case 'debug': api.fromJSON(DEBUG_LAYOUT); break;
    case 'manage': api.fromJSON(MANAGE_LAYOUT); break;
    default: api.fromJSON(OVERVIEW_LAYOUT); break;
  }
  localizePanelTitles(api, t);
}

// ─── Tab bar ────────────────────────────────────────────────────────────────

function CompanionTabBar({ activeTab, onTabChange }: { activeTab: CompanionTab; onTabChange: (tab: CompanionTab) => void }) {
  const { t } = useTranslation();
  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 bg-surface border-b border-subtle">
      {TAB_ITEMS.map(({ id, labelKey, icon }) => (
        <button
          key={id}
          onClick={() => onTabChange(id)}
          className={`px-3 py-1.5 text-xs rounded transition-colors flex items-center gap-1.5 ${
            activeTab === id
              ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
              : 'text-content-secondary hover:text-content hover:bg-surface-raised'
          }`}
        >
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d={icon} />
          </svg>
          {t(labelKey)}
        </button>
      ))}
    </div>
  );
}

// ─── DroneBridge tab ────────────────────────────────────────────────────────

function DroneBridgeTab() {
  const { t } = useTranslation();
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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-subtle">
            <svg className="w-7 h-7 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.111 16.404a5.5 5.5 0 017.778 0M12 20h.01m-7.08-7.071c3.904-3.905 10.236-3.905 14.141 0M1.394 9.393c5.857-5.858 15.355-5.858 21.213 0" />
            </svg>
          </div>
          <h3 className="text-sm font-medium text-content">
            {autoProbing ? t('companion:dashboard.scanning') : t('companion:dashboard.noDroneBridge')}
          </h3>
          {autoProbing ? (
            <div className="flex items-center justify-center gap-2 text-xs text-content-secondary">
              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
              </svg>
              {t('companion:dashboard.trying', { ip: '192.168.2.1' })}
            </div>
          ) : (
            <p className="text-xs text-content-secondary">
              {t('companion:dashboard.connectHint')}
            </p>
          )}
          {!autoProbing && (
            <div className="space-y-3">
              <DroneBridgeUsbReader />
              <div className="flex items-center gap-3">
                <div className="flex-1 h-px bg-surface-raised" />
                <span className="text-[10px] text-content-tertiary">{t('companion:dashboard.orWifi')}</span>
                <div className="flex-1 h-px bg-surface-raised" />
              </div>
              <DroneBridgeManualProbe />
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full grid grid-cols-2 gap-0 divide-x divide-subtle/30">
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
  const { t } = useTranslation();
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
        setResult({ ssid: null, apIp: null, settings: null, error: t('companion:dashboard.noData') });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setResult({ ssid: null, apIp: null, settings: null, error: t('companion:dashboard.readSerialFailed', { error: msg }) });
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
        <div className="bg-surface border border-subtle rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
            <span className="text-sm font-medium text-emerald-400">{t('companion:dashboard.deviceFound')}</span>
          </div>

          <div className="space-y-1.5">
            {result.ssid && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('companion:dashboard.wifiSsid')}</span>
                <span className="text-content font-mono">{result.ssid}</span>
              </div>
            )}
            {s['wifi_pass'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:password')}</span>
                <span className="text-content font-mono">{String(s['wifi_pass'])}</span>
              </div>
            )}
            {result.apIp && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('companion:dashboard.apIp')}</span>
                <span className="text-content font-mono">{result.apIp}</span>
              </div>
            )}
            {s['esp32_mode'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:mode')}</span>
                <span className="text-content">{
                  DRONEBRIDGE_MODE_KEYS[Number(s['esp32_mode'])] ? t(DRONEBRIDGE_MODE_KEYS[Number(s['esp32_mode'])]!) : t('companion:dashboard.modeN', { mode: String(s['esp32_mode']) })
                }</span>
              </div>
            )}
            {s['baud'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:baudRate')}</span>
                <span className="text-content font-mono">{String(s['baud'])}</span>
              </div>
            )}
            {s['proto'] != null && (
              <div className="flex justify-between text-xs">
                <span className="text-content-secondary">{t('common:protocol')}</span>
                <span className="text-content">{
                  ({ 0: 'MSP / LTM', 1: 'MAVLink', 2: t('companion:dashboard.protoTransparent') } as Record<number, string>)[Number(s['proto'])] ?? t('companion:dashboard.protoN', { proto: String(s['proto']) })
                }</span>
              </div>
            )}
          </div>
        </div>

        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 space-y-2">
          <p className="text-[11px] text-blue-300">
            <Trans
              i18nKey="companion:dashboard.goLiveHint"
              values={{ ssid: result.ssid ?? 'DroneBridge' }}
              components={{ ssid: <span className="font-mono font-medium" /> }}
            />
          </p>
          <button
            onClick={handleGoLive}
            className="w-full py-2 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs font-medium rounded-lg transition-colors"
          >
            {t('companion:dashboard.goLive')}
          </button>
        </div>

        <button
          onClick={() => setResult(null)}
          className="w-full text-[10px] text-content-tertiary hover:text-content-secondary transition-colors"
        >
          {t('common:back')}
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
          className="flex-1 bg-surface-input border border-subtle rounded-lg px-3 py-2 text-xs text-content focus:outline-none focus:ring-1 focus:ring-blue-500/50 disabled:opacity-50"
        >
          <option value="">{t('companion:dashboard.selectUsbPort')}</option>
          {ports.map((port) => (
            <option key={port} value={port}>{port}</option>
          ))}
        </select>
        <button
          onClick={handleRefresh}
          disabled={reading}
          className="px-2 py-2 bg-surface-raised hover:bg-surface-raised disabled:opacity-40 text-content rounded-lg transition-colors"
          title={t('companion:dashboard.refreshPorts')}
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>
      </div>
      <button
        onClick={handleRead}
        disabled={!selectedPort || reading}
        className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-amber-600/80 hover:bg-amber-500/80 disabled:bg-surface-raised disabled:text-content-tertiary text-white text-xs font-medium rounded-lg transition-colors"
      >
        {reading ? (
          <>
            <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
            {t('companion:dashboard.readingUsb')}
          </>
        ) : (
          <>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 10v6m0 0l-3-3m3 3l3-3M6 5h12a2 2 0 012 2v10a2 2 0 01-2 2H6a2 2 0 01-2-2V7a2 2 0 012-2z" />
            </svg>
            {t('companion:dashboard.readUsb')}
          </>
        )}
      </button>
      {reading && (
        <p className="text-[10px] text-content-tertiary text-center">
          {t('companion:dashboard.resetting')}
        </p>
      )}
      {result?.error && (
        <div className="text-[10px] text-red-400">{result.error}</div>
      )}
    </div>
  );
}

function DroneBridgeManualProbe() {
  const { t } = useTranslation();
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
        className="flex-1 bg-surface-input border border-subtle rounded-lg px-3 py-2 text-xs text-content font-mono placeholder-content-tertiary focus:outline-none focus:ring-1 focus:ring-blue-500/50"
        onKeyDown={(e) => { if (e.key === 'Enter') handleProbe(); }}
      />
      <button
        onClick={handleProbe}
        disabled={!ip.trim() || probing}
        className="px-3 py-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-40 text-white text-xs rounded-lg transition-colors"
      >
        {probing ? t('companion:dashboard.probing') : t('common:connect')}
      </button>
    </div>
  );
}

// ─── Dashboard tab ──────────────────────────────────────────────────────────

function DashboardTab() {
  const { t } = useTranslation();
  const resolvedTheme = useResolvedTheme();
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
        localizePanelTitles(event.api, t);
        setActiveLayout(COMPANION_AUTOSAVE_NAME);
        return;
      } catch { /* fall through */ }
    }
    loadPresetLayout(event.api, DEFAULT_PRESET, t);
    setActiveLayout(DEFAULT_PRESET);
    event.api.onDidLayoutChange(() => scheduleAutoSave());
  }, [allLayouts, scheduleAutoSave, t]);

  const handleLoadLayout = useCallback((name: string) => {
    if (!apiRef.current) return;
    if (isPresetLayout(name)) {
      loadPresetLayout(apiRef.current, name, t);
      setActiveLayout(name);
      scheduleAutoSave();
      return;
    }
    const savedData = allLayouts[`companion:${name}`]?.data;
    if (savedData) {
      try {
        apiRef.current.fromJSON(savedData as SerializedDockview);
        localizePanelTitles(apiRef.current, t);
        setActiveLayout(name);
        scheduleAutoSave();
      } catch { /* invalid layout */ }
    }
  }, [allLayouts, scheduleAutoSave, t]);

  const handleSaveLayout = useCallback((name: string) => {
    if (!apiRef.current) return;
    const data = apiRef.current.toJSON();
    saveLayout(`companion:${name}`, data);
    setActiveLayout(name);
  }, [saveLayout]);

  const handleReset = useCallback(() => {
    if (!apiRef.current) return;
    loadPresetLayout(apiRef.current, DEFAULT_PRESET, t);
    setActiveLayout(DEFAULT_PRESET);
    scheduleAutoSave();
  }, [scheduleAutoSave, t]);

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
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-surface border border-subtle">
            <svg className="w-7 h-7 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-medium text-content">{t('companion:dashboard.agentNotConnected')}</h3>
            <p className="text-xs text-content-secondary mt-2 max-w-sm mx-auto">
              {t('companion:dashboard.agentHint')}
            </p>
          </div>

          <div className="bg-surface rounded-xl border border-subtle p-5 text-left space-y-4">
            <h4 className="text-xs font-medium text-content">{t('companion:dashboard.quickInstall')}</h4>
            <div className="bg-surface-input rounded-lg px-3 py-2 font-mono text-xs text-content-secondary select-all">
              {/* i18n-exempt: shell command */}
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
          theme={resolvedTheme === 'light' ? themeLight : themeAbyss}
        />
      </div>
    </div>
  );
}

function DashboardConnectForm() {
  const { t } = useTranslation();
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
      <h4 className="text-xs font-medium text-content">{t('companion:dashboard.connectAgent')}</h4>
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={host}
          onChange={(e) => setHost(e.target.value)}
          placeholder="192.168.1.100"
          className="bg-surface-input border border-subtle rounded-lg px-3 py-2 text-xs text-content placeholder-content-tertiary focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
        />
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder={t('companion:dashboard.pairingToken')}
          className="bg-surface-input border border-subtle rounded-lg px-3 py-2 text-xs text-content placeholder-content-tertiary focus:outline-none focus:ring-1 focus:ring-blue-500/50"
          onKeyDown={(e) => { if (e.key === 'Enter') handleConnect(); }}
        />
      </div>
      <button
        onClick={handleConnect}
        disabled={connecting || !host.trim() || !token.trim()}
        className="w-full py-2 bg-blue-600/80 hover:bg-blue-500/80 disabled:bg-surface-raised disabled:text-content-tertiary text-white text-xs font-medium rounded-lg transition-colors"
      >
        {connecting ? t('common:connecting') : t('common:connect')}
      </button>
    </div>
  );
}

// ─── Status bar (shown in dashboard tab when connected) ─────────────────────

function CompanionStatusBar() {
  const connectionState = useCompanionStore((s) => s.connectionState);
  const metrics = useCompanionStore((s) => s.metrics);
  const { t } = useTranslation();

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
    disconnected: 'text-content-secondary',
  };

  return (
    <div className="flex items-center gap-4 px-3 py-1 bg-surface border-b border-subtle text-xs">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${stateDots[connectionState.state] ?? 'bg-gray-600'}`} />
        <span className={stateColors[connectionState.state] ?? 'text-content-secondary'}>
          {connectionState.state === 'connected' && connectionState.host
            ? connectionState.host
            : connectionState.state === 'reconnecting'
              ? t('companion:dashboard.reconnecting', { attempt: connectionState.reconnectAttempt })
              : t(`companion:dashboard.state.${connectionState.state}`, { defaultValue: connectionState.state })
          }
        </span>
      </div>
      {connectionState.state === 'connected' && connectionState.agentVersion && (
        <span className="text-content-tertiary">{t('companion:dashboard.agentVersion', { version: connectionState.agentVersion })}</span>
      )}
      {connectionState.versionMismatch && (
        <span className="text-yellow-500">{t('companion:dashboard.versionMismatch')}</span>
      )}
      {metrics && (
        <>
          <span className="text-content-tertiary">|</span>
          <span className="text-content-secondary">CPU {metrics.cpu.toFixed(0)}%</span>
          <span className="text-content-secondary">RAM {metrics.ram.toFixed(0)}%</span>
          {metrics.temp > 0 && (
            <span className={metrics.temp > 80 ? 'text-red-400' : 'text-content-secondary'}>
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
  const { t } = useTranslation();
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
    <div className="flex items-center gap-2 px-3 py-1.5 bg-surface border-b border-subtle">
      <span className="text-xs text-content-secondary">{t('companion:dashboard.layout')}</span>
      <select
        value={activeLayout}
        onChange={(e) => onLoad(e.target.value)}
        className="bg-surface-raised border border rounded px-2 py-1 text-xs text-content focus:outline-none focus:ring-1 focus:ring-blue-500/50"
      >
        <optgroup label={t('common:presets')}>
          {Object.entries(PRESET_LAYOUTS).map(([key, nameKey]) => (
            <option key={key} value={key}>{t(nameKey)}</option>
          ))}
        </optgroup>
        {layouts.length > 0 && (
          <optgroup label={t('common:saved')}>
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
            placeholder={t('common:layoutName')}
            className="bg-surface-raised border border rounded px-2 py-1 text-xs text-content w-32 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setShowSaveDialog(false);
            }}
          />
          <button onClick={handleSave} className="px-2 py-1 bg-blue-600/80 hover:bg-blue-500/80 text-white text-xs rounded transition-colors">{t('common:save')}</button>
          <button onClick={() => setShowSaveDialog(false)} className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors">{t('common:cancel')}</button>
        </div>
      ) : (
        <>
          <button onClick={() => setShowSaveDialog(true)} className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors">{t('companion:dashboard.saveAs')}</button>
          <button onClick={onReset} className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors">{t('common:reset')}</button>
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
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-2 py-1 bg-surface-raised hover:bg-surface-raised text-content text-xs rounded transition-colors flex items-center gap-1"
      >
        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
        </svg>
        {t('companion:dashboard.addPanel')}
      </button>

      {isOpen && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setIsOpen(false)} />
          <div className="absolute right-0 top-full mt-1 bg-surface-solid border border-subtle rounded-lg shadow-xl z-20 py-1 min-w-[150px]">
            {Object.entries(COMPANION_PANEL_COMPONENTS).map(([id, { component, titleKey }]) => (
              <button
                key={id}
                onClick={() => { onAddPanel(id, component, t(titleKey)); setIsOpen(false); }}
                className="w-full px-3 py-1.5 text-left text-xs text-content hover:bg-surface-raised transition-colors"
              >
                {t(titleKey)}
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
    <div className="h-full flex flex-col bg-surface-input">
      <CompanionTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <div className="flex-1 overflow-hidden">
        {activeTab === 'store' && <CompanionStoreTab onFlashComplete={handleFlashComplete} />}
        {activeTab === 'dronebridge' && <DroneBridgeTab />}
        {activeTab === 'dashboard' && <DashboardTab />}
      </div>
    </div>
  );
}
