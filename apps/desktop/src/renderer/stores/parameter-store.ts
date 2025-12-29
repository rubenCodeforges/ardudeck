import { create } from 'zustand';
import type { Parameter, ParameterWithMeta, ParameterProgress, ParamValuePayload } from '../../shared/parameter-types.js';
import { parameterBelongsToGroup } from '../../shared/parameter-groups.js';
import type { ParameterMetadataStore } from '../../shared/parameter-metadata.js';

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

  // Computed
  filteredParameters: () => ParameterWithMeta[];
  modifiedCount: () => number;
  groupCounts: () => Map<string, number>;
  getDescription: (paramId: string) => string;

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
  revertParameter: (paramId: string) => void;
  reset: () => void;
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

  filteredParameters: () => {
    const { parameters, searchQuery, selectedGroup } = get();
    let params = Array.from(parameters.values());

    // Filter by group first
    if (selectedGroup !== 'all') {
      params = params.filter(p => parameterBelongsToGroup(p.id, selectedGroup));
    }

    // Then filter by search query
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      params = params.filter(p => p.id.toLowerCase().includes(query));
    }

    return params.sort((a, b) => a.id.localeCompare(b.id));
  },

  modifiedCount: () => {
    const { parameters } = get();
    return Array.from(parameters.values()).filter(p => p.isModified).length;
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
    if (!metadata) return '';
    const meta = metadata[paramId];
    return meta?.description || '';
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
    if (!param) return false;

    const result = await window.electronAPI?.setParameter(paramId, value, param.type);

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
      }
      return { parameters: params };
    });

    return true;
  },

  updateParameter: (param) => {
    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(param.paramId);

      params.set(param.paramId, {
        id: param.paramId,
        value: param.paramValue,
        type: param.paramType,
        index: param.paramIndex,
        originalValue: existing?.originalValue ?? param.paramValue,
        isModified: existing ? existing.originalValue !== param.paramValue : false,
      });

      return { parameters: params };
    });
  },

  setProgress: (progress) => set({ progress }),

  setComplete: () => set({
    isLoading: false,
    progress: null,
    lastRefresh: Date.now()
  }),

  setError: (error) => set({ error, isLoading: false }),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedGroup: (group) => set({ selectedGroup: group }),

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
  }),
}));
