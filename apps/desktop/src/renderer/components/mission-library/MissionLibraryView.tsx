import { useEffect, useState } from 'react';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useMissionStore } from '../../stores/mission-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { MissionCard } from './MissionCard';
import { MissionDetailPanel } from './MissionDetailPanel';
import { SaveMissionModal } from './SaveMissionModal';
import { SurveyAreaBrowser } from './SurveyAreaBrowser';
import { ProjectsBrowser } from './ProjectsBrowser';
import type { MissionSortField, MissionSummary } from '../../../shared/mission-library-types';
import { CloudUpload, Download, Upload } from 'lucide-react';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { BackupTargetDialog } from './BackupTargetDialog';
import type { MissionItem } from '../../../shared/mission-types';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';

const SORT_OPTIONS: { value: MissionSortField; label: string }[] = [
  { value: 'updatedAt', label: 'Last Modified' },
  { value: 'createdAt', label: 'Date Created' },
  { value: 'name', label: 'Name' },
  { value: 'waypointCount', label: 'Waypoints' },
  { value: 'totalDistanceMeters', label: 'Distance' },
  { value: 'flightCount', label: 'Flights' },
];

export function MissionLibraryView() {
  const store = useMissionLibraryStore();
  const missionStore = useMissionStore();
  const { setView } = useNavigationStore();
  const { vehicles } = useSettingsStore();
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);
  const vaultSites = useSurveyAreaStore((s) => s.vaultSites);
  const loadVault = useSurveyAreaStore((s) => s.loadVault);

  const [tab, setTab] = useState<'missions' | 'areas' | 'projects'>('missions');
  const [searchInput, setSearchInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importData, setImportData] = useState<{ items: MissionItem[]; home: { lat: number; lon: number; alt: number } | null } | null>(null);
  const [backupTarget, setBackupTarget] = useState<MissionSummary | null>(null);

  // Load missions on mount
  useEffect(() => {
    store.loadMissions();
    void store.loadVaultMissions();
    void loadVault();
  }, []);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      store.setFilter({ search: searchInput || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handleLoadToEditor = async (missionId?: string) => {
    const id = missionId ?? store.selectedMission?.id;
    if (!id) return;

    // Load full mission data
    const mission = missionId
      ? await window.electronAPI.missionLibraryGet(id)
      : store.selectedMission;

    if (!mission) return;

    // Load into mission store
    if (mission.homePosition) {
      missionStore.setHomePosition(
        mission.homePosition.lat,
        mission.homePosition.lon,
        mission.homePosition.alt
      );
    }
    // Set items without triggering FC download success message. Pass the
    // mission's persisted groups so survey/manual structure round-trips
    // through library load instead of being collapsed back into a single
    // Manual group.
    missionStore.setMissionItemsFromFile(mission.items, mission.groups);

    // Navigate to mission editor
    setView('mission');
  };

  const handleDuplicate = async (id: string, name: string) => {
    await store.duplicateMission(id, `${name} (copy)`);
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId === id) {
      await store.deleteMission(id);
      setConfirmDeleteId(null);
    } else {
      setConfirmDeleteId(id);
      // Auto-clear after 3s
      setTimeout(() => setConfirmDeleteId(null), 3000);
    }
  };

  const handleImportFile = async () => {
    const result = await window.electronAPI.loadMissionFromFile();
    if (!result.success || !result.items) return;

    // Extract home position from seq=0 (same logic as mission store)
    let home: { lat: number; lon: number; alt: number } | null = null;
    const filteredItems = result.items.filter(item => {
      if (item.seq === 0) {
        if (item.latitude !== 0 || item.longitude !== 0) {
          home = { lat: item.latitude, lon: item.longitude, alt: item.altitude };
        }
        return false;
      }
      return true;
    });

    // Renumber sequentially
    const renumbered = filteredItems.map((item, i) => ({ ...item, seq: i }));

    setImportData({ items: renumbered, home });
  };

  const tabs = (
    <div className="flex items-center bg-surface border border-subtle rounded-lg overflow-hidden">
      {(['missions', 'areas', 'projects'] as const).map((t) => (
        <button
          key={t}
          onClick={() => setTab(t)}
          className={`px-3 py-1.5 text-xs font-medium transition-colors ${
            tab === t ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'
          }`}
        >
          {t === 'missions' ? 'Missions' : t === 'areas' ? 'Survey areas' : 'Projects'}
        </button>
      ))}
    </div>
  );

  if (tab === 'areas') return <SurveyAreaBrowser tabs={tabs} />;
  if (tab === 'projects') return <ProjectsBrowser tabs={tabs} />;

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 px-6 py-4 border-b border-subtle bg-surface">
        <div className="flex items-center gap-4">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-content">Mission Library</h1>
              <p className="text-xs text-content-secondary">{store.missions.length} missions saved</p>
            </div>
          </div>

          {tabs}

          {/* Import from file */}
          <button
            onClick={handleImportFile}
            className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:bg-surface-raised text-content rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Import File
          </button>

          <button
            onClick={() => void store.importMissionFile()}
            data-tip="Open an ArduDeck mission file (.mission.json), groups and surveys intact"
            className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:brightness-125 text-content rounded-lg transition-colors flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            Open mission file
          </button>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search missions..."
                className="w-full pl-9 pr-3 py-1.5 bg-surface border border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Vehicle filter */}
          {vehicles.length > 0 && (
            <select
              value={store.filter.vehicleProfileId ?? ''}
              onChange={e => store.setFilter({ vehicleProfileId: e.target.value || undefined })}
              className="px-2 py-1.5 bg-surface border border-subtle rounded-lg text-xs text-content focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Vehicles</option>
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          )}

          {/* Tag filter */}
          {store.allTags.length > 0 && (
            <select
              value={store.filter.tags?.[0] ?? ''}
              onChange={e => store.setFilter({ tags: e.target.value ? [e.target.value] : undefined })}
              className="px-2 py-1.5 bg-surface border border-subtle rounded-lg text-xs text-content focus:outline-none focus:border-blue-500/50"
            >
              <option value="">All Tags</option>
              {store.allTags.map(tag => (
                <option key={tag} value={tag}>{tag}</option>
              ))}
            </select>
          )}

          {/* Sort */}
          <select
            value={store.sort.field}
            onChange={e => store.setSort(e.target.value as MissionSortField, store.sort.direction)}
            className="px-2 py-1.5 bg-surface border border-subtle rounded-lg text-xs text-content focus:outline-none focus:border-blue-500/50"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort direction toggle */}
          <button
            onClick={() => store.setSort(store.sort.field, store.sort.direction === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded-md bg-surface border border-subtle text-content-secondary hover:text-content transition-colors"
            title={store.sort.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${store.sort.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Grid/List toggle */}
          <div className="flex items-center bg-surface border border-subtle rounded-lg overflow-hidden">
            <button
              onClick={() => store.setViewMode('grid')}
              className={`p-1.5 transition-colors ${store.viewMode === 'grid' ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'}`}
              title="Grid view"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => store.setViewMode('list')}
              className={`p-1.5 transition-colors ${store.viewMode === 'list' ? 'bg-surface-raised text-content' : 'text-content-secondary hover:text-content'}`}
              title="List view"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {store.isLoading ? (
          <div className="flex items-center justify-center h-48 text-content-secondary">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : store.missions.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-surface border border-subtle flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-content mb-1">No missions saved yet</h3>
            <p className="text-xs text-content-secondary max-w-xs mb-4">
              Save plans here for reuse. Build them in Mission Planning, or draw survey areas in the Area Editor.
            </p>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setView('mission')}
                className="px-3 py-1.5 text-xs font-medium bg-surface-raised hover:brightness-125 text-content rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
                </svg>
                Open Mission Planning
              </button>
              <button
                onClick={() => { window.electronAPI?.openAreaEditor?.().catch(() => undefined); }}
                className="px-3 py-1.5 text-xs font-medium bg-teal-500/10 hover:bg-teal-500/20 text-teal-300 border border-teal-500/30 rounded-lg transition-colors flex items-center gap-1.5"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536M9 11l6.5-6.5a2 2 0 012.828 2.828L11.828 14H9v-3z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21h18" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 17l4-4" />
                </svg>
                Area Editor
              </button>
            </div>
          </div>
        ) : store.viewMode === 'grid' ? (
          /* Grid view */
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
              {store.missions.map(m => (
                <MissionCard
                  key={m.id}
                  mission={m}
                  isSelected={store.selectedMission?.id === m.id}
                  confirmDelete={confirmDeleteId === m.id}
                  onClick={() => store.selectMission(store.selectedMission?.id === m.id ? null : m.id)}
                  onLoad={() => handleLoadToEditor(m.id)}
                  onDuplicate={() => handleDuplicate(m.id, m.name)}
                  onDelete={() => handleDelete(m.id)}
                  onExport={() => void store.exportMissionFile(m.id)}
                  onBackup={() => setBackupTarget(m)}
                  inBackup={store.vaultMissions.some((v) => v.id === m.id)}
                />
              ))}
            </div>

            {/* Detail panel (below grid) */}
            {store.selectedMission && (
              <MissionDetailPanel onLoadToEditor={() => handleLoadToEditor()} />
            )}
          </div>
        ) : (
          /* List view */
          <div className="space-y-6">
            <div className="bg-surface rounded-xl border border-subtle overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-subtle text-content-secondary">
                    <th className="text-left px-4 py-2.5 font-medium">Name</th>
                    <th className="text-left px-4 py-2.5 font-medium">Vehicle</th>
                    <th className="text-right px-4 py-2.5 font-medium">WPs</th>
                    <th className="text-right px-4 py-2.5 font-medium">Distance</th>
                    <th className="text-left px-4 py-2.5 font-medium">Last Flight</th>
                    <th className="text-left px-4 py-2.5 font-medium">Updated</th>
                    <th className="px-4 py-2.5 w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {store.missions.map(m => {
                    const vehicle = vehicles.find(v => v.id === m.vehicleProfileId);
                    const isSelected = store.selectedMission?.id === m.id;
                    const statusBorder = m.lastFlightStatus === 'completed' ? 'border-l-emerald-400/60'
                      : m.lastFlightStatus === 'in_progress' ? 'border-l-amber-400/60'
                      : m.lastFlightStatus === 'aborted' ? 'border-l-red-400/60'
                      : m.lastFlightStatus === 'planned' ? 'border-l-blue-400/60'
                      : 'border-l-subtle';
                    const statusBadge = m.lastFlightStatus === 'completed' ? 'bg-emerald-500/10 text-emerald-400'
                      : m.lastFlightStatus === 'in_progress' ? 'bg-amber-500/10 text-amber-400'
                      : m.lastFlightStatus === 'aborted' ? 'bg-red-500/10 text-red-400'
                      : m.lastFlightStatus === 'planned' ? 'bg-blue-500/10 text-blue-400'
                      : '';
                    const statusLabel = m.lastFlightStatus === 'completed' ? 'Completed'
                      : m.lastFlightStatus === 'in_progress' ? 'In Progress'
                      : m.lastFlightStatus === 'aborted' ? 'Aborted'
                      : m.lastFlightStatus === 'planned' ? 'Planned'
                      : null;
                    return (
                      <tr
                        key={m.id}
                        onClick={() => store.selectMission(isSelected ? null : m.id)}
                        className={`border-b border-subtle border-l-[3px] cursor-pointer transition-colors ${statusBorder} ${
                          isSelected
                            ? 'bg-blue-500/5'
                            : 'hover:bg-surface'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-content font-medium">{m.name}</span>
                            {statusLabel ? (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusBadge}`}>
                                {statusLabel}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-surface-raised text-content-secondary">
                                New
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-content-secondary">{vehicle?.name ?? '--'}</td>
                        <td className="px-4 py-2.5 text-content-secondary text-right">{m.waypointCount}</td>
                        <td className="px-4 py-2.5 text-content-secondary text-right">
                          {formatDistanceFromMeters(m.totalDistanceMeters, distanceUnit)}
                        </td>
                        <td className="px-4 py-2.5 text-content-secondary">
                          {m.flightCount > 0 ? (
                            <span className="flex items-center gap-1.5">
                              <span>{m.flightCount} flights</span>
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-4 py-2.5 text-content-secondary">{new Date(m.updatedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLoadToEditor(m.id); }}
                              className="p-1 rounded hover:bg-blue-600/20 text-content-secondary hover:text-blue-400 transition-colors"
                              title="Load into Editor"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); void store.exportMissionFile(m.id); }}
                              className="p-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
                              data-tip="Save this mission to a file (keeps groups and surveys)"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); setBackupTarget(m); }}
                              className={`p-1 rounded transition-colors ${
                                store.vaultMissions.some((v) => v.id === m.id)
                                  ? 'text-emerald-600 dark:text-emerald-400 hover:bg-surface-raised'
                                  : 'text-content-secondary hover:text-content hover:bg-surface-raised'
                              }`}
                              data-tip="Save a copy to your backup so your other computers can open it"
                            >
                              <CloudUpload className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(m.id, m.name); }}
                              className="p-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
                              title="Duplicate"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDelete(m.id); }}
                              className={`p-1 rounded transition-colors ${
                                confirmDeleteId === m.id
                                  ? 'bg-red-600/30 text-red-400'
                                  : 'hover:bg-red-600/20 text-content-secondary hover:text-red-400'
                              }`}
                              title={confirmDeleteId === m.id ? 'Click again to confirm' : 'Delete'}
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Detail panel (below list) */}
            {store.selectedMission && (
              <MissionDetailPanel onLoadToEditor={() => handleLoadToEditor()} />
            )}
          </div>
        )}
      </div>

      {backupTarget && (
        <BackupTargetDialog
          title="Save mission to backup"
          itemName={backupTarget.name}
          kind="mission"
          sites={vaultSites}
          initialSite={backupTarget.site ?? ''}
          onCancel={() => setBackupTarget(null)}
          onConfirm={async (site) => {
            await store.pushMissionToVault(backupTarget.id, site);
            setBackupTarget(null);
          }}
        />
      )}

      {/* Import modal */}
      {importData && (
        <SaveMissionModal
          onClose={() => setImportData(null)}
          onSaved={() => setImportData(null)}
          importedItems={importData.items}
          importedHome={importData.home}
        />
      )}
    </div>
  );
}
