import { create } from 'zustand';
import type { Parameter, ParameterWithMeta, ParameterProgress, ParamValuePayload } from '../../shared/parameter-types.js';
import { isReadOnlyParameter, generateFallbackDescription } from '../../shared/parameter-types.js';
import { parameterBelongsToGroup } from '../../shared/parameter-groups.js';
import { validateParameterValue, vehicleTypeToMavType, REBOOT_REQUIRED_OVERRIDES, type ParameterMetadataStore, type ValidationResult, type VehicleType } from '../../shared/parameter-metadata.js';
import { createSearchRegex } from '../../shared/search-utils.js';
import { useConnectionStore } from './connection-store';

export type SortColumn = 'name' | 'status';
export type SortDirection = 'asc' | 'desc';

export interface FileParamDiff {
  paramId: string;
  currentValue: number;
  fileValue: number;
  type: number;
  selected: boolean;
  /** Optional caption shown below the param name (e.g. Claude's reasoning). */
  note?: string;
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

/**
 * Whether a FULL parameter set has been pulled from the vehicle.
 *
 * `paramCount > 0` does not answer this: connect-time batch reads (safety
 * monitor IMAX/trim, Q_ENABLE, calibration tracking) land real PARAM_VALUEs in
 * the store, so a handful of parameters can be present with no download having
 * run. Guarding a fetch on the count then skips it forever and leaves the PID
 * tab staring at six unrelated parameters.
 */
export type ParamDownloadState = 'idle' | 'loading' | 'complete' | 'failed';

interface ParameterStore {
  // State
  parameters: Map<string, ParameterWithMeta>;
  downloadState: ParamDownloadState;
  metadata: ParameterMetadataStore | null;
  isLoading: boolean;
  isLoadingMetadata: boolean;
  progress: ParameterProgress | null;
  error: string | null;
  lastRefresh: number;
  searchQuery: string;
  selectedGroup: string;
  showOnlyModified: boolean;
  showOnlyNonDefault: boolean;
  showOnlyFavourites: boolean;
  favourites: Set<string>;
  sortColumn: SortColumn;
  sortDirection: SortDirection;

  // File compare state
  showCompareModal: boolean;
  fileParamDiffs: FileParamDiff[];
  fileSkippedCount: number;
  fileSkippedParams: Array<{ id: string; value: number }>;
  fileTotalCount: number;
  fileVehicleType: string | null;
  isApplyingFileParams: boolean;
  applyProgress: { applied: number; total: number } | null;

  // Post-apply result — drives the summary dialog in ParameterTable
  fileApplyResult: {
    applied: number;
    failed: number;
    rebootRequired: string[];
    skippedParams: Array<{ id: string; value: number }>;
  } | null;

  // Pending retry params for after reboot
  pendingRetryParams: Array<{ id: string; value: number }>;

  // Offline mode state
  offlineMode: boolean;
  offlineFilePath: string | null;
  offlineVehicleType: string | null;
  offlineHasUnsavedChanges: boolean;

  // Computed
  paramCount: number;
  /** True only once a full download has landed, not merely some parameters. */
  hasFullParameterSet: () => boolean;
  /** True when an automatic fetch should start: nothing loaded and none running. */
  needsParameterFetch: () => boolean;
  filteredParameters: () => ParameterWithMeta[];
  modifiedCount: () => number;
  modifiedParameters: () => ParameterWithMeta[];
  groupCounts: () => Map<string, number>;
  favouriteCount: () => number;
  nonDefaultCount: () => number;
  hasDefaults: () => boolean;
  getDescription: (paramId: string) => string;
  hasOfficialDescription: (paramId: string) => boolean;
  validateParameter: (paramId: string, value: number) => ValidationResult;
  getParameterMetadata: (paramId: string) => { range?: { min: number; max: number }; increment?: number; values?: Record<number, string>; units?: string; bitmask?: Record<number, string>; rebootRequired?: boolean; volatile?: boolean } | null;
  isRebootRequired: (paramId: string) => boolean;
  isFavourite: (paramId: string) => boolean;

