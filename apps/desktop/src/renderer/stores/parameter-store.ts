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
  sortColumn: SortColumn;
  sortDirection: SortDirection;

  // File compare state
  showCompareModal: boolean;
  fileParamDiffs: FileParamDiff[];
  isApplyingFileParams: boolean;
  applyProgress: { applied: number; total: number } | null;

  // Computed
  filteredParameters: () => ParameterWithMeta[];
  modifiedCount: () => number;
  modifiedParameters: () => ParameterWithMeta[];
  groupCounts: () => Map<string, number>;
  getDescription: (paramId: string) => string;
  hasOfficialDescription: (paramId: string) => boolean;
  validateParameter: (paramId: string, value: number) => ValidationResult;
  getParameterMetadata: (paramId: string) => { range?: { min: number; max: number }; values?: Record<number, string>; units?: string; bitmask?: Record<number, string> } | null;

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
  setSortColumn: (column: SortColumn) => void;
  toggleSort: (column: SortColumn) => void;
  revertParameter: (paramId: string) => void;
  markAllAsSaved: () => void;
  reset: () => void;

  // File compare actions
  loadFileForCompare: (fileParams: Array<{ id: string; value: number }>) => void;
  closeCompareModal: () => void;
  toggleDiffSelection: (paramId: string) => void;
  selectAllDiffs: () => void;
  deselectAllDiffs: () => void;
  applySelectedFileParams: () => Promise<{ applied: number; failed: number }>;
}

export const useParameterStore = create<ParameterStore>((set, get) => ({
  parameters: new Map(),
  metadata: null,
  isLoading: false,
  isLoadingMetadata: false,
  progress: null,
  error: null,
  lastRefresh: 0,
  searchQuery: '',
  selectedGroup: 'all',
  showOnlyModified: false,
  sortColumn: 'name' as SortColumn,
  sortDirection: 'asc' as SortDirection,

  // File compare state
  showCompareModal: false,
  fileParamDiffs: [],
  isApplyingFileParams: false,
  applyProgress: null,

  filteredParameters: () => {
    const { parameters, searchQuery, selectedGroup, showOnlyModified, sortColumn, sortDirection } = get();
    let params = Array.from(parameters.values());

    // Filter by group first
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
    };
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
          isModified: true,
          isReadOnly: false,
        });
      }
      return { parameters: params };
    });

    return true;
  },

  updateParameter: (param) => {
    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(param.paramId);
      const readOnly = isReadOnlyParameter(param.paramId);

      params.set(param.paramId, {
        id: param.paramId,
        value: param.paramValue,
        type: param.paramType,
        index: param.paramIndex,
        originalValue: existing?.originalValue ?? param.paramValue,
        isModified: existing ? existing.originalValue !== param.paramValue : false,
        isReadOnly: readOnly,
      });

      return { parameters: params };
    });
  },

  setProgress: (progress) => set({ progress }),

  setComplete: () => set({
    isLoading: false,
    progress: null,
    error: null,
    lastRefresh: Date.now()
  }),

  setError: (error) => set({ error, isLoading: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedGroup: (group) => set({ selectedGroup: group }),

  setShowOnlyModified: (show) => set({ showOnlyModified: show }),

  toggleShowOnlyModified: () => set(state => ({ showOnlyModified: !state.showOnlyModified })),

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

      return { parameters: params };
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

      return { parameters: params, showOnlyModified: false };
    });
  },

  // File compare actions
  loadFileForCompare: (fileParams) => {
    const { parameters } = get();
    const diffs: FileParamDiff[] = [];

    for (const fp of fileParams) {
      const existing = parameters.get(fp.id);
      if (!existing) continue; // Skip params not on the vehicle
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

    set({ showCompareModal: true, fileParamDiffs: diffs });
  },

  closeCompareModal: () => {
    set({ showCompareModal: false, fileParamDiffs: [], applyProgress: null });
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
            parameters: params,
            applyProgress: { applied, total: selected.length },
          };
        });
      } else {
        failed++;
      }
    }

    set({ isApplyingFileParams: false, showCompareModal: false, fileParamDiffs: [], applyProgress: null });
    return { applied, failed };
  },

  reset: () => set({
    parameters: new Map(),
    metadata: null,
    isLoading: false,
    isLoadingMetadata: false,
    progress: null,
    error: null,
    lastRefresh: 0,
    searchQuery: '',
    selectedGroup: 'all',
    showOnlyModified: false,
    sortColumn: 'name',
    sortDirection: 'asc',
    showCompareModal: false,
    fileParamDiffs: [],
    isApplyingFileParams: false,
    applyProgress: null,
  }),
}));
