import { create } from 'zustand';
import {
  type RallyPoint,
  type RallyItem,
  parseRallyItems,
  buildRallyItems,
  createRallyPoint,
} from '../../shared/rally-types';

// Progress tracking for download/upload
interface RallyProgress {
  total: number;
  transferred: number;
  operation: 'download' | 'upload';
}

interface RallyStore {
  // State
  rallyPoints: RallyPoint[];
  isLoading: boolean;
  progress: RallyProgress | null;
  error: string | null;
  isDirty: boolean;
  selectedSeq: number | null;
  lastSuccessMessage: string | null;
  addMode: boolean; // When true, map clicks add rally points

  // Computed
  getRallyCount: () => number;

  // Actions - FC communication
  fetchRally: () => Promise<void>;
  uploadRally: () => Promise<boolean>;
  clearRallyFromFC: () => Promise<boolean>;

  // Local editing
  addRallyPoint: (lat: number, lon: number, altitude?: number) => void;
  updateRallyPoint: (seq: number, updates: Partial<RallyPoint>) => void;
  removeRallyPoint: (seq: number) => void;
  moveRallyPoint: (seq: number, lat: number, lon: number) => void;
  clearRally: () => void;

  // UI state
  setSelectedSeq: (seq: number | null) => void;
  setAddMode: (addMode: boolean) => void;

  // IPC event handlers
  setRallyItems: (items: RallyItem[]) => void;
  setRallyItemsFromFile: (items: RallyItem[]) => void;
  setRallyPoints: (points: RallyPoint[]) => void;
  updateProgress: (progress: RallyProgress) => void;
  setError: (error: string | null) => void;
  setLoading: (loading: boolean) => void;
  setUploadComplete: (itemCount: number) => void;
  setClearComplete: () => void;
  clearLastSuccessMessage: () => void;
  reset: () => void;
}

export const useRallyStore = create<RallyStore>((set, get) => ({
  // Initial state
  rallyPoints: [],
  isLoading: false,
  progress: null,
  error: null,
  isDirty: false,
  selectedSeq: null,
  lastSuccessMessage: null,
  addMode: false,

  // Computed
  getRallyCount: () => get().rallyPoints.length,

  // Actions - FC communication
  fetchRally: async () => {
    set({ isLoading: true, error: null, progress: { total: 0, transferred: 0, operation: 'download' } });
    try {
      const result = await window.electronAPI?.downloadRally();
      if (!result?.success) {
        set({ error: result?.error || 'Failed to download rally points', isLoading: false, progress: null });
      }
      // Items will be set via IPC events (onRallyComplete)
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
    }
  },

  uploadRally: async () => {
    const { rallyPoints } = get();
    const items = buildRallyItems(rallyPoints);

    if (items.length === 0) {
      set({ error: 'No rally points to upload' });
      return false;
    }

    set({ isLoading: true, error: null, progress: { total: items.length, transferred: 0, operation: 'upload' } });
    try {
      const result = await window.electronAPI?.uploadRally(items);
      if (result?.success) {
        return true;
      } else {
        set({ error: result?.error || 'Failed to upload rally points', isLoading: false, progress: null });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false, progress: null });
      return false;
    }
  },

  clearRallyFromFC: async () => {
    set({ isLoading: true, error: null });
    try {
      const result = await window.electronAPI?.clearRally();
      if (result?.success) {
        return true;
      } else {
        set({ error: result?.error || 'Failed to clear rally points', isLoading: false });
        return false;
      }
    } catch (err) {
      set({ error: String(err), isLoading: false });
      return false;
    }
  },

  // Local editing
  addRallyPoint: (lat, lon, altitude = 100) => {
    const { rallyPoints } = get();
    const seq = rallyPoints.length;
    const newPoint = createRallyPoint(seq, lat, lon, altitude);

    set({
      rallyPoints: [...rallyPoints, newPoint],
      isDirty: true,
      selectedSeq: seq,
    });
  },

  updateRallyPoint: (seq, updates) => {
    set(state => ({
      rallyPoints: state.rallyPoints.map(p =>
        p.seq === seq ? { ...p, ...updates } : p
      ),
      isDirty: true,
    }));
  },

  removeRallyPoint: (seq) => {
    set(state => {
      const newPoints = state.rallyPoints
        .filter(p => p.seq !== seq)
        .map((p, index) => ({ ...p, seq: index })); // Renumber

      // Adjust selection
      let newSelectedSeq = state.selectedSeq;
      if (state.selectedSeq !== null) {
        if (state.selectedSeq === seq) {
          newSelectedSeq = newPoints.length > 0 ? Math.min(seq, newPoints.length - 1) : null;
        } else if (state.selectedSeq > seq) {
          newSelectedSeq = state.selectedSeq - 1;
        }
      }

      return {
        rallyPoints: newPoints,
        isDirty: true,
        selectedSeq: newSelectedSeq,
      };
    });
  },

  moveRallyPoint: (seq, lat, lon) => {
    set(state => ({
      rallyPoints: state.rallyPoints.map(p =>
        p.seq === seq ? { ...p, latitude: lat, longitude: lon } : p
      ),
      isDirty: true,
    }));
  },

  clearRally: () => {
    set({
      rallyPoints: [],
      isDirty: false,
      selectedSeq: null,
    });
  },

  // UI state
  setSelectedSeq: (seq) => {
    set({ selectedSeq: seq });
  },

  setAddMode: (addMode) => {
    set({ addMode });
  },

  // IPC event handlers
  setRallyItems: (items) => {
    const points = parseRallyItems(items);
    set({
      rallyPoints: points,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
      lastSuccessMessage: `Downloaded ${points.length} rally points from flight controller`,
    });
  },

  setRallyItemsFromFile: (items) => {
    const points = parseRallyItems(items);
    set({
      rallyPoints: points,
      isLoading: false,
      progress: null,
      isDirty: false,
      error: null,
    });
  },

  setRallyPoints: (points) => {
    set({
      rallyPoints: points,
      isDirty: false,
    });
  },

  updateProgress: (progress) => {
    set({ progress });
  },

  setError: (error) => {
    set({ error, isLoading: false, progress: null });
  },

  setLoading: (loading) => {
    set({ isLoading: loading });
  },

  setUploadComplete: (itemCount) => {
    set({
      isLoading: false,
      isDirty: false,
      progress: null,
      error: null,
      lastSuccessMessage: `Uploaded ${itemCount} rally points to flight controller`,
    });
  },

  setClearComplete: () => {
    set({
      isLoading: false,
      progress: null,
      error: null,
      lastSuccessMessage: 'Rally points cleared from flight controller',
    });
  },

  clearLastSuccessMessage: () => {
    set({ lastSuccessMessage: null });
  },

  reset: () => {
    set({
      rallyPoints: [],
      isLoading: false,
      progress: null,
      error: null,
      isDirty: false,
      selectedSeq: null,
      lastSuccessMessage: null,
      addMode: false,
    });
  },
}));
