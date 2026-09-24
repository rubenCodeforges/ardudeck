import { create } from 'zustand';
import type {
  MissionSummary,
  StoredMission,
  FlightLog,
  SaveMissionPayload,
  MissionListFilter,
  MissionSortOptions,
  MissionSortField,
  MissionSortDirection,
  FlightStatus,
  AbortReason,
} from '../../shared/mission-library-types';
import type { VaultMission } from '../../shared/ipc-channels';

type ViewMode = 'grid' | 'list';

interface MissionLibraryStore {
  // State
  missions: MissionSummary[];
  selectedMission: StoredMission | null;
  flightLogs: FlightLog[];
  allTags: string[];
  filter: MissionListFilter;
  sort: MissionSortOptions;
  viewMode: ViewMode;
  isLoading: boolean;
  error: string | null;

  // Actions - Missions
  loadMissions: () => Promise<void>;
  selectMission: (id: string | null) => Promise<void>;
  saveMission: (payload: SaveMissionPayload) => Promise<MissionSummary | null>;
  deleteMission: (id: string) => Promise<boolean>;
  duplicateMission: (id: string, newName: string) => Promise<MissionSummary | null>;

  // Actions - Flight Logs
  loadFlightLogs: (missionId: string) => Promise<void>;
  addFlightLog: (missionId: string, status: FlightStatus, opts?: {
    abortReason?: AbortReason | null;
    lastWaypointReached?: number | null;
    notes?: string;
  }) => Promise<FlightLog | null>;
  updateFlightLog: (log: FlightLog) => Promise<void>;
  deleteFlightLog: (missionId: string, logId: string) => Promise<boolean>;

  // Actions - Files and backup
  /** Write the whole mission to a file, groups and surveys intact. */
  exportMissionFile: (id: string) => Promise<string | null>;
  importMissionFile: () => Promise<MissionSummary | null>;
  /** Vault: missions committed under a project, from this or another machine. */
  vaultMissions: VaultMission[];
  loadVaultMissions: () => Promise<void>;
  pushMissionToVault: (id: string, site: string) => Promise<boolean>;
  pullMissionFromVault: (path: string) => Promise<MissionSummary | null>;

  // Actions - Filter/Sort/View
  setFilter: (filter: Partial<MissionListFilter>) => void;
  setSort: (field: MissionSortField, direction: MissionSortDirection) => void;
  setViewMode: (mode: ViewMode) => void;
  clearSelection: () => void;
}

