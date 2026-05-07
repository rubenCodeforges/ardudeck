import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Folder, Play, Square, Trash2, RefreshCw, FolderPlus, Terminal, LayoutPanelTop } from 'lucide-react';
import type {
  PythonDetectResult,
  PythonInterpreterInfo,
  PythonPluginDescriptor,
  PythonPluginInstallProgress,
  PythonPluginLogEvent,
  PythonPluginStatus,
  PythonPluginStatusEvent,
} from '../../../../shared/python-plugin-types';
import { useTelemetryLayoutStore } from '../../../stores/telemetry-layout-store';

const STATUS_LABELS: Record<PythonPluginStatus, string> = {
  discovered: 'Not installed',
  'creating-venv': 'Creating venv…',
  installing: 'Installing deps…',
  ready: 'Ready',
  starting: 'Starting…',
  running: 'Running',
  stopped: 'Stopped',
  error: 'Error',
};

const STATUS_COLORS: Record<PythonPluginStatus, string> = {
  discovered: 'bg-surface-input text-content-secondary',
  'creating-venv': 'bg-blue-600/20 text-blue-400',
  installing: 'bg-blue-600/20 text-blue-400',
  ready: 'bg-emerald-600/20 text-emerald-400',
  starting: 'bg-amber-600/20 text-amber-400',
  running: 'bg-emerald-600/30 text-emerald-300',
  stopped: 'bg-surface-input text-content-secondary',
  error: 'bg-rose-600/20 text-rose-400',
};

const MAX_LOG_LINES = 1000;

interface LogBuffer {
  bySlug: Record<string, PythonPluginLogEvent[]>;
}

