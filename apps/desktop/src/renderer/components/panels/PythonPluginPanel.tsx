import { useEffect, useMemo, useState } from 'react';
import type { IDockviewPanelProps } from 'dockview-react';
import { Loader2, AlertTriangle } from 'lucide-react';
import { usePythonPlugin } from '../../hooks/use-python-plugin';

/**
 * Generic dockview panel that hosts a Python plugin's UI surface.
 *
 * Today the panel renders a structured "control surface" view: status,
 * recent log lines, and the latest payload of every distinct event the
 * plugin has emitted since the panel was opened. This gives plugin
 * authors a usable display target without forcing them to ship custom
 * React components — a richer renderer SDK can come later.
 *
 * The plugin slug is provided through dockview's `params.slug`; if the
 * panel is added without it, we render an explanatory error instead of
 * crashing.
 */
export function PythonPluginPanel(props: IDockviewPanelProps): JSX.Element {
  const slug = typeof props.params?.['slug'] === 'string' ? (props.params['slug'] as string) : null;

  if (!slug) {
    return (
      <div className="h-full flex items-center justify-center text-content-secondary text-sm p-4 text-center">
        <div className="flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-amber-400" />
          PythonPluginPanel was opened without a `slug` parameter.
        </div>
      </div>
    );
  }

  return <PluginContent slug={slug} />;
}

function PluginContent({ slug }: { slug: string }): JSX.Element {
  const plugin = usePythonPlugin(slug);
  const [events, setEvents] = useState<Record<string, { payload: unknown; ts: number }>>({});

  useEffect(() => {
    // We don't know event names ahead of time — subscribe via a wildcard
    // by hooking into `window.electronAPI.onPythonPluginEvent` directly.
    const off = window.electronAPI.onPythonPluginEvent((evt) => {
      if (evt.slug !== slug) return;
      setEvents((prev) => ({ ...prev, [evt.event]: { payload: evt.payload, ts: evt.timestamp } }));
    });
    return () => {
      off();
    };
  }, [slug]);

  const recentLogs = useMemo(() => plugin.logs.slice(-30), [plugin.logs]);

  return (
    <div className="h-full flex flex-col bg-surface-base">
      <div className="px-3 py-2 border-b border-subtle text-xs flex items-center gap-2">
        <StatusDot status={plugin.status} />
        <span className="font-mono text-content-secondary">{slug}</span>
        {plugin.pid ? (
          <span className="text-content-tertiary ml-auto">PID {plugin.pid}</span>
        ) : null}
      </div>

      <div className="flex-1 grid grid-cols-1 xl:grid-cols-2 gap-3 p-3 overflow-auto">
        <section>
          <header className="text-[11px] uppercase tracking-wider text-content-tertiary mb-2">
            Events
          </header>
          {Object.keys(events).length === 0 ? (
            <div className="text-xs text-content-tertiary">
              No events received yet. The plugin can emit events with{' '}
              <code className="font-mono">emit("name", payload)</code>.
            </div>
          ) : (
            <ul className="space-y-2">
              {Object.entries(events)
                .sort(([, a], [, b]) => b.ts - a.ts)
                .map(([name, { payload, ts }]) => (
                  <li key={name} className="bg-surface-input rounded-md p-2">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-content">{name}</span>
                      <span className="text-content-tertiary">{new Date(ts).toLocaleTimeString()}</span>
                    </div>
                    <pre className="mt-1 text-[11px] text-content-secondary whitespace-pre-wrap break-all">
{safeStringify(payload)}
                    </pre>
                  </li>
                ))}
            </ul>
          )}
        </section>

        <section>
          <header className="text-[11px] uppercase tracking-wider text-content-tertiary mb-2">
            Output (last 30)
          </header>
          {recentLogs.length === 0 ? (
            <div className="text-xs text-content-tertiary">No log output yet.</div>
          ) : (
            <pre className="font-mono text-[11px] bg-black/30 rounded-md p-2 max-h-full overflow-auto">
              {recentLogs
                .map((line) => `${new Date(line.timestamp).toLocaleTimeString()}  ${line.message}`)
                .join('\n')}
            </pre>
          )}
        </section>
      </div>

      {plugin.status === 'starting' && (
        <div className="px-3 py-2 border-t border-subtle text-xs text-content-secondary flex items-center gap-2">
          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Starting sidecar…
        </div>
      )}
      {plugin.error && (
        <div className="px-3 py-2 border-t border-rose-500/30 bg-rose-500/10 text-xs text-rose-300">
          {plugin.error}
        </div>
      )}
    </div>
  );
}

function StatusDot({ status }: { status: ReturnType<typeof usePythonPlugin>['status'] }): JSX.Element {
  const cls =
    status === 'running'
      ? 'bg-emerald-500'
      : status === 'starting' || status === 'installing' || status === 'creating-venv'
      ? 'bg-amber-400'
      : status === 'error'
      ? 'bg-rose-500'
      : 'bg-content-tertiary';
  return <span className={`w-2 h-2 rounded-full ${cls}`} aria-hidden />;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