  // Actions
  fetchParameters: (options?: { force?: boolean }) => Promise<void>;
  fetchMetadata: (mavType: number) => Promise<void>;
  setMetadata: (metadata: ParameterMetadataStore) => void;
  setParameter: (paramId: string, value: number) => Promise<boolean>;
  setParameterImmediate: (paramId: string, value: number) => Promise<boolean>;
  commitStagedParams: () => Promise<{ written: number; failed: string[] }>;
  updateParameter: (param: ParamValuePayload) => void;
  bulkLoadParameters: (params: ParamValuePayload[]) => void;
  setProgress: (progress: ParameterProgress) => void;
  setComplete: () => void;
  setError: (error: string | null) => void;
  setSearchQuery: (query: string) => void;
  setSelectedGroup: (group: string) => void;
  setShowOnlyModified: (show: boolean) => void;
  toggleShowOnlyModified: () => void;
  toggleShowOnlyNonDefault: () => void;
  toggleShowOnlyFavourites: () => void;
  toggleFavourite: (paramId: string) => void;
  setSortColumn: (column: SortColumn) => void;
  toggleSort: (column: SortColumn) => void;
  revertParameter: (paramId: string) => void;
  markAllAsSaved: () => void;
  reset: () => void;

  // Offline mode actions
  loadOfflineFile: () => Promise<boolean>;
  saveOfflineFile: () => Promise<boolean>;
  saveOfflineFileAs: () => Promise<boolean>;
  setOfflineVehicleType: (vehicleType: string) => Promise<void>;
  closeOfflineMode: () => void;
  setOfflineParameter: (paramId: string, value: number) => void;

  // File compare actions
  loadFileForCompare: (fileParams: Array<{ id: string; value: number }>, fileVehicleType?: string) => void;
  closeCompareModal: () => void;
  toggleDiffSelection: (paramId: string) => void;
  selectAllDiffs: () => void;
  deselectAllDiffs: () => void;
  applySelectedFileParams: () => Promise<{ applied: number; failed: number; rebootRequired: string[]; skippedParams: Array<{ id: string; value: number }> }>;

