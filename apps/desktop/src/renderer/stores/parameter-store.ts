import { create } from 'zustand';
import type { Parameter, ParameterWithMeta, ParameterProgress, ParamValuePayload } from '../../shared/parameter-types.js';

interface ParameterStore {
  // State
  parameters: Map<string, ParameterWithMeta>;
  isLoading: boolean;
  progress: ParameterProgress | null;
  error: string | null;
  lastRefresh: number;
  searchQuery: string;

  // Computed
  filteredParameters: () => ParameterWithMeta[];
  modifiedCount: () => number;

  // Actions
  fetchParameters: () => Promise<void>;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  updateParameter: (param: ParamValuePayload) => void;
  setProgress: (progress: ParameterProgress) => void;
  setComplete: () => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  revertParameter: (paramId: string) => void;
  reset: () => void;
}

export const useParameterStore = create<ParameterStore>((set, get) => ({
  parameters: new Map(),
  isLoading: false,
  progress: null,
  error: null,
  lastRefresh: 0,
  searchQuery: '',

  filteredParameters: () => {
    const { parameters, searchQuery } = get();
    const params = Array.from(parameters.values());

    if (!searchQuery.trim()) {
      return params.sort((a, b) => a.id.localeCompare(b.id));
    }

    const query = searchQuery.toLowerCase();
    return params
      .filter(p => p.id.toLowerCase().includes(query))
      .sort((a, b) => a.id.localeCompare(b.id));
  },

  modifiedCount: () => {
    const { parameters } = get();
    return Array.from(parameters.values()).filter(p => p.isModified).length;
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
    isLoading: false,
    progress: null,
    error: null,
    lastRefresh: 0,
    searchQuery: '',
  }),
}));
