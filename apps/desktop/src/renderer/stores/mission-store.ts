import { create } from 'zustand';
import {
  type MissionItem,
  type MissionProgress,
  createDefaultWaypoint,
  createTakeoffWaypoint,
  calculateMissionDistance,
  estimateMissionTime,
  MAV_CMD,
  MAV_FRAME,
} from '../../shared/mission-types';
import { useSettingsStore } from './settings-store';

// Home position (separate from waypoints, used as reference point)
interface HomePosition {
  lat: number;
  lon: number;
  alt: number;  // Altitude (usually 0 for ground level)
}

interface MissionStore {
  // State
  missionItems: MissionItem[];
  homePosition: HomePosition | null;  // Home/launch position
  isLoading: boolean;
  progress: MissionProgress | null;
  error: string | null;
  currentSeq: number | null;      // Active waypoint from FC
  isDirty: boolean;               // Has unsaved changes
  selectedSeq: number | null;     // UI selection
  lastSuccessMessage: string | null;  // For toast notifications
  hasTerrainCollisions: boolean;  // Terrain collision warning

  // Computed (as functions)
  getWaypointCount: () => number;
  getTotalDistance: () => number;
  getEstimatedTime: () => number;

  // Actions
  fetchMission: () => Promise<void>;
  uploadMission: () => Promise<boolean>;
  clearMissionFromFC: () => Promise<boolean>;

  // Home position
  setHomePosition: (lat: number, lon: number, alt?: number) => void;
  clearHomePosition: () => void;

  // Local editing
  addWaypoint: (lat: number, lon: number, alt?: number) => void;
  insertWaypoint: (afterSeq: number, lat: number, lon: number, alt?: number) => void;
  updateWaypoint: (seq: number, updates: Partial<MissionItem>) => void;
  removeWaypoint: (seq: number) => void;
  reorderWaypoints: (fromSeq: number, toSeq: number) => void;
  clearMission: () => void;

  // UI state
  setSelectedSeq: (seq: number | null) => void;

  // IPC event handlers (from FC)
  setMissionItems: (items: MissionItem[]) => void;
  // For file loading (no success message - toolbar handles it)
  setMissionItemsFromFile: (items: MissionItem[]) => void;
  updateProgress: (progress: MissionProgress) => void;
  setCurrentSeq: (seq: number) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setUploadComplete: (itemCount: number) => void;
  setClearComplete: () => void;
  clearLastSuccessMessage: () => void;
  markAsSaved: () => void;
  setHasTerrainCollisions: (hasCollisions: boolean) => void;
  reset: () => void;
}

