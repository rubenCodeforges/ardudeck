/**
 * Saved survey areas: shape and generator settings, kept apart from any one
 * mission so the same field can be flown again next season, on another
 * machine, by whoever has the file.
 */

import { useEffect, useState } from 'react';
import { CloudUpload, Copy, Download, MapPin, Trash2, Upload } from 'lucide-react';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { useSurveyStore } from '../../stores/survey-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { formatAreaFromSquareMeters } from '../../../shared/user-units';
import { getSurveyGenerator } from '../survey/generator-registry';
import type { SurveyDocumentSummary } from '../../../shared/survey-document-types';
import { BackupTargetDialog } from './BackupTargetDialog';

export function SurveyAreaBrowser({ tabs }: { tabs: React.ReactNode }) {
  const {
    areas, isLoading, error, search, setSearch, loadAreas, getArea, deleteArea, duplicateArea,
    exportArea, importArea, vaultAreas, vaultSites, isVaultLoading, loadVault, pushToVault, pullFromVault,
  } = useSurveyAreaStore();
  const addSavedArea = useSurveyStore((s) => s.addSavedArea);
  const areaUnit = useSettingsStore((s) => s.unitPreferences.area);
  const setView = useNavigationStore((s) => s.setView);

  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [source, setSource] = useState<'local' | 'vault'>('local');
  const [pushTarget, setPushTarget] = useState<SurveyDocumentSummary | null>(null);

  useEffect(() => {
    void loadAreas();
    void loadVault();
  }, []);

  const handlePull = async (path: string) => {
    setBusyId(path);
    await pullFromVault(path);
    setBusyId(null);
  };

  const handleLoad = async (id: string) => {
    setBusyId(id);
    const doc = await getArea(id);
    if (doc) {
      const groupId = await addSavedArea(doc);
      if (groupId) setView('mission');
    }
    setBusyId(null);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-6 py-4 border-b border-subtle">
        <div className="flex items-center gap-4 flex-wrap">
          {tabs}

          <button
            onClick={() => void importArea()}
            className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:brightness-125 text-content rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Import Area
          </button>

          <div className="flex-1 max-w-sm">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search areas..."
              className="w-full px-3 py-1.5 bg-surface border border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
            />
          </div>

          <div className="flex items-center bg-surface border border-subtle rounded-lg overflow-hidden">
            {(['local', 'vault'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSource(s)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  source === s ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'
                }`}
              >
                {s === 'local' ? 'On this computer' : 'In backup'}
              </button>
            ))}
          </div>

          <span className="text-xs text-content-secondary">
            {source === 'local' ? `${areas.length} saved here` : `${vaultAreas.length} in backup`}
          </span>
        </div>
        {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
      </div>

      <div className="flex-1 overflow-auto p-6">
        {source === 'vault' ? (
          isVaultLoading ? (
            <div className="flex items-center justify-center h-48 text-content-secondary text-sm">Reading your backup...</div>
          ) : vaultAreas.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center">
              <div className="w-16 h-16 rounded-2xl bg-surface border border-subtle flex items-center justify-center mb-4">
                <MapPin className="w-7 h-7 text-content-tertiary" />
              </div>
              <h3 className="text-sm font-medium text-content mb-1">Nothing in your backup yet</h3>
              <p className="text-xs text-content-secondary max-w-sm">
                Save a copy of an area to your backup and it is filed under its project, with every earlier version
                kept. With online backup on, your other computers can open it too.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {groupBySite(vaultAreas).map(([site, items]) => (
                <div key={site}>
                  <div className="text-[10px] font-medium text-content-secondary uppercase tracking-wider mb-1.5">{site}</div>
                  <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                    {items.map((item) => {
                      const local = areas.find((a) => a.id === item.id);
                      return (
                        <div key={item.path} className="rounded-xl border border-subtle bg-surface p-3 flex flex-col gap-2">
                          <div className="text-sm font-medium text-content truncate">{item.name}</div>
                          <div className="text-[11px] text-content-secondary">
                            {generatorLabel(item.generatorId)} · version {item.revision}
                            {local && local.revision >= item.revision ? ' · already on this computer' : ''}
                          </div>
                          <div className="text-[11px] text-content-secondary tabular-nums">
                            {new Date(item.updatedAt).toLocaleDateString()}
                          </div>
                          <button
                            onClick={() => void handlePull(item.path)}
                            disabled={busyId === item.path}
                            className="mt-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-surface-raised hover:brightness-125 text-content transition-colors disabled:opacity-50"
                          >
                            {busyId === item.path
                              ? 'Copying...'
                              : local && local.revision >= item.revision
                                ? 'Copy again'
                                : 'Copy to this computer'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )
        ) : isLoading ? (
          <div className="flex items-center justify-center h-48 text-content-secondary text-sm">Loading...</div>
        ) : areas.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-subtle flex items-center justify-center mb-4">
              <MapPin className="w-7 h-7 text-content-tertiary" />
            </div>
            <h3 className="text-sm font-medium text-content mb-1">No survey areas saved yet</h3>
            <p className="text-xs text-content-secondary max-w-sm">
              Open a survey in Mission Planning and use Save area. The shape and every generator setting are stored,
              the waypoints are not: they are regenerated when the area is loaded, so the same field can be flown
              again with a different altitude, camera or vehicle.
            </p>
          </div>
        ) : (
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
            {areas.map((area) => (
              <AreaCard
                key={area.id}
                area={area}
                areaUnit={areaUnit}
                busy={busyId === area.id}
                confirmingDelete={confirmDeleteId === area.id}
                onLoad={() => void handleLoad(area.id)}
                onPush={() => setPushTarget(area)}
                onExport={() => void exportArea(area.id)}
                onDuplicate={() => void duplicateArea(area.id, `${area.name} (copy)`)}
                onDelete={() => {
                  if (confirmDeleteId === area.id) {
                    void deleteArea(area.id);
                    setConfirmDeleteId(null);
                  } else {
                    setConfirmDeleteId(area.id);
                    setTimeout(() => setConfirmDeleteId((id) => (id === area.id ? null : id)), 3000);
                  }
                }}
              />
            ))}
          </div>
        )}
      </div>

      {pushTarget && (
        <BackupTargetDialog
          title="Save survey area to backup"
          itemName={pushTarget.name}
          kind="survey area"
          sites={vaultSites}
          initialSite={pushTarget.site ?? ''}
          onCancel={() => setPushTarget(null)}
          onConfirm={async (site) => {
            await pushToVault(pushTarget.id, site);
            setPushTarget(null);
          }}
        />
      )}
    </div>
  );
}

/** The generator's own name when it is installed, its id when it is not. */
function generatorLabel(id: string): string {
  return getSurveyGenerator(id)?.displayName ?? id;
}

function groupBySite<T extends { site: string }>(items: T[]): Array<[string, T[]]> {
  const bySite = new Map<string, T[]>();
  for (const item of items) {
    const list = bySite.get(item.site);
    if (list) list.push(item);
    else bySite.set(item.site, [item]);
  }
  return [...bySite.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function AreaCard({
  area, areaUnit, busy, confirmingDelete, onLoad, onPush, onExport, onDuplicate, onDelete,
}: {
  area: SurveyDocumentSummary;
  areaUnit: Parameters<typeof formatAreaFromSquareMeters>[1];
  busy: boolean;
  confirmingDelete: boolean;
  onLoad: () => void;
  onPush: () => void;
  onExport: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="rounded-xl border border-subtle bg-surface p-3 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-sm font-medium text-content truncate">{area.name}</div>
          <div className="text-[11px] text-content-secondary">
            {generatorLabel(area.generatorId)} · version {area.revision}
          </div>
        </div>
        {area.site && (
          <span className="px-1.5 py-0.5 rounded bg-surface-raised text-[10px] text-content-secondary shrink-0">
            {area.site}
          </span>
        )}
      </div>

      {area.description && (
        <p className="text-xs text-content-secondary line-clamp-2">{area.description}</p>
      )}

      <div className="flex items-center gap-3 text-[11px] text-content-secondary tabular-nums">
        <span>{area.preview.vertexCount} points</span>
        {area.preview.areaSqm !== null && <span>{formatAreaFromSquareMeters(area.preview.areaSqm, areaUnit)}</span>}
        <span className="ml-auto">{new Date(area.updatedAt).toLocaleDateString()}</span>
      </div>

      {area.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {area.tags.map((tag) => (
            <span key={tag} className="px-1.5 py-0.5 rounded bg-surface-raised text-[10px] text-content-secondary">
              {tag}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-center gap-1.5 pt-1">
        <button
          onClick={onLoad}
          disabled={busy}
          className="flex-1 px-2 py-1.5 text-xs font-medium rounded-lg bg-purple-600 hover:bg-purple-500 text-white transition-colors disabled:opacity-50"
        >
          {busy ? 'Loading...' : 'Load into mission'}
        </button>
        <button
          onClick={onPush}
          data-tip="Save a copy to your backup so your other computers can open it"
          className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
        >
          <CloudUpload className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onExport}
          data-tip="Save this area to a file"
          className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDuplicate}
          data-tip="Duplicate"
          className="p-1.5 rounded-lg text-content-secondary hover:text-content hover:bg-surface-raised transition-colors"
        >
          <Copy className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={onDelete}
          data-tip={confirmingDelete ? 'Click again to delete' : 'Delete'}
          className={`p-1.5 rounded-lg transition-colors ${
            confirmingDelete
              ? 'bg-red-500/15 text-red-400'
              : 'text-content-secondary hover:text-red-400 hover:bg-surface-raised'
          }`}
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
