import { create } from 'zustand';
import type { Parameter, ParameterWithMeta, ParameterProgress, ParamValuePayload } from '../../shared/parameter-types.js';
import { isReadOnlyParameter, generateFallbackDescription } from '../../shared/parameter-types.js';
import { parameterBelongsToGroup } from '../../shared/parameter-groups.js';
import { validateParameterValue, type ParameterMetadataStore, type ValidationResult } from '../../shared/parameter-metadata.js';

export type SortColumn = 'name' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface FileParamDiff {
  paramId: string;
  currentValue: number;
  fileValue: number;
  type: number;
  selected: boolean;
}

// localStorage key for persisting favourites across sessions
const FAVOURITES_STORAGE_KEY = 'ardudeck-param-favourites';

function loadFavourites(): Set<string> {
  try {
    const stored = localStorage.getItem(FAVOURITES_STORAGE_KEY);
    if (stored) {
      const arr = JSON.parse(stored) as string[];
      return new Set(arr);
    }
  } catch { /* ignore corrupt data */ }
  return new Set();
}

function saveFavourites(favourites: Set<string>) {
  try {
    localStorage.setItem(FAVOURITES_STORAGE_KEY, JSON.stringify([...favourites]));
  } catch { /* ignore write errors */ }
}

interface ParameterStore {
  // State
  parameters: Map<string, ParameterWithMeta>;
  metadata: ParameterMetadataStore | null;
  isLoading: boolean;
  isLoadingMetadata: boolean;
  progress: ParameterProgress | null;
  error: string | null;
  lastRefresh: number;
  searchQuery: string;
  selectedGroup: string;
  showOnlyModified: boolean;
  showOnlyFavourites: boolean;
  favourites: Set<string>;
  sortColumn: SortColumn;
  sortDirection: SortDirection;

  // File compare state
  showCompareModal: boolean;
  fileParamDiffs: FileParamDiff[];
  fileSkippedCount: number;
  fileTotalCount: number;
  fileVehicleType: string | null;
  isApplyingFileParams: boolean;
  applyProgress: { applied: number; total: number } | null;

  // Computed
  paramCount: number;
  filteredParameters: () => ParameterWithMeta[];
  modifiedCount: () => number;
  modifiedParameters: () => ParameterWithMeta[];
  groupCounts: () => Map<string, number>;
  favouriteCount: () => number;
  getDescription: (paramId: string) => string;
  hasOfficialDescription: (paramId: string) => boolean;
  validateParameter: (paramId: string, value: number) => ValidationResult;
  getParameterMetadata: (paramId: string) => { range?: { min: number; max: number }; values?: Record<number, string>; units?: string; bitmask?: Record<number, string>; rebootRequired?: boolean } | null;
  isRebootRequired: (paramId: string) => boolean;
  isFavourite: (paramId: string) => boolean;

  // Actions
  fetchParameters: () => Promise<void>;
  fetchMetadata: (mavType: number) => Promise<void>;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  updateParameter: (param: ParamValuePayload) => void;
  setProgress: (progress: ParameterProgress) => void;
  setComplete: () => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedGroup: (group: string) => void;
  setShowOnlyModified: (show: boolean) => void;
  toggleShowOnlyModified: () => void;
  toggleShowOnlyFavourites: () => void;
  toggleFavourite: (paramId: string) => void;
  setSortColumn: (column: SortColumn) => void;
  toggleSort: (column: SortColumn) => void;
  revertParameter: (paramId: string) => void;
  markAllAsSaved: () => void;
  reset: () => void;

  // File compare actions
  loadFileForCompare: (fileParams: Array<{ id: string; value: number }>, fileVehicleType?: string) => void;
  closeCompareModal: () => void;
  toggleDiffSelection: (paramId: string) => void;
  selectAllDiffs: () => void;
  deselectAllDiffs: () => void;
  applySelectedFileParams: () => Promise<{ applied: number; failed: number }>;
}

// Tracks params the user has actively edited via setParameter (pending FC confirmation)
const userModifiedParams = new Set<string>();

