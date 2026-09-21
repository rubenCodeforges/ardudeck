import { useEffect } from 'react';
import { Download, Loader2, MonitorDown, RefreshCw, Trash2 } from 'lucide-react';
import { useAppStore } from '../../stores/app-store';
import { HangarAppCard } from './HangarAppCard';

/**
 * Hangar APPS in the Cargo Bay.
 *
 * Its own section rather than another row in the cargo list, because the two are not the same
 * kind of thing and every control differs: an app has no licence, no enable toggle, nothing that
 * needs a restart, and it can already be present on the machine without the Hangar having put
 * it there.
 */
export function HangarApps({ mode }: { mode: 'browse' | 'installed' }) {
  const { catalog, installed, loading, installing, progress, fetchCatalog, fetchInstalled, install, uninstall } =
    useAppStore();

  useEffect(() => {
    fetchInstalled();
    if (mode === 'browse') fetchCatalog();
  }, [mode, fetchCatalog, fetchInstalled]);

  useEffect(() => {
    // Wrapped, because the unsubscribe returns the IpcRenderer and React would treat a
    // non-void return from an effect as its destructor.
    const off = window.electronAPI.onAppProgress((p) => useAppStore.getState().setProgress(p));
    return () => { off(); };
  }, []);

  const rows = mode === 'browse'
    ? catalog.filter((a) => !installed.some((i) => i.slug === a.slug))
    : [];

  if (mode === 'installed') {
    if (installed.length === 0) return null;
    return (
      <div className="space-y-3">
        <SectionHeader label="Installed apps" count={installed.length} />
        {installed.map((a) => (
          <div key={a.slug} className="card">
            <div className="card-body flex items-center gap-4 py-3">
              <MonitorDown className="w-5 h-5 text-sky-400 shrink-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-medium text-content truncate">{a.name}</h3>
                <p className="text-xs text-content-secondary mt-0.5 truncate">
                  {a.version} · {a.platform}
                </p>
              </div>
              <button
                onClick={() => uninstall(a.slug)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-content-secondary hover:text-red-400 bg-surface-raised border border-subtle rounded-lg transition-colors shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (!loading && rows.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <SectionHeader label="Apps" count={rows.length} />
        <button
          onClick={() => fetchCatalog()}
          disabled={loading}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-content-secondary hover:text-content bg-surface-raised border border-subtle rounded-lg transition-colors disabled:opacity-60 shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {rows.map((a) => (
        <HangarAppCard
          key={a.slug}
          app={a}
          installing={installing === a.slug}
          progress={
            installing === a.slug && progress
              ? `${progress.message}${progress.percent !== undefined ? ` ${progress.percent}%` : ''}`
              : null
          }
          onInstall={() => install(a.slug)}
        />
      ))}
    </div>
  );
}

function SectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="w-1.5 h-5 bg-sky-500 rounded-full shrink-0" />
      <h2 className="text-sm font-medium text-content uppercase tracking-wider">{label}</h2>
      {count > 0 && <span className="text-xs text-content-tertiary">{count}</span>}
    </div>
  );
}