  // Post-apply actions
  setPendingRetryParams: (params: Array<{ id: string; value: number }>) => void;
  retryPendingParams: () => Promise<{ applied: number; failed: number; rebootRequired: string[]; stillPending: Array<{ id: string; value: number }> }>;
  clearFileApplyResult: () => void;
  clearPendingRetryParams: () => void;
}

/**
 * Float32-aware equality check for ArduPilot parameters.
 * ArduPilot stores params as float32 but JS uses float64. Values like 0.135
 * become 0.13500000536441803 after the float32→float64 round-trip.
 * Math.fround() normalizes both sides to the nearest float32 representation.
 */
function f32Equal(a: number, b: number): boolean {
  return Math.fround(a) === Math.fround(b);
}

/**
 * Clean a JS double for storage as an ArduPilot REAL32 param.
 * Math.fround mirrors the float32 truncation the FC will perform; toPrecision(7)
 * + parseFloat strips the float64 noise that survives that truncation
 * (e.g. 4 * 3.8 = 15.200000000000001 → 15.2 instead of 15.199999809265137).
 * Integers and non-REAL32 types pass through unchanged.
 */
function cleanFloat32(value: number, paramType: number): number {
  if (paramType !== 9) return value;
  if (Number.isInteger(value)) return value;
  return parseFloat(Math.fround(value).toPrecision(7));
}

// Tracks params the user has actively edited via setParameter (pending FC confirmation)
const userModifiedParams = new Set<string>();

// PX4 staged edits: held locally, sent only when the user confirms the standard
// Write Parameters to Flash dialog (PX4 persists PARAM_SET immediately, so the
// ArduPilot write-now/flash-later flow would skip the review step).
const stagedParams = new Set<string>();

/** Backoff for automatic parameter fetches: doubles per failure to 30 s, and
 * resets the moment a request is accepted. A manual retry passes force. */
let paramFetchFailures = 0;
let paramFetchCooldownUntil = 0;

export function resetParameterFetchBackoff(): void {
  paramFetchFailures = 0;
  paramFetchCooldownUntil = 0;
}

export const useParameterStore = create<ParameterStore>((set, get) => ({
  parameters: new Map(),
  paramCount: 0,
  downloadState: 'idle',
  metadata: null,
  isLoading: false,
  isLoadingMetadata: false,
  progress: null,
  error: null,
  lastRefresh: 0,
  searchQuery: '',
  selectedGroup: 'all',
  showOnlyModified: false,
  showOnlyNonDefault: false,
  showOnlyFavourites: false,
  favourites: loadFavourites(),
  sortColumn: 'name' as SortColumn,
  sortDirection: 'asc' as SortDirection,

  // Offline mode state
  offlineMode: false,
  offlineFilePath: null,
  offlineVehicleType: null,
  offlineHasUnsavedChanges: false,

  // File compare state
  showCompareModal: false,
  fileParamDiffs: [],
  fileSkippedCount: 0,
  fileSkippedParams: [],
  fileTotalCount: 0,
  fileVehicleType: null,
  isApplyingFileParams: false,
  applyProgress: null,
  fileApplyResult: null,
  pendingRetryParams: [],

  filteredParameters: () => {
    const { parameters, searchQuery, selectedGroup, showOnlyModified, showOnlyNonDefault, showOnlyFavourites, favourites, sortColumn, sortDirection } = get();
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

    // Filter by non-default. If firmware default is known (FTP param.pck),
    // compare against it. Otherwise fall back to in-session modifications
    // so the filter still does something useful on SITL / no-FTP setups.
    if (showOnlyNonDefault) {
      params = params.filter(p => {
        if (p.isReadOnly) return false;
        if (p.defaultValue !== undefined) return !f32Equal(p.value, p.defaultValue);
        return p.isModified;
      });
    }

    // Then filter by search query (supports regex patterns like `serial[56]_baud`)
    if (searchQuery.trim()) {
      const regex = createSearchRegex(searchQuery);
      params = params.filter(p => regex.test(p.id));
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
      increment: meta.increment,
      values: meta.values,
      units: meta.units,
      bitmask: meta.bitmask,
      rebootRequired: meta.rebootRequired,
      volatile: meta.volatile,
    };
  },

  isRebootRequired: (paramId: string) => {
    const { metadata } = get();
    // Metadata flag OR our curated list of params ArduPilot forgot to tag.
    return metadata?.[paramId]?.rebootRequired === true || REBOOT_REQUIRED_OVERRIDES.has(paramId);
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

  nonDefaultCount: () => {
    const { parameters } = get();
    let count = 0;
    for (const p of parameters.values()) {
      if (p.isReadOnly) continue;
      if (p.defaultValue !== undefined) {
        if (!f32Equal(p.value, p.defaultValue)) count++;
      } else if (p.isModified) {
        count++;
      }
    }
    return count;
  },

  hasDefaults: () => {
    const { parameters } = get();
    for (const p of parameters.values()) {
      if (p.defaultValue !== undefined) return true;
    }
    return false;
  },

  hasFullParameterSet: () => get().downloadState === 'complete',

  needsParameterFetch: () => {
    const state = get().downloadState;
    return state === 'idle' || state === 'failed';
  },

  fetchParameters: async (options) => {
    // A failed fetch leaves the store in 'failed', which is what the auto-fetch
    // effect watches, so without a cooldown a link that answers instantly with
    // an error (a rebooting FC behind a backpack, where the transport has no
    // remote endpoint yet) turns into a retry storm at IPC speed.
    const now = Date.now();
    if (!options?.force && now < paramFetchCooldownUntil) return;

    set({ isLoading: true, downloadState: 'loading', error: null, progress: null });

    const result = await window.electronAPI?.requestAllParameters();

    if (!result?.success) {
      paramFetchFailures += 1;
      paramFetchCooldownUntil = now + Math.min(30_000, 1_000 * 2 ** (paramFetchFailures - 1));
      set({
        isLoading: false,
        downloadState: 'failed',
        error: result?.error ?? 'Failed to request parameters'
      });
    } else {
      paramFetchFailures = 0;
      paramFetchCooldownUntil = 0;
    }
    // Actual loading continues via IPC events
  },

  /**
   * Replace the metadata wholesale. Used when a PX4 vehicle finishes serving
   * its own definitions, which supersede whatever we started with.
   */
  setMetadata: (metadata: ParameterMetadataStore) => {
    set({ metadata, isLoadingMetadata: false });
    const params = new Map(get().parameters);
    let changed = false;
    for (const [id, param] of params) {
      if (!param.isReadOnly && metadata[id]?.readOnly) {
        params.set(id, { ...param, isReadOnly: true });
        changed = true;
      }
    }
    if (changed) set({ parameters: params });
  },

  fetchMetadata: async (mavType: number) => {
    // Skip if already loaded or loading
    if (get().metadata || get().isLoadingMetadata) return;

    set({ isLoadingMetadata: true });

    const result = await window.electronAPI?.fetchParameterMetadata(mavType);

    if (result?.success && result.metadata) {
      set({ metadata: result.metadata, isLoadingMetadata: false });

      // Re-scan existing params for newly-discovered readonly flags from metadata
      const params = new Map(get().parameters);
      let changed = false;
      for (const [id, param] of params) {
        if (!param.isReadOnly && result.metadata[id]?.readOnly) {
          params.set(id, { ...param, isReadOnly: true });
          changed = true;
        }
      }
      if (changed) set({ parameters: params });
    } else {
      // Non-fatal - just log and continue without metadata
      console.warn('Failed to load parameter metadata:', result?.error);
      set({ isLoadingMetadata: false });
    }
  },

  setParameter: async (paramId, rawValue) => {
    const param = get().parameters.get(paramId);
    const paramType = param?.type ?? 9;
    const value = cleanFloat32(rawValue, paramType);

    // In offline mode, just update local state - no IPC
    if (get().offlineMode) {
      get().setOfflineParameter(paramId, value);
      return true;
    }

    // PX4 UI edits stage locally; commitStagedParams sends them after the
    // Write Parameters to Flash confirm. Unknown params (not in cache) fall
    // through to an immediate write since there is nothing to diff against.
    if (useConnectionStore.getState().connectionState.firmware === 'px4' && param) {
      set(state => {
        const params = new Map(state.parameters);
        const existing = params.get(paramId)!;
        const isModified = !f32Equal(existing.originalValue ?? existing.value, value);
        if (isModified) stagedParams.add(paramId);
        else stagedParams.delete(paramId);
        params.set(paramId, { ...existing, value, isModified });
        return { parameters: params };
      });
      return true;
    }

    return get().setParameterImmediate(paramId, value);
  },

  setParameterImmediate: async (paramId, rawValue) => {
    const param = get().parameters.get(paramId);
    // Use existing type if known, otherwise default to REAL32 (9) for ArduPilot
    const paramType = param?.type ?? 9;
    const value = cleanFloat32(rawValue, paramType);

    // In offline mode, just update local state - no IPC
    if (get().offlineMode) {
      get().setOfflineParameter(paramId, value);
      return true;
    }

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
          isModified: !f32Equal(existing.originalValue ?? existing.value, value),
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

  commitStagedParams: async () => {
    const modified = get().modifiedParameters();
    const failed: string[] = [];
    let written = 0;
    for (const p of modified) {
      const result = await window.electronAPI?.setParameter(p.id, p.value, p.type ?? 9);
      if (result?.success) {
        stagedParams.delete(p.id);
        // Preserve the modified baseline until the caller marks all as saved,
        // so a partial failure leaves the unwritten rows still flagged.
        userModifiedParams.add(p.id);
        written++;
      } else {
        failed.push(p.id);
      }
    }
    return { written, failed };
  },

  updateParameter: (param) => {
    // Check if this PARAM_VALUE is a response to a user-initiated setParameter call
    const isUserEdit = userModifiedParams.has(param.paramId);
    if (isUserEdit) {
      userModifiedParams.delete(param.paramId);
    }

    // A staged PX4 edit exists locally and has not been written yet; an
    // unsolicited PARAM_VALUE must not clobber it. Absorb the FC value as the
    // new baseline and keep the staged value on top.
    if (!isUserEdit && stagedParams.has(param.paramId)) {
      set(state => {
        const params = new Map(state.parameters);
        const existing = params.get(param.paramId);
        if (!existing) return {};
        const fcValue = cleanFloat32(param.paramValue, param.paramType);
        params.set(param.paramId, {
          ...existing,
          originalValue: fcValue,
          index: param.paramIndex,
          isModified: !f32Equal(fcValue, existing.value),
        });
        return { parameters: params };
      });
      return;
    }

    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(param.paramId);
      const readOnly = isReadOnlyParameter(param.paramId) || (state.metadata?.[param.paramId]?.readOnly === true);

      // Normalize the FC's float32 readback here, at ingestion, so the raw IEEE
      // noise (0.95 -> 0.949999988079071) never enters the store. Every consumer
      // then sees a clean value whether or not it routes through formatParamValue.
      const value = cleanFloat32(param.paramValue, param.paramType);

      // For user edits: preserve originalValue so the param shows as modified
      // For FC-initiated changes (e.g. MIS_TOTAL after mission upload): update baseline
      const originalValue = isUserEdit
        ? (existing?.originalValue ?? value)
        : value;

      params.set(param.paramId, {
        id: param.paramId,
        value,
        type: param.paramType,
        index: param.paramIndex,
        originalValue,
        defaultValue: param.defaultValue ?? existing?.defaultValue,
        isModified: isUserEdit ? !f32Equal(originalValue, value) : false,
        isReadOnly: readOnly,
      });

      return { parameters: params, paramCount: params.size };
    });
  },

  bulkLoadParameters: (params) => {
    // FTP fast path: build entire parameter map in one state update
    userModifiedParams.clear();
    stagedParams.clear();
    const { metadata } = get();
    const newParams = new Map<string, ParameterWithMeta>();
    for (const p of params) {
      const value = cleanFloat32(p.paramValue, p.paramType);
      newParams.set(p.paramId, {
        id: p.paramId,
        value,
        type: p.paramType,
        index: p.paramIndex,
        originalValue: value,
        defaultValue: p.defaultValue,
        isModified: false,
        isReadOnly: isReadOnlyParameter(p.paramId) || (metadata?.[p.paramId]?.readOnly === true),
      });
    }
    set({
      parameters: newParams,
      paramCount: newParams.size,
      downloadState: 'complete',
      isLoading: false,
      progress: null,
      error: null,
      lastRefresh: Date.now(),
      // Clear offline mode when FC params arrive
      offlineMode: false,
      offlineFilePath: null,
      offlineVehicleType: null,
      offlineHasUnsavedChanges: false,
    });
  },

  setProgress: (progress) => set({ progress }),

  setComplete: () => {
    // Full download complete — clear any pending user edits tracker
    userModifiedParams.clear();
    stagedParams.clear();
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
        downloadState: 'complete' as const,
        isLoading: false,
        progress: null,
        error: null,
        lastRefresh: Date.now(),
      };
    });
  },