export const useParameterStore = create<ParameterStore>((set, get) => ({
  parameters: new Map(),
  paramCount: 0,
  metadata: null,
  isLoading: false,
  isLoadingMetadata: false,
  progress: null,
  error: null,
  lastRefresh: 0,
  searchQuery: '',
  selectedGroup: 'all',
  showOnlyModified: false,
  showOnlyFavourites: false,
  favourites: loadFavourites(),
  sortColumn: 'name' as SortColumn,
  sortDirection: 'asc' as SortDirection,

  // File compare state
  showCompareModal: false,
  fileParamDiffs: [],
  fileSkippedCount: 0,
  fileTotalCount: 0,
  fileVehicleType: null,
  isApplyingFileParams: false,
  applyProgress: null,

  filteredParameters: () => {
    const { parameters, searchQuery, selectedGroup, showOnlyModified, showOnlyFavourites, favourites, sortColumn, sortDirection } = get();
    let params = Array.from(parameters.values());

    // Filter by favourites
    if (showOnlyFavourites) {
      params = params.filter(p => favourites.has(p.id));
    }

    // Filter by group
    if (selectedGroup !== 'all') {
      params = params.filter(p => parameterBelongsToGroup(p.id, selectedGroup));
    }

    // Filter by modified status
    if (showOnlyModified) {
      params = params.filter(p => p.isModified);
    }

    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      params = params.filter(p => p.id.toLowerCase().includes(query));
    }

    // Sort
    params.sort((a, b) => {
      let comparison = 0;
      if (sortColumn === 'name') {
        comparison = a.id.localeCompare(b.id);
      } else if (sortColumn === 'status') {
        // Modified params first when ascending, last when descending
        comparison = (a.isModified ? 1 : 0) - (b.isModified ? 1 : 0);
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });

    return params;
  },

  modifiedCount: () => {
    const { parameters } = get();
    // Exclude read-only params from modified count
    return Array.from(parameters.values()).filter(p => p.isModified && !p.isReadOnly).length;
  },

  modifiedParameters: () => {
    const { parameters } = get();
    // Get all modified params (excluding read-only)
    return Array.from(parameters.values())
      .filter(p => p.isModified && !p.isReadOnly)
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  groupCounts: () => {
    const { parameters } = get();
    const counts = new Map<string, number>();
    const params = Array.from(parameters.values());

    // Count 'all' as total
    counts.set('all', params.length);

    // Count each group
    for (const param of params) {
      // Check each group (except 'all')
      const groups = ['arming', 'battery', 'failsafe', 'flight_modes', 'tuning', 'gps', 'compass', 'rc', 'motors', 'navigation', 'logging'];
      for (const groupId of groups) {
        if (parameterBelongsToGroup(param.id, groupId)) {
          counts.set(groupId, (counts.get(groupId) ?? 0) + 1);
        }
      }
    }

    return counts;
  },

  getDescription: (paramId: string) => {
    const { metadata } = get();
    // Try official metadata first
    if (metadata) {
      const meta = metadata[paramId];
      if (meta?.description) {
        return meta.description;
      }
    }
    // Fallback to generated description
    return generateFallbackDescription(paramId);
  },

  hasOfficialDescription: (paramId: string) => {
    const { metadata } = get();
    if (!metadata) return false;
    const meta = metadata[paramId];
    return Boolean(meta?.description);
  },

  validateParameter: (paramId: string, value: number) => {
    const { metadata } = get();
    const meta = metadata?.[paramId];
    return validateParameterValue(value, meta);
  },

  getParameterMetadata: (paramId: string) => {
    const { metadata } = get();
    const meta = metadata?.[paramId];
    if (!meta) return null;
    return {
      range: meta.range,
      values: meta.values,
      units: meta.units,
      bitmask: meta.bitmask,
      rebootRequired: meta.rebootRequired,
    };
  },

  isRebootRequired: (paramId: string) => {
    const { metadata } = get();
    return metadata?.[paramId]?.rebootRequired === true;
  },

  isFavourite: (paramId: string) => {
    return get().favourites.has(paramId);
  },

  favouriteCount: () => {
    const { favourites, parameters } = get();
    // Only count favourites that exist in the current parameter set
    let count = 0;
    for (const id of favourites) {
      if (parameters.has(id)) count++;
    }
    return count;
  },

  fetchParameters: async () => {
    set({ isLoading: true, error: null, progress: null });

    const result = await window.electronAPI?.requestAllParameters();

    if (!result?.success) {
      set({
        isLoading: false,
        error: result?.error ?? 'Failed to request parameters'
      });
    }
    // Actual loading continues via IPC events
  },

  fetchMetadata: async (mavType: number) => {
    // Skip if already loaded or loading
    if (get().metadata || get().isLoadingMetadata) return;

    set({ isLoadingMetadata: true });

    const result = await window.electronAPI?.fetchParameterMetadata(mavType);

    if (result?.success && result.metadata) {
      set({ metadata: result.metadata, isLoadingMetadata: false });
    } else {
      // Non-fatal - just log and continue without metadata
      console.warn('Failed to load parameter metadata:', result?.error);
      set({ isLoadingMetadata: false });
    }
  },

  setParameter: async (paramId, value) => {
    const param = get().parameters.get(paramId);
    // Use existing type if known, otherwise default to REAL32 (9) for ArduPilot
    const paramType = param?.type ?? 9;

    const result = await window.electronAPI?.setParameter(paramId, value, paramType);

    if (!result?.success) {
      set({ error: result?.error ?? 'Failed to set parameter' });
      return false;
    }

    // Track that this param was user-initiated (so updateParameter preserves originalValue)
    userModifiedParams.add(paramId);

    // Update local state optimistically
    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(paramId);
      if (existing) {
        params.set(paramId, {
          ...existing,
          value,
          isModified: existing.originalValue !== value,
        });
      } else {
        // Parameter wasn't in cache - add it now
        params.set(paramId, {
          id: paramId,
          value,
          type: paramType,
          index: -1,
          originalValue: value,
          isModified: false,
          isReadOnly: false,
        });
      }
      return { parameters: params, paramCount: params.size };
    });

    return true;
  },

  updateParameter: (param) => {
    // Check if this PARAM_VALUE is a response to a user-initiated setParameter call
    const isUserEdit = userModifiedParams.has(param.paramId);
    if (isUserEdit) {
      userModifiedParams.delete(param.paramId);
    }

    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(param.paramId);
      const readOnly = isReadOnlyParameter(param.paramId);

      // For user edits: preserve originalValue so the param shows as modified
      // For FC-initiated changes (e.g. MIS_TOTAL after mission upload): update baseline
      const originalValue = isUserEdit
        ? (existing?.originalValue ?? param.paramValue)
        : param.paramValue;

      params.set(param.paramId, {
        id: param.paramId,
        value: param.paramValue,
        type: param.paramType,
        index: param.paramIndex,
        originalValue,
        isModified: isUserEdit ? originalValue !== param.paramValue : false,
        isReadOnly: readOnly,
      });

      return { parameters: params, paramCount: params.size };
    });
  },

  setProgress: (progress) => set({ progress }),

  setComplete: () => {
    // Full download complete — clear any pending user edits tracker
    userModifiedParams.clear();
    set(state => {
      // After a full download, the FC's values are ground truth.
      // Reset all baselines so sensor/calibration params the FC updated
      // internally don't show as "modified" (all setParameter writes are immediate).
      const params = new Map(state.parameters);
      for (const [id, param] of params) {
        if (param.isModified) {
          params.set(id, { ...param, originalValue: param.value, isModified: false });
        }
      }
      return {
        parameters: params, paramCount: params.size,
        isLoading: false,
        progress: null,
        error: null,
        lastRefresh: Date.now(),
      };
    });
  },

  setError: (error) => set({ error, isLoading: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedGroup: (group) => set({ selectedGroup: group }),

  setShowOnlyModified: (show) => set({ showOnlyModified: show }),

  toggleShowOnlyModified: () => set(state => ({ showOnlyModified: !state.showOnlyModified })),

  toggleShowOnlyFavourites: () => set(state => ({ showOnlyFavourites: !state.showOnlyFavourites })),

  toggleFavourite: (paramId: string) => {
    set(state => {
      const next = new Set(state.favourites);
      if (next.has(paramId)) {
        next.delete(paramId);
      } else {
        next.add(paramId);
      }
      saveFavourites(next);
      // Auto-disable favourites filter when no favourites remain
      const disableFilter = next.size === 0 && state.showOnlyFavourites;
      return { favourites: next, ...(disableFilter ? { showOnlyFavourites: false } : {}) };
    });
  },

  setSortColumn: (column) => set({ sortColumn: column }),

  toggleSort: (column) => set(state => {
    if (state.sortColumn === column) {
      // Toggle direction if same column
      return { sortDirection: state.sortDirection === 'asc' ? 'desc' : 'asc' };
    }
    // New column, default to ascending
    return { sortColumn: column, sortDirection: 'asc' };
  }),

  revertParameter: (paramId) => {
    set(state => {
      const params = new Map(state.parameters);
      const param = params.get(paramId);

      if (param && param.originalValue !== undefined) {
        params.set(paramId, {
          ...param,
          value: param.originalValue,
          isModified: false,
        });
      }

      return { parameters: params, paramCount: params.size };
    });
  },

  markAllAsSaved: () => {
    set(state => {
      const params = new Map(state.parameters);

      // Reset originalValue to current value for all params
      for (const [id, param] of params) {
        if (param.isModified) {
          params.set(id, {
            ...param,
            originalValue: param.value,
            isModified: false,
          });
        }
      }

      return { parameters: params, paramCount: params.size, showOnlyModified: false };
    });
  },

  // File compare actions
  loadFileForCompare: (fileParams, fileVehicleType) => {
    const { parameters } = get();
    const diffs: FileParamDiff[] = [];
    let skipped = 0;

    for (const fp of fileParams) {
      const existing = parameters.get(fp.id);
      if (!existing) { skipped++; continue; } // Skip params not on the vehicle
      if (existing.isReadOnly) continue; // Skip read-only params

      // Only include if values actually differ
      if (existing.value !== fp.value) {
        diffs.push({
          paramId: fp.id,
          currentValue: existing.value,
          fileValue: fp.value,
          type: existing.type,
          selected: true, // Select all by default
        });
      }
    }

    // Sort alphabetically
    diffs.sort((a, b) => a.paramId.localeCompare(b.paramId));

    set({
      showCompareModal: true,
      fileParamDiffs: diffs,
      fileSkippedCount: skipped,
      fileTotalCount: fileParams.length,
      fileVehicleType: fileVehicleType ?? null,
    });
  },

  closeCompareModal: () => {
    set({ showCompareModal: false, fileParamDiffs: [], fileSkippedCount: 0, fileTotalCount: 0, fileVehicleType: null, applyProgress: null });
  },

  toggleDiffSelection: (paramId) => {
    set(state => ({
      fileParamDiffs: state.fileParamDiffs.map(d =>
        d.paramId === paramId ? { ...d, selected: !d.selected } : d
      ),
    }));
  },

  selectAllDiffs: () => {
    set(state => ({
      fileParamDiffs: state.fileParamDiffs.map(d => ({ ...d, selected: true })),
    }));
  },

  deselectAllDiffs: () => {
    set(state => ({
      fileParamDiffs: state.fileParamDiffs.map(d => ({ ...d, selected: false })),
    }));
  },

  applySelectedFileParams: async () => {
    const { fileParamDiffs } = get();
    const selected = fileParamDiffs.filter(d => d.selected);
    if (selected.length === 0) return { applied: 0, failed: 0 };

    set({ isApplyingFileParams: true, applyProgress: { applied: 0, total: selected.length } });

    let applied = 0;
    let failed = 0;

    for (const diff of selected) {
      const result = await window.electronAPI?.setParameter(diff.paramId, diff.fileValue, diff.type);
      if (result?.success) {
        applied++;
        // Update local state
        set(state => {
          const params = new Map(state.parameters);
          const existing = params.get(diff.paramId);
          if (existing) {
            params.set(diff.paramId, {
              ...existing,
              value: diff.fileValue,
              isModified: existing.originalValue !== diff.fileValue,
            });
          }
          return {
            parameters: params, paramCount: params.size,
            applyProgress: { applied, total: selected.length },
          };
        });
      } else {
        failed++;
      }
    }

    set({ isApplyingFileParams: false, showCompareModal: false, fileParamDiffs: [], fileSkippedCount: 0, fileTotalCount: 0, fileVehicleType: null, applyProgress: null });
    return { applied, failed };
  },

  reset: () => { userModifiedParams.clear(); set({
    parameters: new Map(),
    paramCount: 0,
    metadata: null,
    isLoading: false,
    isLoadingMetadata: false,
    progress: null,
    error: null,
    lastRefresh: 0,
    searchQuery: '',
    selectedGroup: 'all',
    showOnlyModified: false,
    showOnlyFavourites: false,
    // NOTE: favourites are NOT reset - they persist across connections
    sortColumn: 'name',
    sortDirection: 'asc',
    showCompareModal: false,
    fileParamDiffs: [],
    fileSkippedCount: 0,
    fileTotalCount: 0,
    fileVehicleType: null,
    isApplyingFileParams: false,
    applyProgress: null,
  }); },
}));
