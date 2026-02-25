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
