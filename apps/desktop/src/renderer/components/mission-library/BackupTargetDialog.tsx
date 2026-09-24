/**
 * Ask which project a copy belongs to before it goes into the backup, and say
 * plainly what that does. Shared by missions and survey areas.
 */

import { useEffect, useState } from 'react';
import { CloudCheck, CloudOff } from 'lucide-react';
import { useFleetRepoStore } from '../../stores/fleet-repo-store';
import { useNavigationStore } from '../../stores/navigation-store';

export function BackupTargetDialog({
  title, itemName, kind, sites, initialSite, onCancel, onConfirm,
}: {
  title: string;
  itemName: string;
  kind: 'mission' | 'survey area';
  sites: string[];
  initialSite?: string;
  onCancel: () => void;
  onConfirm: (site: string) => Promise<void>;
}) {
  const status = useFleetRepoStore((s) => s.status);
  const refresh = useFleetRepoStore((s) => s.refresh);
  const setView = useNavigationStore((s) => s.setView);
  const [site, setSite] = useState(initialSite ?? '');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!status) refresh();
  }, [status, refresh]);

  const backupOn = (status?.github.connected ?? false) && Boolean(status?.github.repo);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50" onClick={onCancel}>
      <div
        className="bg-surface-solid rounded-xl border border-subtle w-full max-w-sm mx-4 p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h2 className="text-base font-semibold text-content">{title}</h2>
          <p className="mt-1 text-xs text-content-secondary">
            Keeps a copy of this {kind} with your other saves, filed under a project, with every earlier version
            still there to go back to.
          </p>
        </div>

        <div>
          <label className="block text-xs font-medium text-content mb-1">Project</label>
          <input
            type="text"
            value={site}
            autoFocus
            onChange={(e) => setSite(e.target.value)}
            placeholder="North farm"
            list="backup-project-suggestions"
            className="w-full px-3 py-2 bg-surface-input border border-subtle rounded-lg text-content placeholder-content-tertiary text-sm focus:outline-none focus:border-blue-500/50"
          />
          <datalist id="backup-project-suggestions">
            {sites.map((s) => <option key={s} value={s} />)}
          </datalist>
          <p className="mt-1 text-[11px] text-content-tertiary">
            The job or site this belongs to. Everything filed under the same name opens together.
          </p>
        </div>

        <div className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
          backupOn
            ? 'border-emerald-500/40 bg-emerald-500/10'
            : 'border-amber-500/40 bg-amber-500/10'
        }`}>
          {backupOn
            ? <CloudCheck className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
            : <CloudOff className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />}
          <div className="text-[11px] leading-snug">
            {backupOn ? (
              <span className="text-content-secondary">
                Online backup is on, so this reaches your other computers as well.
              </span>
            ) : (
              <>
                <span className="text-content-secondary">
                  Online backup is off, so this copy stays on this computer.
                </span>
                <button
                  onClick={() => { setView('vault'); onCancel(); }}
                  className="ml-1 underline text-amber-700 dark:text-amber-300"
                >
                  Set up backup
                </button>
              </>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-surface-raised text-content hover:brightness-125 transition-colors"
          >
            Cancel
          </button>
          <button
            disabled={!site.trim() || busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(site.trim());
              setBusy(false);
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
          >
            {busy ? 'Saving...' : 'Save copy'}
          </button>
        </div>

        <p className="text-[10px] text-content-tertiary">{itemName}</p>
      </div>
    </div>
  );
}
