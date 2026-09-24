/**
 * Backup state for surfaces the vault covers (parameters, missions, areas),
 * and the actions that belong with it. Planning a mission should not have to
 * detour through another screen to copy the work online.
 */
import { CloudCheck, CloudOff, RefreshCw, Settings2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useFleetRepoStore } from '../../stores/fleet-repo-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useCargoEnabled, VAULT_CARGO_SLUG } from '../../modules/capabilities';

function timeAgo(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

interface VaultSyncBadgeProps {
  /**
   * 'icon' = compact toolbar chip (mission toolbar, area editor).
   * 'button' = full-size labelled button matching header action rows
   * (parameters header next to Refresh/Reboot).
   */
  variant?: 'icon' | 'button';
}

export function VaultSyncBadge({ variant = 'icon' }: VaultSyncBadgeProps) {
  const status = useFleetRepoStore((s) => s.status);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const sync = useFleetRepoStore((s) => s.sync);
  const syncBusy = useFleetRepoStore((s) => s.syncBusy);
  const lastError = useFleetRepoStore((s) => s.lastError);
  const setView = useNavigationStore((s) => s.setView);
  const vaultEnabled = useCargoEnabled(VAULT_CARGO_SLUG);

  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (vaultEnabled && !status) refresh();
  }, [vaultEnabled, status, refresh]);

  if (!vaultEnabled) return null;

  const connected = (status?.github.connected ?? false) && Boolean(status?.github.repo);
  const lastSyncAt = status?.github.lastSyncAt;

  const tip = connected
    ? lastSyncAt
      ? `Backup is on. Last copied online ${timeAgo(lastSyncAt)}.`
      : 'Backup is on, but nothing has been copied online yet.'
    : 'Backup is off: your saves stay on this computer only.';

  const openVault = () => {
    setOpen(false);
    setView('vault');
    window.electronAPI?.navOpenView?.('vault');
  };

  const toggle = () => {
    if (!open) {
      const r = btnRef.current?.getBoundingClientRect();
      if (r) setPos({ top: r.bottom + 6, right: window.innerWidth - r.right });
    }
    setOpen((v) => !v);
  };

  const Icon = connected ? CloudCheck : CloudOff;

  return (
    <>
      {variant === 'button' ? (
        <button
          ref={btnRef}
          onClick={toggle}
          data-tip={tip}
          className="px-4 py-2 text-sm rounded-lg flex items-center gap-2 bg-surface-raised hover:bg-surface text-content border border-subtle"
        >
          <Icon className={`w-4 h-4 ${connected ? 'text-emerald-600 dark:text-emerald-400' : 'text-content-secondary'}`} />
          {connected ? 'Backup on' : 'Set up backup'}
        </button>
      ) : (
        <button
          ref={btnRef}
          onClick={toggle}
          data-tip={tip}
          className={`h-7 px-2 rounded-lg flex items-center gap-1.5 text-[11px] font-medium transition-colors ${
            connected
              ? 'text-emerald-600 dark:text-emerald-400 hover:bg-surface-raised'
              : 'text-content-secondary hover:text-content hover:bg-surface-raised'
          }`}
        >
          <Icon className={`w-4 h-4 ${syncBusy ? 'animate-pulse' : ''}`} />
          Backup
        </button>
      )}

      {open && pos && createPortal(
        <>
          <div className="fixed inset-0 z-[9998]" onClick={() => setOpen(false)} />
          <div
            className="fixed z-[9999] w-[260px] bg-surface-solid border border-default rounded-lg shadow-2xl py-1"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="px-3 py-2 border-b border-subtle">
              <div className="text-xs font-medium text-content">
                {connected ? 'Backup is on' : 'Backup is off'}
              </div>
              <div className="text-[11px] text-content-secondary mt-0.5">
                {connected
                  ? lastSyncAt
                    ? `Last copied online ${timeAgo(lastSyncAt)}.`
                    : 'Nothing has been copied online yet.'
                  : 'Saves stay on this computer until you set it up.'}
              </div>
              {lastError && <div className="text-[11px] text-red-500 mt-1">{lastError}</div>}
            </div>

            {connected && (
              <button
                onClick={() => { void sync(); }}
                disabled={syncBusy}
                className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-content hover:bg-surface-raised transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${syncBusy ? 'animate-spin' : ''}`} />
                {syncBusy ? 'Copying online...' : 'Copy online now'}
              </button>
            )}

            <button
              onClick={openVault}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs text-content hover:bg-surface-raised transition-colors"
            >
              <Settings2 className="w-3.5 h-3.5" />
              {connected ? 'Open Backup & Sync' : 'Set up backup'}
            </button>
          </div>
        </>,
        document.body,
      )}
    </>
  );
}