export function PythonPluginsView() {
  const [interpreter, setInterpreter] = useState<PythonInterpreterInfo | null>(null);
  const [interpreterError, setInterpreterError] = useState<string | null>(null);
  const [detectingPython, setDetectingPython] = useState(false);
  const [plugins, setPlugins] = useState<PythonPluginDescriptor[]>([]);
  const [activeSlug, setActiveSlug] = useState<string | null>(null);
  const [logs, setLogs] = useState<LogBuffer>({ bySlug: {} });
  const [installing, setInstalling] = useState(false);
  const logScrollRef = useRef<HTMLDivElement | null>(null);

  const refreshPlugins = useCallback(async () => {
    const list = await window.electronAPI.pythonPluginRefresh();
    setPlugins(list);
    setActiveSlug((prev) => prev ?? list[0]?.slug ?? null);
  }, []);

  const detectInterpreter = useCallback(async () => {
    setDetectingPython(true);
    setInterpreterError(null);
    try {
      const result: PythonDetectResult = await window.electronAPI.pythonDetect();
      if (result.ok) {
        setInterpreter(result.interpreter);
      } else {
        setInterpreter(null);
        setInterpreterError(result.error);
      }
    } finally {
      setDetectingPython(false);
    }
  }, []);

  useEffect(() => {
    detectInterpreter();
    refreshPlugins().catch(() => undefined);
  }, [detectInterpreter, refreshPlugins]);

  useEffect(() => {
    const offStatus = window.electronAPI.onPythonPluginStatus(
      (event: PythonPluginStatusEvent) => {
        setPlugins((prev) =>
          prev.map((p) =>
            p.slug === event.slug
              ? { ...p, status: event.status, pid: event.pid, error: event.error }
              : p,
          ),
        );
      },
    );

    const offLog = window.electronAPI.onPythonPluginLog((event: PythonPluginLogEvent) => {
      setLogs((prev) => {
        const buf = prev.bySlug[event.slug] ?? [];
        const next = buf.length >= MAX_LOG_LINES ? buf.slice(buf.length - MAX_LOG_LINES + 1) : buf.slice();
        next.push(event);
        return { bySlug: { ...prev.bySlug, [event.slug]: next } };
      });
    });

    const offProgress = window.electronAPI.onPythonPluginInstallProgress(
      (event: PythonPluginInstallProgress) => {
        if (event.line) {
          setLogs((prev) => {
            const buf = prev.bySlug[event.slug] ?? [];
            const next = buf.length >= MAX_LOG_LINES ? buf.slice(buf.length - MAX_LOG_LINES + 1) : buf.slice();
            next.push({
              slug: event.slug,
              level: 'info',
              message: event.line ?? '',
              timestamp: Date.now(),
            });
            return { bySlug: { ...prev.bySlug, [event.slug]: next } };
          });
        }
        if (event.finished) {
          // Status events drive the badge transitions; just ensure list is fresh.
          refreshPlugins().catch(() => undefined);
        }
      },
    );

    return () => {
      offStatus();
      offLog();
      offProgress();
    };
  }, [refreshPlugins]);

  // Auto-scroll log panel as new lines arrive.
  useEffect(() => {
    const el = logScrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logs, activeSlug]);

  const handleInstall = useCallback(async () => {
    setInstalling(true);
    try {
      const response = await window.electronAPI.pythonPluginInstall();
      if (response.ok) {
        setActiveSlug(response.slug);
        await refreshPlugins();
      } else if (response.error !== 'cancelled') {
        alert(`Install failed: ${response.error}`);
      }
    } finally {
      setInstalling(false);
    }
  }, [refreshPlugins]);

  const handleStart = useCallback(
    async (slug: string) => {
      const response = await window.electronAPI.pythonPluginStart(slug);
      console.log('response', response);
      if (!response.ok) {
        alert(`Start failed: ${response.error}`);
      }
      await refreshPlugins();
    },
    [refreshPlugins],
  );

  const handleStop = useCallback(
    async (slug: string) => {
      await window.electronAPI.pythonPluginStop(slug);
      await refreshPlugins();
    },
    [refreshPlugins],
  );

  const handleUninstall = useCallback(
    async (slug: string) => {
      if (!confirm(`Uninstall plugin "${slug}"? This deletes its venv and source.`)) return;
      await window.electronAPI.pythonPluginUninstall(slug);
      await refreshPlugins();
    },
    [refreshPlugins],
  );

  const activePlugin = useMemo(
    () => plugins.find((p) => p.slug === activeSlug) ?? null,
    [plugins, activeSlug],
  );
  const activeLogs = activeSlug ? logs.bySlug[activeSlug] ?? [] : [];

  return (
    <div className="space-y-6">
      <InterpreterCard
        interpreter={interpreter}
        error={interpreterError}
        detecting={detectingPython}
        onDetect={detectInterpreter}
        onOpenDir={() => window.electronAPI.pythonOpenDir()}
      />

      <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-sm font-medium text-content uppercase tracking-wider">Python Plugins</h3>
            <p className="text-xs text-content-secondary mt-1">
              Sidecar processes communicate with ArduDeck over JSON-RPC. Each plugin gets its own venv.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => refreshPlugins()}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg"
            >
              <RefreshCw className="w-3.5 h-3.5" /> Refresh
            </button>
            <button
              type="button"
              onClick={handleInstall}
              disabled={installing || !interpreter}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/80 hover:bg-blue-500/80 disabled:opacity-50 text-white rounded-lg"
              title={interpreter ? 'Install a plugin from a folder' : 'Install Python first'}
            >
              <FolderPlus className="w-3.5 h-3.5" />
              {installing ? 'Installing…' : 'Add plugin…'}
            </button>
          </div>
        </div>

        {plugins.length === 0 ? (
          <div className="text-sm text-content-secondary py-6 text-center">
            No Python plugins installed. Use "Add plugin…" to import one from a folder.
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
            <ul className="space-y-2">
              {plugins.map((plugin) => (
                <li key={plugin.slug}>
                  <button
                    type="button"
                    onClick={() => setActiveSlug(plugin.slug)}
                    className={`w-full text-left px-3 py-2 rounded-lg border transition-colors ${
                      activeSlug === plugin.slug
                        ? 'border-blue-500/60 bg-blue-500/10'
                        : 'border-subtle bg-surface-input hover:border-border'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-sm font-medium text-content truncate">{plugin.manifest.name}</div>
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded ${STATUS_COLORS[plugin.status]}`}
                      >
                        {STATUS_LABELS[plugin.status]}
                      </span>
                    </div>
                    <div className="text-xs text-content-tertiary mt-0.5">
                      {plugin.slug} · v{plugin.manifest.version}
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {activePlugin ? (
              <PluginDetail
                plugin={activePlugin}
                logs={activeLogs}
                logScrollRef={logScrollRef}
                onStart={() => handleStart(activePlugin.slug)}
                onStop={() => handleStop(activePlugin.slug)}
                onUninstall={() => handleUninstall(activePlugin.slug)}
                onClearLogs={() =>
                  setLogs((prev) => ({ bySlug: { ...prev.bySlug, [activePlugin.slug]: [] } }))
                }
              />
            ) : (
              <div className="text-sm text-content-secondary p-4">Select a plugin to see details.</div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function InterpreterCard({
  interpreter,
  error,
  detecting,
  onDetect,
  onOpenDir,
}: {
  interpreter: PythonInterpreterInfo | null;
  error: string | null;
  detecting: boolean;
  onDetect: () => void;
  onOpenDir: () => void;
}) {
  return (
    <section className="bg-gradient-to-br from-surface to-surface-base rounded-xl border border-subtle p-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-5 bg-content-secondary rounded-full" />
          <h2 className="text-sm font-medium text-content uppercase tracking-wider">Python Interpreter</h2>
        </div>
        <button
          type="button"
          onClick={onDetect}
          disabled={detecting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
          {detecting ? 'Detecting…' : 'Re-detect'}
        </button>
      </div>

      {interpreter ? (
        <div className="bg-surface-input rounded-lg p-4 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary uppercase">Version</span>
            <span className="text-sm font-mono text-content">{interpreter.version}</span>
            <span className="text-[10px] px-1.5 py-0.5 bg-emerald-600/20 text-emerald-400 rounded">
              {interpreter.source}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-content-tertiary uppercase">Path</span>
            <span className="text-sm font-mono text-content-secondary truncate">{interpreter.path}</span>
          </div>
          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={onOpenDir}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-secondary hover:text-content border border-border hover:border-border rounded-lg"
            >
              <Folder className="w-3.5 h-3.5" /> Open plugins folder
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-rose-900/20 border border-rose-500/40 rounded-lg p-4">
          <p className="text-sm text-rose-300">
            {error ?? 'No Python interpreter detected.'}
          </p>
          <p className="text-xs text-content-secondary mt-2">
            Install Python 3.10 or newer from python.org and ensure it is on PATH, or set
            the <code className="font-mono text-content-secondary">ARDUDECK_PYTHON</code> environment
            variable to a specific interpreter.
          </p>
        </div>
      )}
    </section>
  );
}

function PluginDetail({
  plugin,
  logs,
  logScrollRef,
  onStart,
  onStop,
  onUninstall,
  onClearLogs,
}: {
  plugin: PythonPluginDescriptor;
  logs: PythonPluginLogEvent[];
  logScrollRef: React.MutableRefObject<HTMLDivElement | null>;
  onStart: () => void;
  onStop: () => void;
  onUninstall: () => void;
  onClearLogs: () => void;
}) {
  const isRunning = plugin.status === 'running' || plugin.status === 'starting';
  const canStart = plugin.hasVenv && !isRunning && plugin.status !== 'creating-venv' && plugin.status !== 'installing';
  const layoutBridge = useTelemetryLayoutStore((state) => state.bridge);
  const canOpenPanel = !!plugin.manifest.ui?.panelId && !!layoutBridge;
  const handleOpenPanel = useCallback(() => {
    if (!plugin.manifest.ui || !layoutBridge) return;
    layoutBridge.openPythonPlugin(plugin.slug, plugin.manifest.ui.title);
  }, [plugin.manifest.ui, plugin.slug, layoutBridge]);

  return (
    <div className="space-y-4">
      <div className="bg-surface-input rounded-lg p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h4 className="text-base font-semibold text-content">{plugin.manifest.name}</h4>
            <p className="text-xs text-content-tertiary mt-0.5">
              {plugin.slug} · v{plugin.manifest.version}
              {plugin.manifest.author ? ` · ${plugin.manifest.author}` : ''}
            </p>
            {plugin.manifest.description ? (
              <p className="text-sm text-content-secondary mt-2">{plugin.manifest.description}</p>
            ) : null}
          </div>
          <span className={`text-[10px] px-2 py-0.5 rounded ${STATUS_COLORS[plugin.status]}`}>
            {STATUS_LABELS[plugin.status]}
          </span>
        </div>

        {plugin.error ? (
          <p className="text-xs text-rose-400 mt-3">{plugin.error}</p>
        ) : null}

        <div className="flex flex-wrap gap-2 mt-4">
          {canStart && (
            <button
              type="button"
              onClick={onStart}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-emerald-600/80 hover:bg-emerald-500/80 text-white rounded-lg"
            >
              <Play className="w-3.5 h-3.5" /> Start
            </button>
          )}
          {isRunning && (
            <button
              type="button"
              onClick={onStop}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-amber-600/80 hover:bg-amber-500/80 text-white rounded-lg"
            >
              <Square className="w-3.5 h-3.5" /> Stop
            </button>
          )}
          {canOpenPanel && (
            <button
              type="button"
              onClick={handleOpenPanel}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600/30 hover:bg-blue-600/60 text-blue-100 rounded-lg"
              title="Open the plugin's panel in the dashboard"
            >
              <LayoutPanelTop className="w-3.5 h-3.5" /> Open panel
            </button>
          )}
          <button
            type="button"
            onClick={onUninstall}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-rose-600/30 hover:bg-rose-600/60 text-rose-200 rounded-lg ml-auto"
          >
            <Trash2 className="w-3.5 h-3.5" /> Uninstall
          </button>
        </div>

        <dl className="grid grid-cols-2 gap-2 mt-4 text-xs">
          <dt className="text-content-tertiary">Install path</dt>
          <dd className="font-mono text-content-secondary truncate">{plugin.installPath}</dd>
          <dt className="text-content-tertiary">Has requirements.txt</dt>
          <dd className="text-content-secondary">{plugin.hasRequirements ? 'yes' : 'no'}</dd>
          <dt className="text-content-tertiary">Has venv</dt>
          <dd className="text-content-secondary">{plugin.hasVenv ? 'yes' : 'no'}</dd>
          {plugin.pid ? (
            <>
              <dt className="text-content-tertiary">PID</dt>
              <dd className="font-mono text-content-secondary">{plugin.pid}</dd>
            </>
          ) : null}
          {plugin.manifest.minPython ? (
            <>
              <dt className="text-content-tertiary">Min Python</dt>
              <dd className="text-content-secondary">{plugin.manifest.minPython}</dd>
            </>
          ) : null}
          {plugin.manifest.capabilities && plugin.manifest.capabilities.length > 0 ? (
            <>
              <dt className="text-content-tertiary">Capabilities</dt>
              <dd className="text-content-secondary">{plugin.manifest.capabilities.join(', ')}</dd>
            </>
          ) : null}
        </dl>
      </div>

      <div className="bg-black/30 rounded-lg border border-subtle">
        <div className="flex items-center justify-between px-3 py-2 border-b border-subtle">
          <div className="flex items-center gap-2 text-xs text-content-secondary">
            <Terminal className="w-3.5 h-3.5" />
            Output ({logs.length} lines)
          </div>
          <button
            type="button"
            onClick={onClearLogs}
            className="text-xs text-content-tertiary hover:text-content-secondary"
          >
            Clear
          </button>
        </div>
        <div
          ref={logScrollRef}
          className="font-mono text-[11px] leading-relaxed p-3 max-h-72 overflow-auto"
        >
          {logs.length === 0 ? (
            <div className="text-content-tertiary">No log lines yet.</div>
          ) : (
            logs.map((line, idx) => (
              <div
                key={`${line.timestamp}-${idx}`}
                className={
                  line.level === 'error'
                    ? 'text-rose-400'
                    : line.level === 'warn'
                    ? 'text-amber-400'
                    : 'text-content-secondary'
                }
              >
                {line.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