export const useMissionStore = create<MissionStore>((set, get) => ({
  // Initial state
  missionItems: [],
  homePosition: null,
  isLoading: false,
  progress: null,
  error: null,
  currentSeq: null,
  isDirty: false,
  selectedSeq: null,
  lastSuccessMessage: null,
  hasTerrainCollisions: false,

  // Computed values
  getWaypointCount: () => get().missionItems.length,

  getTotalDistance: () => {
    return calculateMissionDistance(get().missionItems);
  },

  getEstimatedTime: () => {
    const distance = get().getTotalDistance();
    return estimateMissionTime(distance);
  },

  // Actions - FC communication (will be wired to IPC)
  fetchMission: async () => {
    // Set initial progress to track operation type
    set({ isLoading: true, error: null, progress: { total: 0, transferred: 0, operation: 'download' } });
    try {
      const result = await window.electronAPI?.downloadMission();
      if (!result?.success) {
        set({ error: result?.error || 'Failed to download mission', isLoading: false, progress: null });
      }
      // Items will be set via IPC events (onMissionComplete)
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
    }
  },

  uploadMission: async () => {
    const { missionItems } = get();
    if (missionItems.length === 0) {
      set({ error: 'No waypoints to upload' });
      return false;
    }

    // Set initial progress to track operation type
    set({ isLoading: true, error: null, progress: { total: missionItems.length, transferred: 0, operation: 'upload' } });
    try {
      const result = await window.electronAPI?.uploadMission(missionItems);
      if (result?.success) {
        // Don't set isLoading: false here - wait for MISSION_ACK via onMissionUploadComplete
        return true;
      } else {
        set({ error: result?.error || 'Failed to upload mission', isLoading: false, progress: null });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
      return false;
    }
  },

  clearMissionFromFC: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI?.clearMission();
      if (result?.success) {
        // Don't set isLoading: false here - wait for MISSION_ACK via onMissionClearComplete
        return true;
      } else {
        set({ error: result?.error || 'Failed to clear mission', isLoading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  // Home position management
  setHomePosition: (lat: number, lon: number, alt: number = 0) => {
    set({ homePosition: { lat, lon, alt }, isDirty: true });
  },

  clearHomePosition: () => {
    set({ homePosition: null, isDirty: true });
  },

  // Local editing - simple: one click = one waypoint
  // First waypoint is always Takeoff, subsequent are regular waypoints
  // Requires home position to be set first
  addWaypoint: (lat: number, lon: number, alt?: number) => {
    const { missionItems, homePosition } = get();

    // Can't add waypoints without home position
    if (!homePosition) {
      return;
    }

    // Get default altitudes from settings
    const { missionDefaults } = useSettingsStore.getState();
    const defaultAlt = alt ?? missionDefaults.defaultWaypointAltitude;

    const seq = missionItems.length;

    // First waypoint should be Takeoff
    const newItem = seq === 0
      ? createTakeoffWaypoint(seq, lat, lon, missionDefaults.defaultTakeoffAltitude)
      : createDefaultWaypoint(seq, lat, lon, defaultAlt);

    set({
      missionItems: [...missionItems, newItem],
      isDirty: true,
      selectedSeq: seq,
    });
  },

  insertWaypoint: (afterSeq: number, lat: number, lon: number, alt: number = 100) => {
    const { missionItems } = get();
    const newSeq = afterSeq + 1;
    const newItem = createDefaultWaypoint(newSeq, lat, lon, alt);

    // Insert and renumber
    const newItems = [
      ...missionItems.slice(0, newSeq),
      newItem,
      ...missionItems.slice(newSeq).map(item => ({ ...item, seq: item.seq + 1 })),
    ];

    set({
      missionItems: newItems,
      isDirty: true,
      selectedSeq: newSeq,
    });
  },

  updateWaypoint: (seq: number, updates: Partial<MissionItem>) => {
    const { missionItems } = get();
    const newItems = missionItems.map(item =>
      item.seq === seq ? { ...item, ...updates } : item
    );
    set({ missionItems: newItems, isDirty: true });
  },

  removeWaypoint: (seq: number) => {
    const { missionItems, selectedSeq } = get();
    const newItems = missionItems
      .filter(item => item.seq !== seq)
      .map((item, index) => ({ ...item, seq: index }));

    // Adjust selection
    let newSelectedSeq = selectedSeq;
    if (selectedSeq !== null) {
      if (selectedSeq === seq) {
        newSelectedSeq = newItems.length > 0 ? Math.min(seq, newItems.length - 1) : null;
      } else if (selectedSeq > seq) {
        newSelectedSeq = selectedSeq - 1;
      }
    }

    set({
      missionItems: newItems,
      isDirty: true,
      selectedSeq: newSelectedSeq,
    });
  },

  reorderWaypoints: (fromSeq: number, toSeq: number) => {
    if (fromSeq === toSeq) return;

    const { missionItems } = get();
    const items = [...missionItems];
    const [moved] = items.splice(fromSeq, 1);
    items.splice(toSeq, 0, moved);

    // Renumber all items
    const renumbered = items.map((item, index) => ({ ...item, seq: index }));

    set({
      missionItems: renumbered,
      isDirty: true,
      selectedSeq: toSeq,
    });
  },

  clearMission: () => {
    set({
      missionItems: [],
      homePosition: null,
      isDirty: false,
      selectedSeq: null,
      currentSeq: null,
    });
  },

  // UI state
  setSelectedSeq: (seq: number | null) => {
    set({ selectedSeq: seq });
  },

  // IPC event handlers (from FC download)
  setMissionItems: (items: MissionItem[]) => {
    // Filter out home waypoint at 0,0 coordinates (seq=0 with invalid position)
    // FC creates this placeholder when no GPS fix is available
    const filteredItems = items.filter(item => {
      // Keep if not seq 0, or if it has valid coordinates
      if (item.seq !== 0) return true;
      // Filter out seq 0 if it's at 0,0 (invalid home position)
      return item.latitude !== 0 || item.longitude !== 0;
    });

    // Renumber remaining items starting from 0
    const renumberedItems = filteredItems.map((item, index) => ({
      ...item,
      seq: index,
    }));

    set({
      missionItems: renumberedItems,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
      lastSuccessMessage: `Downloaded ${renumberedItems.length} waypoints from flight controller`,
    });
  },

  // For file loading (toolbar handles toast via showToast prop)
  setMissionItemsFromFile: (items: MissionItem[]) => {
    set({
      missionItems: items,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
    });
  },

  updateProgress: (progress: MissionProgress) => {
    set({ progress });
  },

  setCurrentSeq: (seq: number) => {
    set({ currentSeq: seq });
  },

  setError: (error: string | null) => {
    set({ error, isLoading: false, progress: null });
  },

  setLoading: (loading: boolean) => {
    set({ isLoading: loading });
  },

  setUploadComplete: (itemCount: number) => {
    set({
      isLoading: false,
      isDirty: false,
      progress: null,
      error: null,
      lastSuccessMessage: `Uploaded ${itemCount} waypoints to flight controller`,
    });
  },

  setClearComplete: () => {
    set({
      isLoading: false,
      progress: null,
      error: null,
      lastSuccessMessage: 'Mission cleared from flight controller',
    });
  },

  clearLastSuccessMessage: () => {
    set({ lastSuccessMessage: null });
  },

  markAsSaved: () => {
    set({ isDirty: false });
  },

  setHasTerrainCollisions: (hasCollisions: boolean) => {
    set({ hasTerrainCollisions: hasCollisions });
  },

  reset: () => {
    set({
      missionItems: [],
      homePosition: null,
      isLoading: false,
      progress: null,
      error: null,
      currentSeq: null,
      isDirty: false,
      selectedSeq: null,
      lastSuccessMessage: null,
      hasTerrainCollisions: false,
    });
  },
}));
