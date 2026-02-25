import { useEffect, useState } from 'react';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useMissionStore } from '../../stores/mission-store';
import { useNavigationStore } from '../../stores/navigation-store';
import { useSettingsStore } from '../../stores/settings-store';
import { MissionCard } from './MissionCard';
import { MissionDetailPanel } from './MissionDetailPanel';
import { SaveMissionModal } from './SaveMissionModal';
import type { MissionSortField } from '../../../shared/mission-library-types';
import type { MissionItem } from '../../../shared/mission-types';

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

  const [searchInput, setSearchInput] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [importData, setImportData] = useState<{ items: MissionItem[]; home: { lat: number; lon: number; alt: number } | null } | null>(null);

  // Load missions on mount
  useEffect(() => {
    store.loadMissions();
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
    // Set items without triggering FC download success message
    missionStore.setMissionItemsFromFile(mission.items);

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

  return (
    <div className="h-full flex flex-col">
      {/* Top bar */}
      <div className="shrink-0 px-6 py-4 border-b border-gray-800/50 bg-gray-900/20">
        <div className="flex items-center gap-4">
          {/* Title */}
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-semibold text-white">Mission Library</h1>
              <p className="text-xs text-gray-500">{store.missions.length} missions saved</p>
            </div>
          </div>

          {/* Import from file */}
          <button
            onClick={handleImportFile}
            className="px-3 py-1.5 text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Import File
          </button>

          {/* Search */}
          <div className="flex-1 max-w-sm">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                type="text"
                value={searchInput}
                onChange={e => setSearchInput(e.target.value)}
                placeholder="Search missions..."
                className="w-full pl-9 pr-3 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
              />
            </div>
          </div>

          {/* Vehicle filter */}
          {vehicles.length > 0 && (
            <select
              value={store.filter.vehicleProfileId ?? ''}
              onChange={e => store.setFilter({ vehicleProfileId: e.target.value || undefined })}
              className="px-2 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
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
              className="px-2 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
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
            className="px-2 py-1.5 bg-gray-800/50 border border-gray-700/50 rounded-lg text-xs text-gray-300 focus:outline-none focus:border-blue-500/50"
          >
            {SORT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          {/* Sort direction toggle */}
          <button
            onClick={() => store.setSort(store.sort.field, store.sort.direction === 'asc' ? 'desc' : 'asc')}
            className="p-1.5 rounded-md bg-gray-800/50 border border-gray-700/50 text-gray-400 hover:text-gray-200 transition-colors"
            title={store.sort.direction === 'asc' ? 'Ascending' : 'Descending'}
          >
            <svg className={`w-3.5 h-3.5 transition-transform ${store.sort.direction === 'asc' ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {/* Grid/List toggle */}
          <div className="flex items-center bg-gray-800/50 border border-gray-700/50 rounded-lg overflow-hidden">
            <button
              onClick={() => store.setViewMode('grid')}
              className={`p-1.5 transition-colors ${store.viewMode === 'grid' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
              title="Grid view"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zm10 0a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
              </svg>
            </button>
            <button
              onClick={() => store.setViewMode('list')}
              className={`p-1.5 transition-colors ${store.viewMode === 'list' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
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
          <div className="flex items-center justify-center h-48 text-gray-500">
            <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            Loading...
          </div>
        ) : store.missions.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center h-64 text-center">
            <div className="w-16 h-16 rounded-2xl bg-gray-800/50 border border-gray-700/30 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-sm font-medium text-gray-300 mb-1">No missions saved yet</h3>
            <p className="text-xs text-gray-500 max-w-xs">
              Create waypoints in the Mission Planner and click the Library button to save missions here for reuse.
            </p>
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
                  onClick={() => store.selectMission(store.selectedMission?.id === m.id ? null : m.id)}
                  onLoad={() => handleLoadToEditor(m.id)}
                  onDuplicate={() => handleDuplicate(m.id, m.name)}
                  onDelete={() => handleDelete(m.id)}
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
            <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-700/30 text-gray-500">
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
                      : 'border-l-gray-700/40';
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
                        className={`border-b border-gray-700/20 border-l-[3px] cursor-pointer transition-colors ${statusBorder} ${
                          isSelected
                            ? 'bg-blue-500/5'
                            : 'hover:bg-gray-800/30'
                        }`}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="text-gray-200 font-medium">{m.name}</span>
                            {statusLabel ? (
                              <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${statusBadge}`}>
                                {statusLabel}
                              </span>
                            ) : (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-700/30 text-gray-500">
                                New
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">{vehicle?.name ?? '--'}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-right">{m.waypointCount}</td>
                        <td className="px-4 py-2.5 text-gray-400 text-right">
                          {m.totalDistanceMeters < 1000 ? `${Math.round(m.totalDistanceMeters)}m` : `${(m.totalDistanceMeters / 1000).toFixed(1)}km`}
                        </td>
                        <td className="px-4 py-2.5 text-gray-400">
                          {m.flightCount > 0 ? (
                            <span className="flex items-center gap-1.5">
                              <span>{m.flightCount} flights</span>
                            </span>
                          ) : '--'}
                        </td>
                        <td className="px-4 py-2.5 text-gray-500">{new Date(m.updatedAt).toLocaleDateString()}</td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-1 justify-end">
                            <button
                              onClick={(e) => { e.stopPropagation(); handleLoadToEditor(m.id); }}
                              className="p-1 rounded hover:bg-blue-600/20 text-gray-500 hover:text-blue-400 transition-colors"
                              title="Load into Editor"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                              </svg>
                            </button>
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDuplicate(m.id, m.name); }}
                              className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
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
                                  : 'hover:bg-red-600/20 text-gray-500 hover:text-red-400'
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
