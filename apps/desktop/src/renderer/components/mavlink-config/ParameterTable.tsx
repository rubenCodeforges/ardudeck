/**
 * ParameterTable
 *
 * Full parameter table for expert users.
 * Provides search, filter, edit, and file operations.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { History, AlertTriangle, RotateCw, Loader2, Star, CheckCircle, XCircle, Info, ExternalLink, Cpu, Pencil, Check } from 'lucide-react';
import { useParameterStore, type SortColumn } from '../../stores/parameter-store';
import { useSettingsStore } from '../../stores/settings-store';
import { PARAMETER_GROUPS } from '../../../shared/parameter-groups';
import { useConnectionStore } from '../../stores/connection-store';
import { getParameterDocsUrl, getPx4ParameterDocsUrl, mavTypeToVehicleType } from '../../../shared/parameter-metadata';
import { formatParamValue } from '../../../shared/parameter-types';
import { classifySitlUnsafeParam } from '../../../shared/sitl-unsafe-params';
import BitmaskEditor from './BitmaskEditor';
import ParamHistoryModal from './ParamHistoryModal';
import { Tooltip } from '../ui/Tooltip';
import { NON_DEFAULT_COLORS, getNonDefaultColor } from '../parameters/non-default-palette';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

// Column widths kept in one place so header and rows stay aligned.
const PARAM_GRID_COLUMNS = 'minmax(220px, 260px) minmax(140px, 200px) minmax(220px, 320px) minmax(0, 1fr) 140px';

// Group colors now come from PARAMETER_GROUPS[].color

// Sort indicator component
function SortIndicator({ column, currentColumn, direction }: {
  column: SortColumn;
  currentColumn: SortColumn;
  direction: 'asc' | 'desc';
}) {
  const isActive = column === currentColumn;
  return (
    <span className={`ml-1 inline-block transition-transform ${isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}>
      {direction === 'asc' || !isActive ? (
        <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
        </svg>
      ) : (
        <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      )}
    </span>
  );
}

const ParameterTable: React.FC = () => {
  const connectionState = useConnectionStore((s) => s.connectionState);
  const {
    parameters,
    isLoading,
    progress,
    error,
    lastRefresh,
    searchQuery,
    selectedGroup,
    showOnlyModified,
    sortColumn,
    sortDirection,
    filteredParameters,
    fetchParameters,
    setParameter,
    setSearchQuery,
    setSelectedGroup,
    toggleShowOnlyModified,
    toggleSort,
    revertParameter,
    modifiedCount,
    modifiedParameters,
    markAllAsSaved,
    groupCounts,
    getDescription,
    hasOfficialDescription,
    validateParameter,
    getParameterMetadata,
    isRebootRequired,
    isFavourite,
    toggleFavourite,
    showOnlyFavourites,
    toggleShowOnlyFavourites,
    favouriteCount,
    showOnlyNonDefault,
    toggleShowOnlyNonDefault,
    nonDefaultCount: nonDefaultCountFn,
    hasDefaults: hasDefaultsFn,
    // File compare
    showCompareModal,
    fileParamDiffs,
    fileSkippedCount,
    fileTotalCount,
    fileVehicleType,
    isApplyingFileParams,
    applyProgress,
    loadFileForCompare,
    closeCompareModal,
    toggleDiffSelection,
    selectAllDiffs,
    deselectAllDiffs,
    applySelectedFileParams,
    // Post-apply / reboot cycle
    fileApplyResult,
    clearFileApplyResult,
    setPendingRetryParams,
    retryPendingParams,
    clearPendingRetryParams,
  } = useParameterStore();

  const nonDefaultColorKey = useSettingsStore((s) => s.nonDefaultHighlightColor);
  const setNonDefaultHighlightColor = useSettingsStore((s) => s.setNonDefaultHighlightColor);
  const nonDefaultColor = getNonDefaultColor(nonDefaultColorKey);

  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editWarning, setEditWarning] = useState<string | null>(null);

  const [bitmaskParam, setBitmaskParam] = useState<string | null>(null);

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebootRequiredParams, setRebootRequiredParams] = useState<string[]>([]);
  const [rebooting, setRebooting] = useState(false);
  const pendingParamRefresh = useRef(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const saveDropdownRef = useRef<HTMLDivElement>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

  // Reboot cycle state
  const rebootCycleRef = useRef<{
    active: boolean;
    phase: 'idle' | 'flashing' | 'rebooting' | 'waiting-params' | 'retrying' | 'done';
    count: number;
    totalApplied: number;
    totalFailed: number;
  }>({ active: false, phase: 'idle', count: 0, totalApplied: 0, totalFailed: 0 });
  const [cycleStatus, setCycleStatus] = useState<string | null>(null);
  const [cycleResult, setCycleResult] = useState<{
    totalApplied: number;
    totalReboots: number;
    stillPending: Array<{ id: string; value: number }>;
  } | null>(null);

  // SITL-safe mode for the compare modal: hides hardware-identity / hardware-
  // bus params that would crash a simulated FC on reboot. Defaults ON when
  // the active connection targets SITL.
  const [sitlSafeMode, setSitlSafeMode] = useState(!!connectionState.isSitl);
  useEffect(() => { setSitlSafeMode(!!connectionState.isSitl); }, [connectionState.isSitl]);

  const sitlUnsafeMap = useMemo(() => {
    const m = new Map<string, string>();
    if (!connectionState.isSitl) return m;
    for (const d of fileParamDiffs) {
      const verdict = classifySitlUnsafeParam(d.paramId, d.fileValue);
      if (verdict) m.set(d.paramId, verdict.reason);
    }
    return m;
  }, [fileParamDiffs, connectionState.isSitl]);

  // When SITL-safe mode is on, force any selected unsafe diffs back to
  // deselected. Runs whenever the diff set, the unsafe map, or the safeMode
  // flips. Without this the user could click "Select all" and accidentally
  // queue hardware-identity params for apply, crashing SITL on reboot.
  useEffect(() => {
    if (!sitlSafeMode) return;
    for (const d of fileParamDiffs) {
      if (d.selected && sitlUnsafeMap.has(d.paramId)) {
        toggleDiffSelection(d.paramId);
      }
    }
  }, [sitlSafeMode, fileParamDiffs, sitlUnsafeMap, toggleDiffSelection]);

  // Close save dropdown on outside click
  useEffect(() => {
    if (!saveDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (saveDropdownRef.current && !saveDropdownRef.current.contains(e.target as Node)) {
        setSaveDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [saveDropdownOpen]);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (colorPickerRef.current && !colorPickerRef.current.contains(e.target as Node)) {
        setColorPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [colorPickerOpen]);

  // Auto-hide toast after 3 seconds
  const showToast = useCallback((message: string, type: ToastType) => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const handleRefresh = useCallback(() => {
    fetchParameters();
  }, [fetchParameters]);

  const handleWriteToFlashClick = useCallback(() => {
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      // Auto-checkpoint before writing to flash
      const modified = modifiedParameters();
      if (modified.length > 0) {
        const boardUid = connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`;
        const boardName = connectionState.vehicleType || 'Unknown';
        const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
        await window.electronAPI?.saveParamCheckpoint(boardUid, boardName,
          modified.map(p => ({ paramId: p.id, oldValue: p.originalValue ?? p.value, newValue: p.value })),
          vehicleType
        );
      }

      const result = await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        // Check if any written params require a reboot
        const rebootParams = modified.filter(p => isRebootRequired(p.id)).map(p => p.id);
        if (rebootParams.length > 0) {
          setRebootRequiredParams(rebootParams);
        }

        markAllAsSaved();
        showToast('Parameters saved to flash successfully', 'success');
      } else {
        showToast(result?.error ?? 'Failed to write to flash', 'error');
      }
    } catch {
      showToast('Failed to write to flash', 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState, isRebootRequired]);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (success) {
        if (rebootRequiredParams.length > 0) {
          pendingParamRefresh.current = true;
        } else {
          showToast('Rebooting flight controller...', 'info');
        }
      } else {
        setRebooting(false);
        showToast('Failed to send reboot command', 'error');
      }
    } catch {
      setRebooting(false);
      showToast('Failed to reboot flight controller', 'error');
    }
  }, [showToast, rebootRequiredParams]);

  // Watch for reconnection completion after a reboot we initiated
  useEffect(() => {
    if (!pendingParamRefresh.current) return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      pendingParamRefresh.current = false;
      setRebooting(false);
      setRebootRequiredParams([]);
      showToast('Reboot complete', 'success');
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, showToast]);

  // Reboot cycle: watch for reconnection after cycle-initiated reboot
  useEffect(() => {
    const cycle = rebootCycleRef.current;
    if (!cycle.active || cycle.phase !== 'rebooting') return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      cycle.phase = 'waiting-params';
      setCycleStatus('Refreshing parameters...');
      fetchParameters();
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, fetchParameters]);

  // Reboot cycle: watch for param refresh completion, then retry pending params
  useEffect(() => {
    const cycle = rebootCycleRef.current;
    if (!cycle.active || cycle.phase !== 'waiting-params') return;
    if (lastRefresh === 0) return;

    const runRetry = async () => {
      cycle.phase = 'retrying';
      const pending = useParameterStore.getState().pendingRetryParams;
      setCycleStatus(`Applying ${pending.length} pending parameter${pending.length !== 1 ? 's' : ''}...`);

      const result = await retryPendingParams();
      cycle.totalApplied += result.applied;
      cycle.totalFailed += result.failed;

      // If params were applied, flash write again
      if (result.applied > 0) {
        setCycleStatus('Writing new parameters to flash...');
        await window.electronAPI?.writeParamsToFlash();
        markAllAsSaved();
      }

      // If newly applied params need reboot AND we haven't hit max cycles
      if (result.rebootRequired.length > 0 && cycle.count < 3) {
        cycle.count++;
        setPendingRetryParams(result.stillPending);
        cycle.phase = 'rebooting';
        setCycleStatus(`Rebooting flight controller (cycle ${cycle.count}/3)...`);
        await window.electronAPI?.mavlinkReboot();
        return;
      }

      // Cycle done
      cycle.active = false;
      cycle.phase = 'done';
      setCycleStatus(null);
      setCycleResult({
        totalApplied: cycle.totalApplied,
        totalReboots: cycle.count,
        stillPending: result.stillPending,
      });
      clearPendingRetryParams();
    };

    runRetry();
  }, [lastRefresh]); // Intentionally only depends on lastRefresh to detect param refresh completion

  // Start the auto reboot cycle
  const startRebootCycle = useCallback(async () => {
    if (!fileApplyResult) return;

    const cycle = rebootCycleRef.current;
    cycle.active = true;
    cycle.phase = 'flashing';
    cycle.count = 1;
    cycle.totalApplied = fileApplyResult.applied;
    cycle.totalFailed = fileApplyResult.failed;

    // Store skipped params for retry after reboot
    setPendingRetryParams(fileApplyResult.skippedParams);
    clearFileApplyResult();

    // Close compare modal
    closeCompareModal();

    // Flash write
    setCycleStatus('Writing parameters to flash...');
    try {
      const flashResult = await window.electronAPI?.writeParamsToFlash();
      if (!flashResult?.success) {
        cycle.active = false;
        cycle.phase = 'idle';
        setCycleStatus(null);
        showToast(flashResult?.error ?? 'Failed to write to flash', 'error');
        return;
      }
      markAllAsSaved();
    } catch {
      cycle.active = false;
      cycle.phase = 'idle';
      setCycleStatus(null);
      showToast('Failed to write to flash', 'error');
      return;
    }

    // Reboot
    cycle.phase = 'rebooting';
    setCycleStatus('Rebooting flight controller...');
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (!success) {
        cycle.active = false;
        cycle.phase = 'idle';
        setCycleStatus(null);
        showToast('Failed to send reboot command', 'error');
      }
    } catch {
      cycle.active = false;
      cycle.phase = 'idle';
      setCycleStatus(null);
      showToast('Failed to reboot flight controller', 'error');
    }
  }, [fileApplyResult, setPendingRetryParams, clearFileApplyResult, closeCompareModal, markAllAsSaved, showToast]);

  // Handle "Close" on summary dialog — dismiss and show reboot banner if needed
  const handleSummaryClose = useCallback(() => {
    if (fileApplyResult?.rebootRequired && fileApplyResult.rebootRequired.length > 0) {
      setRebootRequiredParams(fileApplyResult.rebootRequired);
    }
    clearFileApplyResult();
    closeCompareModal();
  }, [fileApplyResult, clearFileApplyResult, closeCompareModal]);

  const handleSaveToFile = useCallback(async (changedOnly?: boolean) => {
    setIsSavingFile(true);
    setSaveDropdownOpen(false);
    try {
      let params = Array.from(parameters.values())
        .filter(p => !p.isReadOnly)
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => ({ id: p.id, value: p.value }));

      if (changedOnly) {
        params = Array.from(parameters.values())
          .filter(p => !p.isReadOnly && p.isModified)
          .sort((a, b) => a.id.localeCompare(b.id))
          .map(p => ({ id: p.id, value: p.value }));
      }

      if (params.length === 0) {
        showToast(changedOnly ? 'No changed parameters to save' : 'No parameters to save', 'info');
        return;
      }

      const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
      const result = await window.electronAPI?.saveParamsToFile(params, vehicleType);
      if (result?.success) {
        showToast(`Saved ${params.length} parameter${params.length !== 1 ? 's' : ''} to file`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsSavingFile(false);
    }
  }, [parameters, connectionState.vehicleType, connectionState.fcVariant, showToast]);

  const handleLoadFromFile = useCallback(async () => {
    setIsLoadingFile(true);
    try {
      const result = await window.electronAPI?.loadParamsFromFile();
      if (result?.success && result.params) {
        loadFileForCompare(result.params, result.vehicleType);
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsLoadingFile(false);
    }
  }, [loadFileForCompare, showToast]);

  const handleApplySelectedParams = useCallback(async () => {
    const result = await applySelectedFileParams();
    if (result.applied > 0) {
      showToast(`Applied ${result.applied} parameter${result.applied !== 1 ? 's' : ''} to vehicle${result.failed > 0 ? ` (${result.failed} failed)` : ''}`, result.failed > 0 ? 'info' : 'success');
    } else if (result.failed > 0) {
      showToast(`Failed to apply ${result.failed} parameter${result.failed !== 1 ? 's' : ''}`, 'error');
    }
  }, [applySelectedFileParams, showToast]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, [setSearchQuery]);

  const startEdit = useCallback((paramId: string, currentValue: number) => {
    setEditingParam(paramId);
    setEditValue(String(currentValue));
    setEditError(null);
    setEditWarning(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingParam(null);
    setEditValue('');
    setEditError(null);
    setEditWarning(null);
  }, []);

  const isValidNumberString = useCallback((str: string): boolean => {
    const trimmed = str.trim();
    if (trimmed === '') return false;
    return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
  }, []);

  const handleEditChange = useCallback((paramId: string, value: string) => {
    setEditValue(value);
    if (!isValidNumberString(value)) {
      setEditError('Invalid number');
      setEditWarning(null);
    } else {
      const numValue = Number(value.trim());
      const result = validateParameter(paramId, numValue);
      setEditError(result.error ?? null);
      setEditWarning(result.warning ?? null);
    }
  }, [validateParameter, isValidNumberString]);

  const saveEdit = useCallback(async (paramId: string) => {
    if (!isValidNumberString(editValue)) {
      setEditError('Invalid number');
      return;
    }
    const newValue = Number(editValue.trim());
    const result = validateParameter(paramId, newValue);
    if (!result.valid) {
      setEditError(result.error ?? 'Invalid value');
      return;
    }
    await setParameter(paramId, newValue);
    cancelEdit();
  }, [editValue, setParameter, cancelEdit, validateParameter, isValidNumberString]);

  const handleBitmaskSave = useCallback(async (paramId: string, value: number) => {
    await setParameter(paramId, value);
    setBitmaskParam(null);
  }, [setParameter]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, paramId: string) => {
    if (e.key === 'Enter') {
      saveEdit(paramId);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  const displayParams = filteredParameters();
  const paramCount = parameters.size;
  const modified = modifiedCount();
  const nonDefaultCount = nonDefaultCountFn();
  const hasDefaults = hasDefaultsFn();

  // Per-param docs link. PX4 has a single generated reference page; ArduPilot
  // resolves a per-vehicle page (null when vehicle is unknown).
  const isPx4 = connectionState.firmware === 'px4';
  const docsVehicle = !isPx4 && connectionState.mavType != null ? mavTypeToVehicleType(connectionState.mavType) : null;
  const showDocsLink = isPx4 || docsVehicle != null;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: displayParams.length,
    getScrollElement: () => scrollContainerRef.current,
    estimateSize: () => 44,
    overscan: 20,
  });

  return (
    <div className="h-full flex flex-col">
      {/* Search & filter bar */}
      <div className="shrink-0 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search parameters... (regex supported)"
              className="w-full px-4 py-2 pl-10 bg-surface-input border border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* File operations — split Save button with dropdown */}
          <div className="relative" ref={saveDropdownRef}>
            <div className="flex">
              <button
                onClick={() => handleSaveToFile(false)}
                disabled={isSavingFile || paramCount === 0}
                className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-l-lg text-sm font-medium transition-colors flex items-center gap-2"
                title="Save all parameters to file"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                {isSavingFile ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setSaveDropdownOpen(prev => !prev)}
                disabled={isSavingFile || paramCount === 0}
                className="px-1.5 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-r-lg border-l border/30 text-sm transition-colors"
                title="Save options"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
            </div>
            {saveDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-52 bg-surface-solid border-subtle rounded-lg shadow-xl z-50 py-1">
                <button
                  onClick={() => handleSaveToFile(false)}
                  className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised transition-colors"
                >
                  Save All Parameters
                </button>
                <button
                  onClick={() => handleSaveToFile(true)}
                  disabled={modified === 0}
                  className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised disabled:text-content-tertiary disabled:hover:bg-transparent transition-colors"
                >
                  Save Changed Only
                  {modified > 0 && <span className="ml-1 text-xs text-yellow-400">({modified})</span>}
                </button>
              </div>
            )}
          </div>

          <button
            onClick={handleLoadFromFile}
            disabled={isLoadingFile}
            className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Load parameters from file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {isLoadingFile ? 'Loading...' : 'Load'}
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="View parameter change history"
          >
            <History className="w-4 h-4" />
            History
          </button>

          {favouriteCount() > 0 && (
            <button
              onClick={toggleShowOnlyFavourites}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyFavourites
                  ? 'bg-yellow-500/30 text-yellow-300 ring-1 ring-yellow-500/50'
                  : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              }`}
              title={showOnlyFavourites ? 'Show all parameters' : 'Show only favourite parameters'}
            >
              <Star className={`w-3 h-3 ${showOnlyFavourites ? 'fill-yellow-300' : ''}`} />
              {favouriteCount()} favourites
            </button>
          )}

          {modified > 0 && (
            <button
              onClick={toggleShowOnlyModified}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyModified
                  ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
              title={showOnlyModified ? 'Show all parameters' : 'Show only modified parameters'}
            >
              {showOnlyModified && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              )}
              {modified} modified
            </button>
          )}

          {paramCount > 0 && (
            <div className="relative" ref={colorPickerRef}>
              <div className="flex">
                <button
                  onClick={toggleShowOnlyNonDefault}
                  className={`px-3 py-2 rounded-l-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    showOnlyNonDefault
                      ? 'bg-surface-raised text-content ring-1 ring-inset ring-blue-500/40'
                      : 'bg-surface-raised hover:bg-surface-raised text-content'
                  }`}
                  title={showOnlyNonDefault
                    ? 'Show all parameters'
                    : (hasDefaults
                        ? 'Show only parameters that differ from firmware defaults'
                        : 'Show only parameters changed in this session (firmware defaults unavailable on this connection)')}
                >
                  <span className={`inline-block w-3 h-3 rounded-full ring-1 ring-black/10 ${nonDefaultColor.swatchClass}`} />
                  Non-default
                  <span className="text-xs text-content-secondary">({nonDefaultCount})</span>
                </button>
                <button
                  onClick={() => setColorPickerOpen((o) => !o)}
                  className="px-1.5 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-r-lg border-l border-subtle/40 text-sm transition-colors"
                  title="Pick highlight color"
                  aria-haspopup="menu"
                  aria-expanded={colorPickerOpen}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              {colorPickerOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg bg-surface-solid border border-subtle shadow-xl p-2"
                >
                  <div className="px-1.5 pb-1.5 text-[10px] uppercase tracking-wider text-content-tertiary">Highlight color</div>
                  <div className="grid grid-cols-4 gap-1">
                    {NON_DEFAULT_COLORS.map((c) => {
                      const active = c.key === nonDefaultColorKey;
                      return (
                        <button
                          key={c.key}
                          onClick={() => { setNonDefaultHighlightColor(c.key); setColorPickerOpen(false); }}
                          className={`relative h-8 rounded-md ${c.swatchClass} transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-solid focus:ring-white/40 ${active ? 'ring-2 ring-white/90 ring-offset-1 ring-offset-surface-solid' : ''}`}
                          title={c.label}
                          aria-label={c.label}
                        >
                          {active && <Check className="w-4 h-4 text-white absolute inset-0 m-auto drop-shadow" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        {isLoading && progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
              <span>Downloading parameters...</span>
              <span>{progress.received} / {progress.total} ({progress.percentage}%)</span>
            </div>
            <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message - hide while actively loading */}
        {error && !isLoading && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Group tabs */}
      {paramCount > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-subtle bg-surface-overlay-subtle overflow-x-auto">
          <div className="flex gap-1">
            {PARAMETER_GROUPS.map((group) => {
              const count = groupCounts().get(group.id) ?? 0;
              const isActive = selectedGroup === group.id;
              if (group.id !== 'all' && count === 0) return null;
              const c = group.color;

              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? `bg-${c}-500/20 text-${c}-400 border-${c}-500/30`
                      : 'text-content-secondary hover:text-content hover:bg-surface'
                  }`}
                  title={group.description}
                >
                  <svg className={`w-3.5 h-3.5 ${isActive ? `text-${c}-400` : `text-${c}-400 opacity-50`}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                  </svg>
                  {group.name}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? `bg-${c}-500/30 text-${c}-300` : 'bg-surface-raised text-content-secondary'
                    }`}>
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Reboot Required Banner */}
      {rebootRequiredParams.length > 0 && (
        <div className={`shrink-0 px-4 py-2.5 border-b flex items-start justify-between gap-3 ${
          rebooting
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-start gap-2.5 min-w-0 flex-1">
            {rebooting ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            )}
            {rebooting ? (
              <span className="text-sm text-blue-300">
                {connectionState.isReconnecting
                  ? `Reconnecting to flight controller...`
                  : 'Rebooting flight controller...'}
                {connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
                  <span className="text-blue-400/70 ml-2">
                    Attempt {connectionState.reconnectAttempt}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
                  </span>
                )}
              </span>
            ) : (
              <div className="min-w-0 flex-1">
                <div className="text-sm text-amber-300">
                  Reboot required for {rebootRequiredParams.length} parameter{rebootRequiredParams.length !== 1 ? 's' : ''} to take effect.
                </div>
                <div className="mt-1 max-h-16 overflow-y-auto pr-1">
                  <span className="font-mono text-xs text-amber-400/70 break-words">
                    {rebootRequiredParams.join(', ')}
                  </span>
                </div>
              </div>
            )}
          </div>
          {!rebooting && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setRebootRequiredParams([])}
                className="px-2.5 py-1 text-xs text-content-secondary hover:text-content transition-colors"
              >
                Dismiss
              </button>
              <button
                onClick={handleReboot}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30 transition-colors flex items-center gap-1.5"
              >
                <RotateCw className="w-3 h-3" />
                Reboot Now
              </button>
            </div>
          )}
        </div>
      )}

      {/* Reboot Cycle Progress Banner */}
      {cycleStatus && (
        <div className="shrink-0 px-4 py-2.5 border-b bg-blue-500/10 border-blue-500/30">
          <div className="flex items-center gap-2.5">
            <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            <span className="text-sm text-blue-300">
              {cycleStatus}
            </span>
            {rebootCycleRef.current.active && rebootCycleRef.current.phase === 'rebooting' && connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
              <span className="text-blue-400/70 text-sm ml-2">
                Attempt {connectionState.reconnectAttempt}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Parameter table */}
      <div className="flex-1 overflow-auto" ref={scrollContainerRef}>
        {paramCount === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center text-content-secondary">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">Loading parameters...</p>
              <p className="text-sm text-content-tertiary">Parameters will download automatically when connected</p>
            </div>
          </div>
        ) : (
          <div className="w-full">
            {/* Header */}
            <div
              className="sticky top-0 bg-surface backdrop-blur border-b border-subtle z-10 grid text-left text-xs text-content-secondary uppercase tracking-wider"
              style={{ gridTemplateColumns: PARAM_GRID_COLUMNS }}
            >
              <div className="px-4 py-3 font-medium">
                <button
                  onClick={() => toggleSort('name')}
                  className="group flex items-center hover:text-content transition-colors uppercase"
                >
                  Name
                  <SortIndicator column="name" currentColumn={sortColumn} direction={sortDirection} />
                </button>
              </div>
              <div className="px-4 py-3 font-medium">Value</div>
              <div className="px-4 py-3 font-medium">Options</div>
              <div className="px-4 py-3 font-medium">Description</div>
              <div className="px-4 py-3 font-medium text-right">
                <button
                  onClick={() => toggleSort('status')}
                  className="group inline-flex items-center hover:text-content transition-colors uppercase"
                >
                  Status
                  <SortIndicator column="status" currentColumn={sortColumn} direction={sortDirection} />
                </button>
              </div>
            </div>

            {/* Virtualized rows */}
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const param = displayParams[virtualRow.index]!;
                const idx = virtualRow.index;
                const isNonDefault = !param.isReadOnly && (
                  param.defaultValue !== undefined
                    ? Math.fround(param.value) !== Math.fround(param.defaultValue)
                    : param.isModified
                );
                return (
                <div
                  key={param.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: virtualRow.size,
                    transform: `translateY(${virtualRow.start}px)`,
                    gridTemplateColumns: PARAM_GRID_COLUMNS,
                    zIndex: bitmaskParam === param.id ? 40 : undefined,
                  }}
                  className={`group/row grid items-center hover:bg-surface transition-colors ${idx % 2 === 0 ? 'bg-surface-overlay-subtle' : ''}`}
                >
                  <div className="px-4 py-2.5 min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavourite(param.id); }}
                        className="shrink-0 p-0.5 rounded transition-colors hover:bg-surface-raised"
                        title={isFavourite(param.id) ? 'Remove from favourites' : 'Add to favourites'}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFavourite(param.id) ? 'fill-yellow-400 text-yellow-400' : 'text-content-tertiary hover:text-content-secondary'}`} />
                      </button>
                      <span className="font-mono text-sm text-content truncate">{param.id}</span>
                      {isRebootRequired(param.id) && (
                        <span className="shrink-0 px-1 py-0.5 text-[9px] leading-none bg-amber-500/15 text-amber-500/70 rounded border-amber-500/20" title="Requires reboot to take effect">
                          Reboot
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="px-4 py-2.5 min-w-0">
                    {param.isReadOnly ? (
                      <span className="font-mono text-sm text-content-secondary tabular-nums" title="Read-only parameter">
                        {formatParamValue(param.value)}
                      </span>
                    ) : editingParam === param.id ? (
                      <div className="relative">
                        <input
                          type="text"
                          value={editValue}
                          onChange={(e) => handleEditChange(param.id, e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, param.id)}
                          onBlur={() => !editError && saveEdit(param.id)}
                          autoFocus
                          className={`w-full px-2 py-1 bg-surface-raised border rounded text-sm font-mono text-content focus:outline-none ${
                            editError ? 'border-red-500/50' : editWarning ? 'border-amber-500/50' : 'border-blue-500/50'
                          }`}
                        />
                        {(editError || editWarning) && (
                          <div className={`absolute left-0 top-full mt-1 px-2 py-1 text-xs rounded shadow-lg z-10 max-w-xs ${
                            editError ? 'bg-red-900/90 text-red-300' : 'bg-amber-900/90 text-amber-300'
                          }`}>
                            {editError || editWarning}
                          </div>
                        )}
                      </div>
                    ) : (() => {
                      const meta = getParameterMetadata(param.id);
                      const hasBitmask = meta?.bitmask && Object.keys(meta.bitmask).length > 0;
                      // Only show enum dropdown for integer-valued params (not float suggestions like expo)
                      const isIntegerParam = Number.isInteger(param.value);
                      const hasEnumValues = !hasBitmask && isIntegerParam && meta?.values && Object.keys(meta.values).length > 0;
                      return (
                        <div className="relative flex items-center gap-1.5 min-w-0">
                          {hasEnumValues ? (
                            <div className="flex items-center gap-1 w-full">
                              <select
                                value={Math.round(param.value)}
                                onChange={(e) => setParameter(param.id, Number(e.target.value))}
                                className={`flex-1 min-w-0 h-7 px-2 bg-surface-input border rounded-md text-sm leading-none focus:outline-none focus:border-blue-500 truncate ${isNonDefault ? nonDefaultColor.textClass : 'text-content'}`}
                              >
                                {Object.entries(meta!.values!).map(([code, label]) => (
                                  <option key={code} value={code}>{code}: {label}</option>
                                ))}
                                {!(String(Math.round(param.value)) in meta!.values!) && (
                                  <option value={Math.round(param.value)}>{Math.round(param.value)}: Custom</option>
                                )}
                              </select>
                              <button
                                onClick={() => startEdit(param.id, param.value)}
                                className="shrink-0 p-1 rounded hover:bg-surface-input text-content-secondary hover:text-blue-400 transition-colors"
                                title="Type a custom value"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => startEdit(param.id, param.value)}
                                className={`font-mono text-sm hover:text-blue-400 transition-colors tabular-nums ${isNonDefault ? nonDefaultColor.textClass : 'text-content'}`}
                                title={(() => {
                                  const hints: string[] = [];
                                  if (isNonDefault && param.defaultValue !== undefined) {
                                    hints.push(`Default: ${formatParamValue(param.defaultValue)}`);
                                  }
                                  if (meta?.range) hints.push(`Range: ${meta.range.min} - ${meta.range.max}`);
                                  return hints.join('\n') || `Click to edit`;
                                })()}
                              >
                                {formatParamValue(param.value)}
                              </button>
                              {meta?.units && (
                                <span className="text-[11px] text-content-tertiary ml-1 truncate">{meta.units}</span>
                              )}
                            </>
                          )}
                          {hasBitmask && (
                            <button
                              onClick={() => setBitmaskParam(bitmaskParam === param.id ? null : param.id)}
                              className="shrink-0 px-2 py-0.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded text-xs font-medium transition-colors"
                              title="Open bitmask editor"
                            >
                              Bitmask
                            </button>
                          )}
                          {bitmaskParam === param.id && hasBitmask && (
                            <BitmaskEditor
                              paramId={param.id}
                              value={param.value}
                              bitmask={meta!.bitmask!}
                              onSave={(v) => handleBitmaskSave(param.id, v)}
                              onCancel={() => setBitmaskParam(null)}
                            />
                          )}
                        </div>
                      );
                    })()}
                  </div>
                  {/* Options column: discrete value labels for params with meta.values */}
                  <div className="px-4 py-2.5 min-w-0 overflow-hidden">
                    {(() => {
                      const meta = getParameterMetadata(param.id);
                      const hasVals = !meta?.bitmask && meta?.values && Object.keys(meta.values).length > 0;
                      if (!hasVals) return null;
                      const isInt = Number.isInteger(param.value);
                      const currentCode = String(isInt ? Math.round(param.value) : param.value);
                      return (
                        <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] leading-snug max-h-[34px] overflow-hidden">
                          {Object.entries(meta!.values!).map(([code, label]) => {
                            const selected = code === currentCode;
                            return (
                              <button
                                key={code}
                                onClick={() => setParameter(param.id, Number(code))}
                                className={`shrink-0 transition-colors ${
                                  selected
                                    ? 'text-blue-400 font-medium'
                                    : 'text-content-tertiary hover:text-content-secondary'
                                }`}
                                title={`Set ${param.id} = ${code} (${label})`}
                              >
                                <span className="font-mono">{code}</span>
                                <span className="ml-1">{label}</span>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                  <div className="px-4 py-2.5 min-w-0 flex items-center gap-2">
                    <Tooltip
                      content={getDescription(param.id)}
                      placement="top"
                      nowrap={false}
                      className="max-w-md text-left"
                    >
                      <span
                        className={`text-sm line-clamp-1 ${
                          hasOfficialDescription(param.id)
                            ? 'text-content-secondary'
                            : 'text-content-secondary italic'
                        }`}
                      >
                        {getDescription(param.id)}
                      </span>
                    </Tooltip>
                    {showDocsLink && (
                      <Tooltip content={isPx4 ? 'Open PX4 docs' : 'Open ArduPilot docs'} placement="top">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            const url = isPx4
                              ? getPx4ParameterDocsUrl(param.id)
                              : getParameterDocsUrl(docsVehicle!, param.id);
                            window.electronAPI?.openExternal(url);
                          }}
                          className="shrink-0 p-1 rounded text-content-tertiary hover:text-blue-400 hover:bg-surface-raised transition-colors"
                          aria-label={`Open ${isPx4 ? 'PX4' : 'ArduPilot'} docs for ${param.id}`}
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                  <div className="px-4 py-2.5 flex items-center justify-end gap-2">
                    {param.isReadOnly ? (
                      <span className="px-2 py-0.5 bg-surface-raised text-content-secondary rounded text-xs">
                        Read-only
                      </span>
                    ) : param.isModified ? (
                      <>
                        <button
                          onClick={() => revertParameter(param.id)}
                          className="text-xs text-content-secondary hover:text-content"
                          title={`Revert to ${formatParamValue(param.originalValue as number)}`}
                        >
                          revert
                        </button>
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                          Modified
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-4 py-2 border-t border-subtle bg-surface text-xs text-content-secondary flex items-center gap-4">
        <span>{paramCount} parameters</span>
        {(searchQuery || selectedGroup !== 'all' || showOnlyModified || showOnlyNonDefault || showOnlyFavourites) && displayParams.length !== paramCount && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>{displayParams.length} shown</span>
          </>
        )}
        {showOnlyFavourites && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-yellow-400">Favourites only</span>
          </>
        )}
        {showOnlyModified && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-amber-400">Modified only</span>
          </>
        )}
        {showOnlyNonDefault && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className={nonDefaultColor.textClass}>Non-default only</span>
          </>
        )}
        {selectedGroup !== 'all' && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>Group: {PARAMETER_GROUPS.find(g => g.id === selectedGroup)?.name}</span>
          </>
        )}
        <span className="text-content-tertiary">|</span>
        <span>System ID: {connectionState.systemId ?? '-'}</span>
        {lastRefresh > 0 && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>Last refresh: {new Date(lastRefresh).toLocaleTimeString()}</span>
          </>
        )}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">Write Parameters to Flash</h3>
              <p className="text-sm text-content-secondary mt-1">
                The following {modifiedParameters().length} parameter(s) will be saved permanently to the flight controller.
              </p>
              {modifiedParameters().some(p => isRebootRequired(p.id)) && (
                <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  Some parameters require a reboot to take effect.
                </p>
              )}
            </div>

            <div className="flex-1 min-h-0 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-secondary uppercase">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2 text-right">Original</th>
                    <th className="pb-2 text-center px-2">-</th>
                    <th className="pb-2">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-content">
                        {param.id}
                        {isRebootRequired(param.id) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                            Reboot
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(param.originalValue as number)}</td>
                      <td className="py-2 text-center text-content-tertiary">-</td>
                      <td className="py-2 font-mono text-amber-400">{formatParamValue(param.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleWriteToFlashConfirm}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                Write to Flash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Parameter History Modal */}
      {showHistory && (
        <ParamHistoryModal
          boardUid={connectionState.boardUid || `mavlink-${connectionState.systemId ?? 0}`}
          boardName={connectionState.vehicleType || 'Unknown'}
          onClose={() => setShowHistory(false)}
          showToast={showToast}
        />
      )}

      {/* File Compare Modal — shows compare view OR post-apply summary */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[640px] h-[640px] flex flex-col overflow-hidden">

            {fileApplyResult ? (
              /* Post-apply summary view */
              <>
                <div className="px-6 py-4 border-b border-subtle">
                  <h3 className="text-lg font-semibold text-content">Apply Results</h3>
                </div>

                <div className="flex-1 min-h-0 overflow-auto px-6 py-5 space-y-4">
                  {/* Applied count */}
                  <div className="flex items-center gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                    <span className="text-sm text-green-300">
                      {fileApplyResult.applied} parameter{fileApplyResult.applied !== 1 ? 's' : ''} applied
                    </span>
                  </div>

                  {/* Failed count */}
                  {fileApplyResult.failed > 0 && (
                    <div className="flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-red-400 shrink-0" />
                      <span className="text-sm text-red-300">
                        {fileApplyResult.failed} parameter{fileApplyResult.failed !== 1 ? 's' : ''} failed
                      </span>
                    </div>
                  )}

                  {/* Reboot required */}
                  {fileApplyResult.rebootRequired.length > 0 && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-sm text-amber-300">
                          {fileApplyResult.rebootRequired.length} require reboot to take effect:
                        </span>
                        <p className="font-mono text-xs text-amber-400/70 mt-1 break-words">
                          {fileApplyResult.rebootRequired.join(', ')}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* Skipped / not found */}
                  {fileApplyResult.skippedParams.length > 0 && (
                    <div className="flex items-start gap-3">
                      <Info className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
                      <div>
                        <span className="text-sm text-blue-300">
                          {fileApplyResult.skippedParams.length} not found on this firmware:
                        </span>
                        <p className="font-mono text-xs text-blue-400/70 mt-1 break-words">
                          {fileApplyResult.skippedParams.map(p => p.id).join(', ')}
                        </p>
                        <p className="text-xs text-content-secondary mt-1">
                          These may become available after reboot
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
                  <button
                    onClick={handleSummaryClose}
                    className="px-4 py-2 text-sm text-content-secondary hover:text-content transition-colors"
                  >
                    Close
                  </button>
                  {(fileApplyResult.rebootRequired.length > 0 || fileApplyResult.skippedParams.length > 0) && (
                    <button
                      onClick={startRebootCycle}
                      className="px-4 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 border-amber-500/30"
                    >
                      <RotateCw className="w-3.5 h-3.5" />
                      Write to Flash & Reboot
                    </button>
                  )}
                </div>
              </>
            ) : (
              /* Normal compare view */
              <>
                <div className="px-6 py-4 border-b border-subtle">
                  <h3 className="text-lg font-semibold text-content">Compare Parameters</h3>
                  <p className="text-sm text-content-secondary mt-1">
                    {fileParamDiffs.length === 0
                      ? 'No differences found - all file parameters match the vehicle.'
                      : `${fileParamDiffs.length} parameter${fileParamDiffs.length !== 1 ? 's' : ''} differ between file and vehicle. Select which to apply.`
                    }
                  </p>
                  {(() => {
                    const currentVehicle = connectionState.vehicleType || connectionState.fcVariant;
                    return fileVehicleType && currentVehicle && fileVehicleType !== currentVehicle ? (
                      <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-amber-500/30 rounded-lg">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <span className="text-xs text-amber-300">
                          File was saved from <span className="font-semibold">{fileVehicleType}</span> but vehicle is <span className="font-semibold">{currentVehicle}</span>
                        </span>
                      </div>
                    ) : null;
                  })()}
                  {fileSkippedCount > 0 && (
                    <p className="text-xs text-content-secondary mt-2">
                      {fileTotalCount} params in file: {fileTotalCount - fileSkippedCount} matched vehicle, {fileSkippedCount} skipped (not found on this firmware)
                    </p>
                  )}
                  {connectionState.isSitl && sitlUnsafeMap.size > 0 && (
                    <div className="mt-3 flex items-start gap-2 px-3 py-2 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                      <Cpu className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                      <div className="flex-1 text-xs">
                        <div className="text-blue-300">
                          {sitlSafeMode
                            ? `SITL-safe mode hides ${sitlUnsafeMap.size} hardware-identity param${sitlUnsafeMap.size !== 1 ? 's' : ''} that can crash the simulator.`
                            : `${sitlUnsafeMap.size} param${sitlUnsafeMap.size !== 1 ? 's' : ''} below are flagged as hardware-only and may crash SITL on reboot.`}
                        </div>
                        <button
                          onClick={() => setSitlSafeMode(v => !v)}
                          className="mt-1 text-blue-400 hover:text-blue-300 underline transition-colors"
                        >
                          {sitlSafeMode ? 'Show all (override)' : 'Re-enable SITL-safe mode'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                {fileParamDiffs.length > 0 && (() => {
                  const visibleDiffs = sitlSafeMode
                    ? fileParamDiffs.filter(d => !sitlUnsafeMap.has(d.paramId))
                    : fileParamDiffs;
                  const hiddenUnsafeCount = fileParamDiffs.length - visibleDiffs.length;
                  const visibleSelectedCount = visibleDiffs.filter(d => d.selected).length;
                  return (
                  <>
                    {/* Select all / Deselect all */}
                    <div className="px-6 py-2 border-b border-subtle flex items-center gap-3">
                      <button
                        onClick={selectAllDiffs}
                        className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                      >
                        Select all
                      </button>
                      <span className="text-content-tertiary">|</span>
                      <button
                        onClick={deselectAllDiffs}
                        className="text-xs text-content-secondary hover:text-content transition-colors"
                      >
                        Deselect all
                      </button>
                      <span className="ml-auto text-xs text-content-secondary">
                        {visibleSelectedCount} of {visibleDiffs.length} selected{hiddenUnsafeCount > 0 ? ` (${hiddenUnsafeCount} hw-only hidden)` : ''}
                      </span>
                    </div>

                    <div className="flex-1 min-h-0 overflow-auto px-6 py-2">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-xs text-content-secondary uppercase">
                            <th className="pb-2 w-8"></th>
                            <th className="pb-2">Parameter</th>
                            <th className="pb-2 text-right">Vehicle</th>
                            <th className="pb-2 text-center w-8"></th>
                            <th className="pb-2">File</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-subtle">
                          {visibleDiffs.map(diff => {
                            const unsafeReason = sitlUnsafeMap.get(diff.paramId);
                            return (
                              <tr
                                key={diff.paramId}
                                className={`cursor-pointer transition-colors ${diff.selected ? 'hover:bg-surface' : 'opacity-50 hover:opacity-75'}`}
                                onClick={() => toggleDiffSelection(diff.paramId)}
                              >
                                <td className="py-2 pr-2">
                                  <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${
                                    diff.selected
                                      ? 'bg-blue-500/30 border-blue-500/50'
                                      : 'border bg-surface'
                                  }`}>
                                    {diff.selected && (
                                      <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                      </svg>
                                    )}
                                  </div>
                                </td>
                                <td className="py-2 font-mono text-content">
                                  {diff.paramId}
                                  {unsafeReason && (
                                    <span
                                      className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase tracking-wide font-medium bg-red-500/15 text-red-400 border border-red-500/30"
                                      title={`SITL-unsafe: ${unsafeReason}. Applying may crash the simulator.`}
                                    >
                                      hw-only
                                    </span>
                                  )}
                                </td>
                                <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(diff.currentValue)}</td>
                                <td className="py-2 text-center text-content-tertiary">
                                  <svg className="w-3 h-3 inline" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                                  </svg>
                                </td>
                                <td className="py-2 font-mono text-amber-400">{formatParamValue(diff.fileValue)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </>
                  );
                })()}

                {/* Progress bar while applying */}
                {isApplyingFileParams && applyProgress && (
                  <div className="px-6 py-2 border-t border-subtle">
                    <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
                      <span>Applying parameters...</span>
                      <span>{applyProgress.applied} / {applyProgress.total}</span>
                    </div>
                    <div className="h-1.5 bg-surface-inset rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 transition-all duration-150"
                        style={{ width: `${(applyProgress.applied / applyProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                <div className="px-6 py-4 border-t border-subtle flex justify-end gap-3">
                  <button
                    onClick={closeCompareModal}
                    disabled={isApplyingFileParams}
                    className="px-4 py-2 text-sm text-content-secondary hover:text-content disabled:text-content-tertiary transition-colors"
                  >
                    {fileParamDiffs.length === 0 ? 'Close' : 'Cancel'}
                  </button>
                  {fileParamDiffs.length > 0 && (
                    <button
                      onClick={handleApplySelectedParams}
                      disabled={isApplyingFileParams || fileParamDiffs.filter(d => d.selected).length === 0}
                      className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
                    >
                      {isApplyingFileParams
                        ? 'Applying...'
                        : `Apply ${fileParamDiffs.filter(d => d.selected).length} Parameter${fileParamDiffs.filter(d => d.selected).length !== 1 ? 's' : ''}`
                      }
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Reboot Cycle Results Modal */}
      {cycleResult && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface border rounded-xl shadow-2xl max-w-lg w-full mx-4 flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">Reboot Cycle Complete</h3>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-sm text-green-300">
                  {cycleResult.totalApplied} parameter{cycleResult.totalApplied !== 1 ? 's' : ''} applied
                </span>
              </div>

              <div className="flex items-center gap-3">
                <RotateCw className="w-5 h-5 text-blue-400 shrink-0" />
                <span className="text-sm text-blue-300">
                  {cycleResult.totalReboots} reboot{cycleResult.totalReboots !== 1 ? 's' : ''} performed
                </span>
              </div>

              {cycleResult.stillPending.length > 0 && (
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
                  <div>
                    <span className="text-sm text-amber-300">
                      {cycleResult.stillPending.length} parameter{cycleResult.stillPending.length !== 1 ? 's' : ''} could not be set:
                    </span>
                    <p className="font-mono text-xs text-amber-400/70 mt-1 break-words">
                      {cycleResult.stillPending.map(p => p.id).join(', ')}
                    </p>
                    <p className="text-xs text-content-secondary mt-1">
                      These parameters may not exist in this firmware version
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-subtle flex justify-end">
              <button
                onClick={() => setCycleResult(null)}
                className="px-4 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-500/20 border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/20 border-red-500/30 text-red-400' :
          'bg-blue-500/20 border-blue-500/30 text-blue-400'
        }`}>
          {toast.type === 'success' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          )}
          {toast.type === 'error' && (
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          <span className="text-sm">{toast.message}</span>
        </div>
      )}
    </div>
  );
};

export default ParameterTable;