export const useMissionLibraryStore = create<MissionLibraryStore>((set, get) => ({
  // Initial state
  missions: [],
  selectedMission: null,
  flightLogs: [],
  allTags: [],
  filter: {},
  sort: { field: 'updatedAt', direction: 'desc' },
  viewMode: 'grid',
  isLoading: false,
  error: null,
  vaultMissions: [],

  exportMissionFile: async (id) => {
    const result = await window.electronAPI?.missionLibraryExportFile(id);
    if (!result?.success) {
      if (result?.error && result.error !== 'Cancelled') set({ error: result.error });
      return null;
    }
    return result.filePath ?? null;
  },

  importMissionFile: async () => {
    const result = await window.electronAPI?.missionLibraryImportFile();
    if (!result?.success) {
      if (result?.error && result.error !== 'Cancelled') set({ error: result.error });
      return null;
    }
    await get().loadMissions();
    return result.mission ?? null;
  },

  loadVaultMissions: async () => {
    try {
      const vaultMissions = (await window.electronAPI?.fleetRepoListMissionDocs()) ?? [];
      set({ vaultMissions });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    }
  },

  pushMissionToVault: async (id, site) => {
    const mission = await window.electronAPI?.missionLibraryGet(id);
    if (!mission) return false;
    const result = await window.electronAPI?.fleetRepoSnapshotMissionDoc(site, { ...mission, site });
    if (!result?.success) {
      set({ error: result?.error ?? 'Could not write to the backup' });
      return false;
    }
    // Remember the project on the local copy so the next save goes to the same
    // folder without asking again.
    await window.electronAPI?.missionLibraryImportDoc({ ...mission, site });
    await Promise.all([get().loadMissions(), get().loadVaultMissions()]);
    return true;
  },

  pullMissionFromVault: async (path) => {
    const mission = await window.electronAPI?.fleetRepoReadMissionDoc(path);
    if (!mission) {
      set({ error: 'Could not read that mission from the backup' });
      return null;
    }
    const stored = await window.electronAPI?.missionLibraryImportDoc(mission);
    await get().loadMissions();
    return stored ?? null;
  },

  // ---------------------------------------------------------------------------
  // Missions
  // ---------------------------------------------------------------------------

  loadMissions: async () => {
    set({ isLoading: true, error: null });
    try {
      const { filter, sort } = get();
      const [missions, tags] = await Promise.all([
        window.electronAPI.missionLibraryList(filter, sort),
        window.electronAPI.missionLibraryGetTags(),
      ]);
      set({ missions, allTags: tags, isLoading: false });
    } catch (err) {
      set({ error: String(err), isLoading: false });
    }
  },

  selectMission: async (id: string | null) => {
    if (!id) {
      set({ selectedMission: null, flightLogs: [] });
      return;
    }
    try {
      const mission = await window.electronAPI.missionLibraryGet(id);
      const logs = await window.electronAPI.missionLibraryFlightLogs(id);
      set({ selectedMission: mission, flightLogs: logs });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  saveMission: async (payload: SaveMissionPayload) => {
    try {
      const summary = await window.electronAPI.missionLibrarySave(payload);
      // Reload the list after save (don't let reload failure break the save result)
      get().loadMissions().catch(() => {});
      return summary;
    } catch (err) {
      console.error('[MissionLibrary] Failed to save mission:', err);
      set({ error: String(err) });
      return null;
    }
  },

  deleteMission: async (id: string) => {
    try {
      const success = await window.electronAPI.missionLibraryDelete(id);
      if (success) {
        // Clear selection if this mission was selected
        const { selectedMission } = get();
        if (selectedMission?.id === id) {
          set({ selectedMission: null, flightLogs: [] });
        }
        await get().loadMissions();
      }
      return success;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  duplicateMission: async (id: string, newName: string) => {
    try {
      const summary = await window.electronAPI.missionLibraryDuplicate(id, newName);
      if (summary) {
        await get().loadMissions();
      }
      return summary;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  // ---------------------------------------------------------------------------
  // Flight Logs
  // ---------------------------------------------------------------------------

  loadFlightLogs: async (missionId: string) => {
    try {
      const logs = await window.electronAPI.missionLibraryFlightLogs(missionId);
      set({ flightLogs: logs });
    } catch (err) {
      set({ error: String(err) });
    }
  },

  addFlightLog: async (missionId: string, status: FlightStatus, opts) => {
    try {
      const log = await window.electronAPI.missionLibraryAddLog({
        missionId,
        status,
        abortReason: opts?.abortReason ?? null,
        lastWaypointReached: opts?.lastWaypointReached ?? null,
        notes: opts?.notes ?? '',
        startedAt: status === 'in_progress' ? new Date().toISOString() : null,
        endedAt: status === 'completed' || status === 'aborted' ? new Date().toISOString() : null,
        cameraEvents: [],
      });
      // Reload logs and mission list (flight count changed)
      await get().loadFlightLogs(missionId);
      await get().loadMissions();
      return log;
    } catch (err) {
      set({ error: String(err) });
      return null;
    }
  },

  updateFlightLog: async (log: FlightLog) => {
    try {
      await window.electronAPI.missionLibraryUpdateLog(log);
      await get().loadFlightLogs(log.missionId);
      await get().loadMissions();
    } catch (err) {
      set({ error: String(err) });
    }
  },

  deleteFlightLog: async (missionId: string, logId: string) => {
    try {
      const success = await window.electronAPI.missionLibraryDeleteLog(missionId, logId);
      if (success) {
        await get().loadFlightLogs(missionId);
        await get().loadMissions();
      }
      return success;
    } catch (err) {
      set({ error: String(err) });
      return false;
    }
  },

  // ---------------------------------------------------------------------------
  // Filter / Sort / View
  // ---------------------------------------------------------------------------

  setFilter: (partial: Partial<MissionListFilter>) => {
    set((state) => ({ filter: { ...state.filter, ...partial } }));
    get().loadMissions();
  },

  setSort: (field: MissionSortField, direction: MissionSortDirection) => {
    set({ sort: { field, direction } });
    get().loadMissions();
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
  },

  clearSelection: () => {
    set({ selectedMission: null, flightLogs: [] });
  },
}));