  setError: (error) => set(state => ({
    error,
    isLoading: false,
    // A download that errored has not delivered a full set, so the next connect
    // (or a Retry) must be allowed to try again.
    downloadState: state.downloadState === 'loading' ? 'failed' : state.downloadState,
  })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  setSelectedGroup: (group) => set({ selectedGroup: group }),

  setShowOnlyModified: (show) => set({ showOnlyModified: show }),

  toggleShowOnlyModified: () => set(state => ({ showOnlyModified: !state.showOnlyModified })),

  toggleShowOnlyNonDefault: () => set(state => ({ showOnlyNonDefault: !state.showOnlyNonDefault })),

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
    stagedParams.delete(paramId);
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
    stagedParams.clear();
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

  // Offline mode actions
  loadOfflineFile: async () => {
    const result = await window.electronAPI?.loadParamsFromFile();
    if (!result?.success || !result.params) return false;

    const filePath = result.filePath ?? null;
    const vehicleType = result.vehicleType ?? null;

    // Build parameter map from file data
    const newParams = new Map<string, ParameterWithMeta>();
    for (const p of result.params) {
      newParams.set(p.id, {
        id: p.id,
        value: p.value,
        type: 9, // REAL32 - standard ArduPilot param type
        index: -1,
        originalValue: p.value,
        isModified: false,
        isReadOnly: isReadOnlyParameter(p.id),
      });
    }

    set({
      parameters: newParams,
      paramCount: newParams.size,
      offlineMode: true,
      offlineFilePath: filePath,
      offlineVehicleType: vehicleType,
      offlineHasUnsavedChanges: false,
      isLoading: false,
      error: null,
      metadata: null,
      searchQuery: '',
      selectedGroup: 'all',
      showOnlyModified: false,
    });

    // Auto-fetch metadata if vehicle type is known
    if (vehicleType) {
      const mavType = vehicleTypeToMavType(vehicleType);
      if (mavType !== null) {
        get().fetchMetadata(mavType);
      }
    }

    return true;
  },

  saveOfflineFile: async () => {
    const { offlineFilePath, parameters, offlineVehicleType } = get();
    if (!offlineFilePath) return get().saveOfflineFileAs();

    const params = Array.from(parameters.values()).map(p => ({ id: p.id, value: p.value }));
    const result = await window.electronAPI?.saveParamsToPath(params, offlineFilePath, offlineVehicleType ?? undefined);

    if (result?.success) {
      // Reset modification tracking
      set(state => {
        const updated = new Map(state.parameters);
        for (const [id, param] of updated) {
          if (param.isModified) {
            updated.set(id, { ...param, originalValue: param.value, isModified: false });
          }
        }
        return { parameters: updated, paramCount: updated.size, offlineHasUnsavedChanges: false };
      });
      return true;
    }
    return false;
  },

  saveOfflineFileAs: async () => {
    const { parameters, offlineVehicleType } = get();
    const params = Array.from(parameters.values()).map(p => ({ id: p.id, value: p.value }));
    const result = await window.electronAPI?.saveParamsToFile(params, offlineVehicleType ?? undefined);

    if (result?.success && result.filePath) {
      // Update file path and reset modification tracking
      set(state => {
        const updated = new Map(state.parameters);
        for (const [id, param] of updated) {
          if (param.isModified) {
            updated.set(id, { ...param, originalValue: param.value, isModified: false });
          }
        }
        return {
          parameters: updated,
          paramCount: updated.size,
          offlineFilePath: result.filePath!,
          offlineHasUnsavedChanges: false,
        };
      });
      return true;
    }
    return false;
  },

  setOfflineVehicleType: async (vehicleType: string) => {
    set({ offlineVehicleType: vehicleType, metadata: null, isLoadingMetadata: false });
    const mavType = vehicleTypeToMavType(vehicleType);
    if (mavType !== null) {
      await get().fetchMetadata(mavType);
    }
  },

  closeOfflineMode: () => {
    get().reset();
  },

  setOfflineParameter: (paramId: string, rawValue: number) => {
    set(state => {
      const params = new Map(state.parameters);
      const existing = params.get(paramId);
      if (!existing) return state;

      const value = cleanFloat32(rawValue, existing.type);
      const isModified = !f32Equal(existing.originalValue ?? existing.value, value);
      params.set(paramId, { ...existing, value, isModified });

      return {
        parameters: params,
        paramCount: params.size,
        offlineHasUnsavedChanges: state.offlineHasUnsavedChanges || isModified,
      };
    });
  },

  // File compare actions
  loadFileForCompare: (fileParams, fileVehicleType) => {
    const { parameters, metadata } = get();
    const diffs: FileParamDiff[] = [];
    const skippedList: Array<{ id: string; value: number }> = [];

    for (const fp of fileParams) {
      const existing = parameters.get(fp.id);
      if (!existing) {
        skippedList.push({ id: fp.id, value: fp.value });
        continue;
      }
      if (existing.isReadOnly || metadata?.[fp.id]?.readOnly) continue;

      // Only include if values actually differ (float32-aware)
      if (!f32Equal(existing.value, fp.value)) {
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
      fileSkippedParams: skippedList,
      fileSkippedCount: skippedList.length,
      fileTotalCount: fileParams.length,
      fileVehicleType: fileVehicleType ?? null,
    });
  },

  closeCompareModal: () => {
    set({ showCompareModal: false, fileParamDiffs: [], fileSkippedParams: [], fileSkippedCount: 0, fileTotalCount: 0, fileVehicleType: null, applyProgress: null, fileApplyResult: null });
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
    const { fileParamDiffs, fileSkippedParams, metadata, offlineMode } = get();
    const selected = fileParamDiffs.filter(d => d.selected);
    if (selected.length === 0) return { applied: 0, failed: 0, rebootRequired: [], skippedParams: fileSkippedParams };

    // In offline mode, just update local state directly - no FC communication
    if (offlineMode) {
      set(state => {
        const params = new Map(state.parameters);
        for (const diff of selected) {
          const existing = params.get(diff.paramId);
          if (existing) {
            const value = cleanFloat32(diff.fileValue, existing.type);
            params.set(diff.paramId, {
              ...existing,
              value,
              isModified: !f32Equal(existing.originalValue ?? existing.value, value),
            });
          }
        }
        return {
          parameters: params,
          paramCount: params.size,
          offlineHasUnsavedChanges: true,
          showCompareModal: false,
          fileParamDiffs: [],
          fileSkippedParams: [],
          fileSkippedCount: 0,
          fileTotalCount: 0,
          fileVehicleType: null,
        };
      });
      return { applied: selected.length, failed: 0, rebootRequired: [], skippedParams: fileSkippedParams };
    }

    set({ isApplyingFileParams: true, applyProgress: { applied: 0, total: selected.length } });

    // Track user-initiated edits so updateParameter preserves originalValue
    for (const diff of selected) {
      userModifiedParams.add(diff.paramId);
    }

    // Subscribe to streaming progress from main so the modal's progress bar
    // advances as PARAM_VALUE echoes arrive, instead of jumping 0→100% at the
    // end of the batch. Display "confirmed" rather than "sent": user wants to
    // know how many the FC has acknowledged, not how many we've put on the wire.
    //
    // Method-level guard: in dev mode the preload script is NOT hot-reloaded
    // when only the renderer changes. If the renderer has the new subscribe
    // call but the running preload bundle pre-dates this method, calling it
    // would throw `is not a function` and leave isApplyingFileParams stuck
    // true → modal hangs forever. The if-guard plus a try/finally below
    // make this path resilient to a stale preload.
    let unsubscribeProgress: (() => void) | undefined;
    if (typeof window.electronAPI?.onParamSetBatchProgress === 'function') {
      unsubscribeProgress = window.electronAPI.onParamSetBatchProgress(({ confirmed, total }) => {
        // Ignore stale events from a previous batch (e.g. canceled then restarted)
        if (total !== selected.length) return;
        set({ applyProgress: { applied: confirmed, total } });
      });
    }

    // Use batch endpoint - sends all PARAM_SET messages rapidly instead of one-by-one
    const batchParams = selected.map(d => ({ paramId: d.paramId, value: d.fileValue, type: d.type }));
    let result: Awaited<ReturnType<NonNullable<typeof window.electronAPI>['setParameterBatch']>> | undefined;
    try {
      result = await window.electronAPI?.setParameterBatch(batchParams);
    } finally {
      unsubscribeProgress?.();
    }

    const failedSet = new Set(result?.failed ?? []);
    const applied = result?.confirmed ?? 0;
    const failed = selected.length - applied;
    const appliedParamIds = selected
      .filter(d => !failedSet.has(d.paramId))
      .map(d => d.paramId);

    // Update local state for all confirmed params in one batch
    set(state => {
      const params = new Map(state.parameters);
      for (const diff of selected) {
        if (failedSet.has(diff.paramId)) continue;
        const existing = params.get(diff.paramId);
        if (existing) {
          const value = cleanFloat32(diff.fileValue, existing.type);
          params.set(diff.paramId, {
            ...existing,
            value,
            isModified: !f32Equal(existing.originalValue ?? existing.value, value),
          });
        }
      }
      return {
        parameters: params, paramCount: params.size,
        applyProgress: { applied, total: selected.length },
      };
    });

    // Collect params that require reboot
    const rebootRequired = appliedParamIds.filter(id => metadata?.[id]?.rebootRequired === true);

    if (rebootRequired.length > 0 || fileSkippedParams.length > 0) {
      // Show summary dialog instead of closing
      set({
        isApplyingFileParams: false,
        applyProgress: null,
        fileApplyResult: { applied, failed, rebootRequired, skippedParams: fileSkippedParams },
      });
    } else {
      // Clean apply — close modal
      set({ isApplyingFileParams: false, showCompareModal: false, fileParamDiffs: [], fileSkippedParams: [], fileSkippedCount: 0, fileTotalCount: 0, fileVehicleType: null, applyProgress: null });
    }

    return { applied, failed, rebootRequired, skippedParams: fileSkippedParams };
  },

  setPendingRetryParams: (params) => {
    set({ pendingRetryParams: params });
  },

  retryPendingParams: async () => {
    const { pendingRetryParams, parameters, metadata } = get();
    const appliedParamIds: string[] = [];
    const stillPending: Array<{ id: string; value: number }> = [];
    const toSend: Array<{ paramId: string; value: number; type: number }> = [];

    // Separate params into: already correct, need sending, still missing
    for (const pending of pendingRetryParams) {
      const existing = parameters.get(pending.id);
      if (!existing) {
        stillPending.push(pending);
        continue;
      }
      if (existing.isReadOnly || metadata?.[pending.id]?.readOnly) continue;

      if (f32Equal(existing.value, pending.value)) {
        appliedParamIds.push(pending.id);
        continue;
      }

      userModifiedParams.add(pending.id);
      toSend.push({ paramId: pending.id, value: pending.value, type: existing.type });
    }

    let batchFailed = 0;
    if (toSend.length > 0) {
      const result = await window.electronAPI?.setParameterBatch(toSend);
      const failedSet = new Set(result?.failed ?? []);
      batchFailed = failedSet.size;

      // Track confirmed params
      for (const p of toSend) {
        if (!failedSet.has(p.paramId)) {
          appliedParamIds.push(p.paramId);
        }
      }

      // Update local state for confirmed params
      set(state => {
        const params = new Map(state.parameters);
        for (const p of toSend) {
          if (failedSet.has(p.paramId)) continue;
          const ex = params.get(p.paramId);
          if (ex) {
            params.set(p.paramId, {
              ...ex,
              value: p.value,
              isModified: !f32Equal(ex.originalValue ?? ex.value, p.value),
            });
          }
        }
        return { parameters: params, paramCount: params.size };
      });
    }

    const applied = appliedParamIds.length;
    const rebootRequired = appliedParamIds.filter(id => metadata?.[id]?.rebootRequired === true);
    return { applied, failed: batchFailed, rebootRequired, stillPending };
  },

  clearFileApplyResult: () => {
    set({ fileApplyResult: null });
  },

  clearPendingRetryParams: () => {
    set({ pendingRetryParams: [] });
  },

  reset: () => { userModifiedParams.clear(); stagedParams.clear(); set({
    parameters: new Map(),
    paramCount: 0,
    downloadState: 'idle',
    metadata: null,
    isLoading: false,
    isLoadingMetadata: false,
    progress: null,
    error: null,
    lastRefresh: 0,
    searchQuery: '',
    selectedGroup: 'all',
    showOnlyModified: false,
    showOnlyNonDefault: false,
    showOnlyFavourites: false,
    // NOTE: favourites are NOT reset - they persist across connections
    sortColumn: 'name',
    sortDirection: 'asc',
    // Offline mode
    offlineMode: false,
    offlineFilePath: null,
    offlineVehicleType: null,
    offlineHasUnsavedChanges: false,
    // File compare
    showCompareModal: false,
    fileParamDiffs: [],
    fileSkippedParams: [],
    fileSkippedCount: 0,
    fileTotalCount: 0,
    fileVehicleType: null,
    isApplyingFileParams: false,
    applyProgress: null,
    fileApplyResult: null,
    pendingRetryParams: [],
  }); },
}));
