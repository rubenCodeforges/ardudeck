/**
 * Parameters View - Full parameter management
 * Routes to protocol-specific config views:
 * - MSP: Betaflight/iNav config (MspConfigView)
 * - MAVLink: ArduPilot config (MavlinkConfigView)
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle, RotateCw, Loader2, Star, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore, type SortColumn, type FileParamDiff } from '../../stores/parameter-store';
import { useQuickSetupStore } from '../../stores/quick-setup-store';
import { useSettingsStore } from '../../stores/settings-store';
import { NON_DEFAULT_COLORS, getNonDefaultColor } from './non-default-palette';
import { getParamTypeName, formatParamValue } from '../../../shared/parameter-types';
import { PARAMETER_GROUPS } from '../../../shared/parameter-groups';
import { MspConfigView } from './MspConfigView';
import MavlinkConfigView from '../mavlink-config/MavlinkConfigView';
import { LegacyConfigView } from '../legacy-config';

/** Prefer the i18n key; falls back to the literal. */
function pvText(t: (key: string) => string, key: string | undefined, fallback: string): string {
  return key ? t(key) : fallback;
}

// Simple toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

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

// Static Tailwind color map - dynamic class names get purged so we map them explicitly
const GROUP_COLOR_CLASSES: Record<string, { active: string; badge: string; icon: string }> = {
  blue:    { active: 'bg-blue-500/20 text-blue-400 border-blue-500/30',       badge: 'bg-blue-500/30 text-blue-300',    icon: 'text-blue-400' },
  green:   { active: 'bg-green-500/20 text-green-400 border-green-500/30',     badge: 'bg-green-500/30 text-green-300',   icon: 'text-green-400' },
  orange:  { active: 'bg-orange-500/20 text-orange-400 border-orange-500/30',   badge: 'bg-orange-500/30 text-orange-300',  icon: 'text-orange-400' },
  red:     { active: 'bg-red-500/20 text-red-400 border-red-500/30',       badge: 'bg-red-500/30 text-red-300',    icon: 'text-red-400' },
  purple:  { active: 'bg-purple-500/20 text-purple-400 border-purple-500/30',   badge: 'bg-purple-500/30 text-purple-300',  icon: 'text-purple-400' },
  cyan:    { active: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',      badge: 'bg-cyan-500/30 text-cyan-300',    icon: 'text-cyan-400' },
  emerald: { active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', badge: 'bg-emerald-500/30 text-emerald-300', icon: 'text-emerald-400' },
  indigo:  { active: 'bg-indigo-500/20 text-indigo-400 border-indigo-500/30',   badge: 'bg-indigo-500/30 text-indigo-300',  icon: 'text-indigo-400' },
  teal:    { active: 'bg-teal-500/20 text-teal-400 border-teal-500/30',      badge: 'bg-teal-500/30 text-teal-300',    icon: 'text-teal-400' },
  yellow:  { active: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',   badge: 'bg-yellow-500/30 text-yellow-300',  icon: 'text-yellow-400' },
  sky:     { active: 'bg-sky-500/20 text-sky-400 border-sky-500/30',       badge: 'bg-sky-500/30 text-sky-300',    icon: 'text-sky-400' },
  amber:   { active: 'bg-amber-500/20 text-amber-400 border-amber-500/30',    badge: 'bg-amber-500/30 text-amber-300',   icon: 'text-amber-400' },
};

export function ParametersView() {
  const { t } = useTranslation('params');
  const { connectionState, platformChangeInProgress } = useConnectionStore();
  const { isOpen: quickSetupOpen, isApplying: quickSetupApplying } = useQuickSetupStore();

  // Keep view mounted during any operation that causes temporary disconnection
  const keepViewMounted = platformChangeInProgress || quickSetupOpen || quickSetupApplying;
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
    commitStagedParams,
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
    // Offline mode
    offlineMode,
    offlineFilePath,
    offlineVehicleType,
    offlineHasUnsavedChanges,
    loadOfflineFile,
    saveOfflineFile,
    saveOfflineFileAs,
    setOfflineVehicleType,
    closeOfflineMode,
  } = useParameterStore();

  const nonDefaultColorKey = useSettingsStore((s) => s.nonDefaultHighlightColor);
  const setNonDefaultHighlightColor = useSettingsStore((s) => s.setNonDefaultHighlightColor);
  const nonDefaultColor = getNonDefaultColor(nonDefaultColorKey);

  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [editError, setEditError] = useState<string | null>(null);
  const [editWarning, setEditWarning] = useState<string | null>(null);

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [rebootRequiredParams, setRebootRequiredParams] = useState<string[]>([]);
  const [rebooting, setRebooting] = useState(false);
  const pendingParamRefresh = useRef(false);
  const [saveDropdownOpen, setSaveDropdownOpen] = useState(false);
  const saveDropdownRef = useRef<HTMLDivElement>(null);
  const [colorPickerOpen, setColorPickerOpen] = useState(false);
  const colorPickerRef = useRef<HTMLDivElement>(null);

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
    // Show confirmation dialog
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

      // PX4 persists PARAM_SET immediately, so the staged edits are sent here
      // (post-confirm) instead of asking the FC to flush RAM to flash.
      const result = connectionState.firmware === 'px4'
        ? await commitStagedParams().then(r => r.failed.length === 0
            ? { success: true as const }
            : { success: false as const, error: t('paramsView.write-failed-params', { params: r.failed.join(', ') }) })
        : await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        // Check if any written params require a reboot
        const rebootParams = modified.filter(p => isRebootRequired(p.id)).map(p => p.id);
        if (rebootParams.length > 0) {
          setRebootRequiredParams(rebootParams);
        }

        markAllAsSaved();
        showToast(t('paramsView.saved-to-flash'), 'success');
      } else {
        showToast(result?.error ?? t('paramsView.write-failed'), 'error');
      }
    } catch {
      showToast(t('paramsView.write-failed'), 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState, isRebootRequired, commitStagedParams, t]);

  const handleReboot = useCallback(async () => {
    setRebooting(true);
    try {
      const success = await window.electronAPI?.mavlinkReboot();
      if (success) {
        if (rebootRequiredParams.length > 0) {
          pendingParamRefresh.current = true;
        } else {
          showToast(t('paramsView.rebooting'), 'info');
        }
      } else {
        setRebooting(false);
        showToast(t('paramsView.reboot-failed-command'), 'error');
      }
    } catch {
      setRebooting(false);
      showToast(t('paramsView.reboot-failed'), 'error');
    }
  }, [showToast, rebootRequiredParams, t]);

  // Watch for reconnection completion after a reboot we initiated
  useEffect(() => {
    if (!pendingParamRefresh.current) return;
    if (connectionState.isConnected && !connectionState.isReconnecting) {
      pendingParamRefresh.current = false;
      setRebooting(false);
      setRebootRequiredParams([]);
      showToast(t('paramsView.reboot-complete'), 'success');
    }
  }, [connectionState.isConnected, connectionState.isReconnecting, showToast, t]);

  const handleSaveToFile = useCallback(async (mode: 'all' | 'changed' | 'nondefault') => {
    setIsSavingFile(true);
    setSaveDropdownOpen(false);
    try {
      const allParams = Array.from(parameters.values());
      let filtered;
      if (mode === 'changed') {
        filtered = allParams.filter(p => !p.isReadOnly && p.isModified);
      } else if (mode === 'nondefault') {
        filtered = allParams.filter(p => !p.isReadOnly && p.defaultValue !== undefined && Math.fround(p.value) !== Math.fround(p.defaultValue));
      } else {
        filtered = allParams.filter(p => !p.isReadOnly);
      }

      const params = filtered
        .sort((a, b) => a.id.localeCompare(b.id))
        .map(p => ({ id: p.id, value: p.value }));

      if (params.length === 0) {
        const labels = {
          all: { text: 'No parameters to save', key: 'paramsView.save-no-params' },
          changed: { text: 'No changed parameters to save', key: 'paramsView.save-no-changed-params' },
          nondefault: { text: 'No non-default parameters to save', key: 'paramsView.save-no-nondefault-params' },
        } as const;
        showToast(pvText(t, labels[mode].key, labels[mode].text), 'info');
        return;
      }

      const vehicleType = connectionState.vehicleType || connectionState.fcVariant;
      const result = await window.electronAPI?.saveParamsToFile(params, vehicleType);
      if (result?.success) {
        showToast(t('paramsView.saved-params-to-file', { n: params.length }), 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsSavingFile(false);
    }
  }, [parameters, connectionState.vehicleType, connectionState.fcVariant, showToast, t]);

  const handleLoadFromFile = useCallback(async () => {
    setIsLoadingFile(true);
    try {
      const result = await window.electronAPI?.loadParamsFromFile();
      if (result?.success && result.params) {
        // Load file params for comparison - do NOT auto-set on vehicle
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
      const appliedMessage = t('paramsView.apply-applied', { n: result.applied })
        + (result.failed > 0 ? t('paramsView.apply-failed-suffix', { n: result.failed }) : '')
        + t('paramsView.apply-save-hint');
      showToast(appliedMessage, result.failed > 0 ? 'info' : 'success');
    } else if (result.failed > 0) {
      showToast(t('paramsView.apply-failed', { n: result.failed }), 'error');
    }
  }, [applySelectedFileParams, showToast, t]);

  // Offline mode handlers
  const handleOpenOfflineFile = useCallback(async () => {
    const success = await loadOfflineFile();
    if (!success) {
      // Cancelled or failed - no toast needed for cancel
    }
  }, [loadOfflineFile]);

  const handleOfflineSave = useCallback(async () => {
    const success = await saveOfflineFile();
    if (success) {
      showToast(t('paramsView.parameters-saved-to-file'), 'success');
    }
  }, [saveOfflineFile, showToast, t]);

  const handleOfflineSaveAs = useCallback(async () => {
    const success = await saveOfflineFileAs();
    if (success) {
      showToast(t('paramsView.parameters-saved-to-file'), 'success');
    }
  }, [saveOfflineFileAs, showToast, t]);

  const handleOfflineCompare = useCallback(async () => {
    const result = await window.electronAPI?.loadParamsFromFile();
    if (result?.success && result.params) {
      loadFileForCompare(result.params, result.vehicleType);
    }
  }, [loadFileForCompare]);

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

  // Strict number validation - rejects "0c", "1.2.3", etc.
  const isValidNumberString = useCallback((str: string): boolean => {
    const trimmed = str.trim();
    if (trimmed === '') return false;
    // Use Number() which is stricter than parseFloat()
    // parseFloat("0c") = 0, but Number("0c") = NaN
    return !isNaN(Number(trimmed)) && isFinite(Number(trimmed));
  }, []);

  const handleEditChange = useCallback((paramId: string, value: string) => {
    setEditValue(value);
    if (!isValidNumberString(value)) {
      setEditError(t('paramsView.invalid-number'));
      setEditWarning(null);
    } else {
      const numValue = Number(value.trim());
      const result = validateParameter(paramId, numValue);
      setEditError(result.error ?? null);
      setEditWarning(result.warning ?? null);
    }
  }, [validateParameter, isValidNumberString, t]);

  const saveEdit = useCallback(async (paramId: string) => {
    if (!isValidNumberString(editValue)) {
      setEditError(t('paramsView.invalid-number'));
      return;
    }
    const newValue = Number(editValue.trim());
    // Validate before saving
    const result = validateParameter(paramId, newValue);
    if (!result.valid) {
      setEditError(result.error ?? t('paramsView.invalid-value'));
      return;
    }
    await setParameter(paramId, newValue);
    cancelEdit();
  }, [editValue, setParameter, cancelEdit, validateParameter, t]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, paramId: string) => {
    if (e.key === 'Enter') {
      saveEdit(paramId);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  // Show Legacy CLI config for F3 boards (iNav < 2.1, Betaflight < 4.0)
  if (connectionState.isConnected && connectionState.protocol === 'msp' && connectionState.isLegacyBoard) {
    return <LegacyConfigView />;
  }

  // Show MSP config for modern Betaflight/iNav boards
  // Keep showing during any operation that causes temp disconnection (platform change, quick setup, etc.)
  if ((connectionState.isConnected && connectionState.protocol === 'msp') || keepViewMounted) {
    return <MspConfigView />;
  }

  // Show MAVLink config for ArduPilot/PX4 boards
  if (connectionState.isConnected && connectionState.protocol === 'mavlink') {
    return <MavlinkConfigView />;
  }

  if (!connectionState.isConnected && !keepViewMounted && !offlineMode) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border-subtle flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-content mb-3">
            {t('paramsView.configuration')}
          </h2>
          <p className="text-content-secondary mb-6 leading-relaxed">
            {t('paramsView.connect-prompt')}
          </p>

          <button
            onClick={handleOpenOfflineFile}
            className="w-full mb-4 px-4 py-3 bg-blue-500/20 hover:bg-blue-500/30 text-blue-400 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 border-blue-500/20 hover:border-blue-500/30"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
            </svg>
            {t('paramsView.open-parameter-file')}
          </button>

          <div className="p-4 rounded-xl bg-surface border-subtle text-left">
            <h3 className="text-sm font-medium text-content mb-2">{t('paramsView.what-you-can-do')}</h3>
            <ul className="text-xs text-content-secondary space-y-1">
              <li>- {t('paramsView.capability-ardupilot')}</li>
              <li>- {t('paramsView.capability-betaflight')}</li>
              <li>- {t('paramsView.capability-offline')}</li>
              <li>- {t('paramsView.capability-search')}</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const displayParams = filteredParameters();
  const paramCount = parameters.size;
  const modified = modifiedCount();
  const nonDefaultCount = nonDefaultCountFn();
  const hasDefaults = hasDefaultsFn();

  return (
    <div className="h-full flex flex-col">
      {/* Offline mode banner */}
      {offlineMode && (
        <div className="shrink-0 px-4 py-2 bg-blue-500/10 border-b border-blue-500/20 flex items-center gap-3">
          <svg className="w-4 h-4 text-blue-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm text-blue-300 truncate flex-1" title={offlineFilePath ?? undefined}>
            {offlineFilePath ? offlineFilePath.split('/').pop()?.split('\\').pop() : t('paramsView.untitled')}
            {offlineHasUnsavedChanges && <span className="text-yellow-400 ml-1">*</span>}
          </span>
          <select
            value={offlineVehicleType ?? ''}
            onChange={(e) => setOfflineVehicleType(e.target.value)}
            className="text-xs text-content bg-surface border-subtle px-2 py-1 rounded cursor-pointer focus:outline-none focus:border-blue-500/50"
            title={t('paramsView.vehicle-type-title')}
          >
            <option value="">{t('paramsView.vehicle-type')}</option>
            <option value="Copter">Copter</option>
            <option value="Plane">Plane</option>
            <option value="Rover">Rover</option>
            <option value="Sub">Sub</option>
            <option value="Tracker">Tracker</option>
          </select>
          <button
            onClick={closeOfflineMode}
            className="text-xs text-content-secondary hover:text-content transition-colors"
            title={t('paramsView.close-file-title')}
          >
            {t('paramsView.close')}
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="shrink-0 px-4 py-3 border-b border-subtle bg-surface">
        <div className="flex items-center gap-2">
          {offlineMode ? (<>
            {/* Offline toolbar: Save, Save As, Open, Compare */}
            <button
              onClick={handleOfflineSave}
              disabled={!offlineHasUnsavedChanges}
              className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-surface-raised text-green-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.save-to-current-file-title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {t('paramsView.save')}
            </button>

            <button
              onClick={handleOfflineSaveAs}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.save-to-new-file-title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              {t('paramsView.save-as')}
            </button>

            <div className="w-px h-6 bg-surface-raised mx-1" />

            <button
              onClick={handleOpenOfflineFile}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised text-content rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.open-another-file-title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 19a2 2 0 01-2-2V7a2 2 0 012-2h4l2 2h4a2 2 0 012 2v1M5 19h14a2 2 0 002-2v-5a2 2 0 00-2-2H9a2 2 0 00-2 2v5a2 2 0 01-2 2z" />
              </svg>
              {t('paramsView.open')}
            </button>

            <button
              onClick={handleOfflineCompare}
              disabled={paramCount === 0}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.compare-file-title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
              </svg>
              {t('paramsView.compare')}
            </button>
          </>) : (<>
            {/* Connected toolbar */}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.download-title')}
            >
              <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              {isLoading ? t('paramsView.downloading') : t('paramsView.refresh')}
            </button>

            {/* Write to Flash button - only show if there are modified params */}
            {modified > 0 && (
              <button
                onClick={handleWriteToFlashClick}
                disabled={isWritingFlash}
                className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-surface-raised text-green-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
                title={t('paramsView.write-to-flash-title')}
              >
                <svg className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                </svg>
                {isWritingFlash ? t('paramsView.writing') : t('paramsView.write-to-flash')}
              </button>
            )}

            <div className="w-px h-6 bg-surface-raised mx-1" />

            {/* File operations - split Save button with dropdown */}
            <div className="relative" ref={saveDropdownRef}>
              <div className="flex">
                <button
                  onClick={() => handleSaveToFile('all')}
                  disabled={isSavingFile || paramCount === 0}
                  className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-l-lg text-sm font-medium transition-colors flex items-center gap-2"
                  title={t('paramsView.save-all-title')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                  {isSavingFile ? t('paramsView.saving') : t('paramsView.save')}
                </button>
                <button
                  onClick={() => setSaveDropdownOpen(prev => !prev)}
                  disabled={isSavingFile || paramCount === 0}
                  className="px-1.5 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-r-lg border-l border/30 text-sm transition-colors"
                  title={t('paramsView.save-options-title')}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>
              {saveDropdownOpen && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-surface-solid border-subtle rounded-lg shadow-xl z-50 py-1">
                  <button
                    onClick={() => handleSaveToFile('all')}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised transition-colors"
                  >
                    {t('paramsView.save-all-parameters')}
                  </button>
                  <button
                    onClick={() => handleSaveToFile('changed')}
                    disabled={modified === 0}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised disabled:text-content-tertiary disabled:hover:bg-transparent transition-colors"
                  >
                    {t('paramsView.save-changed-only')}
                    {modified > 0 && <span className="ml-1 text-xs text-yellow-400">({modified})</span>}
                  </button>
                  <button
                    onClick={() => handleSaveToFile('nondefault')}
                    disabled={!hasDefaults}
                    className="w-full px-3 py-2 text-left text-sm text-content hover:bg-surface-raised disabled:text-content-tertiary disabled:hover:bg-transparent transition-colors"
                    title={!hasDefaults ? t('paramsView.defaults-unavailable') : undefined}
                  >
                    {t('paramsView.save-non-default-only')}
                    {hasDefaults && nonDefaultCount > 0 && <span className="ml-1 text-xs text-purple-400">({nonDefaultCount})</span>}
                  </button>
                </div>
              )}
            </div>

            <button
              onClick={handleLoadFromFile}
              disabled={isLoadingFile}
              className="px-3 py-2 bg-surface-raised hover:bg-surface-raised disabled:bg-surface text-content disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title={t('paramsView.load-title')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {isLoadingFile ? t('paramsView.loading') : t('paramsView.load')}
            </button>
          </>)}

          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder={t('paramsView.search-placeholder')}
              className="w-full max-w-md px-4 py-2 pl-10 bg-surface border-subtle rounded-lg text-sm text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-content-secondary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {favouriteCount() > 0 && (
            <button
              onClick={toggleShowOnlyFavourites}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyFavourites
                  ? 'bg-yellow-500/30 text-yellow-300 ring-1 ring-yellow-500/50'
                  : 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30'
              }`}
              title={showOnlyFavourites ? t('paramsView.show-all') : t('paramsView.show-only-favourites')}
            >
              <Star className={`w-3 h-3 ${showOnlyFavourites ? 'fill-yellow-300' : ''}`} />
              {t('paramsView.favourites-count', { n: favouriteCount() })}
            </button>
          )}

          {modified > 0 && (
            <button
              onClick={toggleShowOnlyModified}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                showOnlyModified
                  ? 'bg-amber-500/30 text-amber-300 ring-1 ring-amber-500/50'
                  : 'bg-amber-500/20 text-amber-400 hover:bg-amber-500/30'
              }`}
              title={showOnlyModified ? t('paramsView.show-all') : t('paramsView.show-only-modified')}
            >
              {showOnlyModified && (
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z" />
                </svg>
              )}
              {t('paramsView.modified-count', { n: modified })}
            </button>
          )}

          {hasDefaults && nonDefaultCount > 0 && (
            <div ref={colorPickerRef} className="relative flex items-center rounded-full bg-surface-overlay-subtle ring-1 ring-subtle">
              <button
                onClick={toggleShowOnlyNonDefault}
                className={`pl-3 pr-2 py-1 rounded-l-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
                  showOnlyNonDefault
                    ? 'bg-surface-raised text-content ring-1 ring-subtle'
                    : 'text-content-secondary hover:bg-surface-raised hover:text-content'
                }`}
                title={showOnlyNonDefault ? t('paramsView.show-all') : t('paramsView.show-only-non-default')}
              >
                <span className={`inline-block w-2 h-2 rounded-full ${nonDefaultColor.swatchClass}`} />
                {t('paramsView.non-default-count', { n: nonDefaultCount })}
              </button>
              <button
                onClick={() => setColorPickerOpen((o) => !o)}
                className="pl-1.5 pr-2 py-1 rounded-r-full text-content-secondary hover:text-content hover:bg-surface-raised transition-colors flex items-center gap-1 border-l border-subtle/60"
                title={t('paramsView.pick-highlight-color-title')}
                aria-haspopup="menu"
                aria-expanded={colorPickerOpen}
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {colorPickerOpen && (
                <div
                  role="menu"
                  className="absolute right-0 top-full mt-1.5 z-30 w-44 rounded-lg bg-surface-solid border border-strong shadow-lg p-2"
                >
                  <div className="px-1.5 pb-1.5 text-[10px] uppercase tracking-wider text-content-tertiary">{t('paramsView.highlight-color')}</div>
                  <div className="grid grid-cols-4 gap-1">
                    {NON_DEFAULT_COLORS.map((c) => {
                      const active = c.key === nonDefaultColorKey;
                      return (
                        <button
                          key={c.key}
                          onClick={() => { setNonDefaultHighlightColor(c.key); setColorPickerOpen(false); }}
                          className={`relative h-7 rounded-md ${c.swatchClass} transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-offset-surface-solid focus:ring-white/40 ${active ? 'ring-2 ring-white/80 ring-offset-1 ring-offset-surface-solid' : ''}`}
                          title={pvText(t, c.labelKey, c.label)}
                          aria-label={pvText(t, c.labelKey, c.label)}
                        >
                          {active && <Check className="w-3.5 h-3.5 text-white absolute inset-0 m-auto drop-shadow" />}
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
              <span>{t('paramsView.downloading-parameters')}</span>
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

        {/* Error message */}
        {error && (
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
              // Don't show groups with 0 parameters (except 'all')
              if (group.id !== 'all' && count === 0) return null;

              const colors = GROUP_COLOR_CLASSES[group.color] ?? GROUP_COLOR_CLASSES.blue!;
              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? colors.active
                      : 'text-content-secondary hover:text-content hover:bg-surface'
                  }`}
                  title={pvText(t, group.descriptionKey, group.description)}
                >
                  <svg className={`w-3.5 h-3.5 ${colors.icon}${isActive ? '' : ' opacity-50'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                  </svg>
                  {pvText(t, group.nameKey, group.name)}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? colors.badge : 'bg-surface-raised text-content-secondary'
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

      {/* Reboot Required Banner - only when connected to FC */}
      {!offlineMode && rebootRequiredParams.length > 0 && (
        <div className={`shrink-0 px-4 py-2.5 border-b flex items-center justify-between ${
          rebooting
            ? 'bg-blue-500/10 border-blue-500/30'
            : 'bg-amber-500/10 border-amber-500/30'
        }`}>
          <div className="flex items-center gap-2.5">
            {rebooting ? (
              <Loader2 className="w-4 h-4 text-blue-400 animate-spin shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            {rebooting ? (
              <span className="text-sm text-blue-300">
                {connectionState.isReconnecting
                  ? t('paramsView.reconnecting')
                  : t('paramsView.rebooting')}
                {connectionState.isReconnecting && connectionState.reconnectAttempt != null && (
                  <span className="text-blue-400/70 ml-2">
                    {t('paramsView.reconnect-attempt', { n: connectionState.reconnectAttempt })}{connectionState.reconnectMaxAttempts ? ` / ${connectionState.reconnectMaxAttempts}` : ''}
                  </span>
                )}
              </span>
            ) : (
              <span className="text-sm text-amber-300">
                {t('paramsView.reboot-required', { n: rebootRequiredParams.length })}
                {' '}<span className="font-mono text-xs text-amber-400/70">{rebootRequiredParams.join(', ')}</span>
              </span>
            )}
          </div>
          {!rebooting && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setRebootRequiredParams([])}
                className="px-2.5 py-1 text-xs text-content-secondary hover:text-content transition-colors"
              >
                {t('paramsView.dismiss')}
              </button>
              <button
                onClick={handleReboot}
                className="px-2.5 py-1 text-xs font-medium rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border-amber-500/30 transition-colors flex items-center gap-1.5"
              >
                <RotateCw className="w-3 h-3" />
                {t('paramsView.reboot-now')}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Parameter table */}
      <div className="flex-1 overflow-auto">
        {paramCount === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center text-content-secondary">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-content-tertiary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">{t('paramsView.loading-parameters')}</p>
              <p className="text-sm text-content-tertiary">{t('paramsView.auto-download-hint')}</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-surface backdrop-blur border-b border-subtle">
              <tr className="text-left text-xs text-content-secondary uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-[220px]">
                  <button
                    onClick={() => toggleSort('name')}
                    className="group flex items-center hover:text-content transition-colors"
                  >
                    {t('paramsView.col-name')}
                    <SortIndicator column="name" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[200px]">
                  <button
                    onClick={() => toggleSort('status')}
                    className="group flex items-center hover:text-content transition-colors"
                  >
                    {t('paramsView.col-value')}
                    <SortIndicator column="status" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[80px]">{t('paramsView.col-type')}</th>
                <th className="px-4 py-3 font-medium">{t('paramsView.col-description')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-subtle/30">
              {displayParams.map((param) => {
                const isNonDefault = !param.isReadOnly && (
                  param.defaultValue !== undefined
                    ? Math.fround(param.value) !== Math.fround(param.defaultValue)
                    : param.isModified
                );
                return (
                <tr
                  key={param.id}
                  className="hover:bg-surface-overlay-subtle transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={(e) => { e.stopPropagation(); toggleFavourite(param.id); }}
                        className="shrink-0 p-0.5 rounded transition-colors hover:bg-surface-raised"
                        title={isFavourite(param.id) ? t('paramsView.remove-from-favourites') : t('paramsView.add-to-favourites')}
                      >
                        <Star className={`w-3.5 h-3.5 ${isFavourite(param.id) ? 'fill-yellow-400 text-yellow-400' : 'text-content-tertiary hover:text-content-secondary'}`} />
                      </button>
                      <span className="font-mono text-sm text-content">{param.id}</span>
                      {isRebootRequired(param.id) && (
                        <span className="px-1 py-0.5 text-[9px] leading-none bg-amber-500/15 text-amber-500/70 rounded border-amber-500/20" title={t('paramsView.requires-reboot-title')}>
                          {t('paramsView.reboot-badge')}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      {param.isReadOnly ? (
                        <span className="font-mono text-sm text-content-secondary tabular-nums" title={t('paramsView.read-only-title')}>
                          {formatParamValue(param.value)}
                        </span>
                      ) : editingParam === param.id ? (
                        <div className="relative flex-1">
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
                      ) : (
                        <button
                          onClick={() => startEdit(param.id, param.value)}
                          className={`font-mono text-sm ${isNonDefault ? nonDefaultColor.textClass : 'text-content'} hover:text-blue-400 transition-colors tabular-nums`}
                          title={(() => {
                            const meta = getParameterMetadata(param.id);
                            const hints: string[] = [];
                            if (isNonDefault && param.defaultValue !== undefined) {
                              hints.push(t('paramsView.hint-default', { value: formatParamValue(param.defaultValue) }));
                            }
                            if (meta?.range) hints.push(t('paramsView.hint-range', { min: meta.range.min, max: meta.range.max }));
                            if (meta?.values) hints.push(t('paramsView.hint-values', { values: Object.entries(meta.values).map(([k,v]) => `${k}=${v}`).join(', ') }));
                            if (meta?.units) hints.push(t('paramsView.hint-units', { units: meta.units }));
                            return hints.length > 0 ? hints.join('\n') : undefined;
                          })()}
                        >
                          {formatParamValue(param.value)}
                        </button>
                      )}
                      {param.isReadOnly ? (
                        <span className="px-1.5 py-0.5 bg-surface-raised text-content-secondary rounded text-[10px] shrink-0">
                          {t('paramsView.read-only-badge')}
                        </span>
                      ) : param.isModified ? (
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="px-1.5 py-0.5 bg-amber-500/20 text-amber-400 rounded text-[10px]">
                            {t('paramsView.modified-badge')}
                          </span>
                          <button
                            onClick={() => revertParameter(param.id)}
                            className="text-[10px] text-content-secondary hover:text-content"
                            title={t('paramsView.revert-to', { value: formatParamValue(param.originalValue ?? param.value) })}
                          >
                            {t('paramsView.revert')}
                          </button>
                        </div>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-content-secondary">{getParamTypeName(param.type)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-sm line-clamp-2 ${
                        hasOfficialDescription(param.id)
                          ? 'text-content-secondary'
                          : 'text-content-secondary italic'
                      }`}
                      title={hasOfficialDescription(param.id) ? undefined : t('paramsView.auto-generated-description')}
                    >
                      {getDescription(param.id)}
                    </span>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-4 py-2 border-t border-subtle bg-surface text-xs text-content-secondary flex items-center gap-4">
        <span>{t('paramsView.parameter-count', { n: paramCount })}</span>
        {(searchQuery || selectedGroup !== 'all' || showOnlyModified || showOnlyNonDefault || showOnlyFavourites) && displayParams.length !== paramCount && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>{t('paramsView.shown-count', { n: displayParams.length })}</span>
          </>
        )}
        {showOnlyFavourites && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-yellow-400">{t('paramsView.favourites-only')}</span>
          </>
        )}
        {showOnlyModified && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className="text-amber-400">{t('paramsView.modified-only')}</span>
          </>
        )}
        {showOnlyNonDefault && (
          <>
            <span className="text-content-tertiary">|</span>
            <span className={nonDefaultColor.textClass}>{t('paramsView.non-default-only')}</span>
          </>
        )}
        {selectedGroup !== 'all' && (
          <>
            <span className="text-content-tertiary">|</span>
            <span>{t('paramsView.group-label', { name: (() => { const g = PARAMETER_GROUPS.find(x => x.id === selectedGroup); return g ? pvText(t, g.nameKey, g.name) : ''; })() })}</span>
          </>
        )}
        {offlineMode ? (<>
          <span className="text-content-tertiary">|</span>
          <span className="text-blue-400">{t('paramsView.offline')}</span>
        </>) : (<>
          <span className="text-content-tertiary">|</span>
          <span>{t('paramsView.system-id', { id: connectionState.systemId ?? '-' })}</span>
          {lastRefresh > 0 && (
            <>
              <span className="text-content-tertiary">|</span>
              <span>{t('paramsView.last-refresh', { time: new Date(lastRefresh).toLocaleTimeString() })}</span>
            </>
          )}
        </>)}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">{t('paramsView.write-params-to-flash')}</h3>
              <p className="text-sm text-content-secondary mt-1">
                {t('paramsView.write-confirm-body', { n: modifiedParameters().length })}
              </p>
              {modifiedParameters().some(p => isRebootRequired(p.id)) && (
                <p className="text-sm text-amber-400 mt-1.5 flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  {t('paramsView.some-require-reboot')}
                </p>
              )}
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-content-secondary uppercase">
                    <th className="pb-2">{t('paramsView.col-parameter')}</th>
                    <th className="pb-2 text-right">{t('paramsView.col-original')}</th>
                    <th className="pb-2 text-center px-2">→</th>
                    <th className="pb-2">{t('paramsView.col-new')}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-subtle">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-content">
                        {param.id}
                        {isRebootRequired(param.id) && (
                          <span className="ml-2 px-1.5 py-0.5 text-[10px] bg-amber-500/20 text-amber-400 rounded">
                            {t('paramsView.reboot-badge')}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-right font-mono text-content-secondary">{formatParamValue(param.originalValue ?? param.value)}</td>
                      <td className="py-2 text-center text-content-tertiary">→</td>
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
                {t('paramsView.cancel')}
              </button>
              <button
                onClick={handleWriteToFlashConfirm}
                className="px-4 py-2 bg-green-500/20 hover:bg-green-500/30 text-green-400 rounded-lg text-sm font-medium transition-colors"
              >
                {t('paramsView.write-to-flash')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* File Compare Modal */}
      {showCompareModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-surface-solid border rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-subtle">
              <h3 className="text-lg font-semibold text-content">{t('paramsView.compare-parameters')}</h3>
              <p className="text-sm text-content-secondary mt-1">
                {fileParamDiffs.length === 0
                  ? (offlineMode ? t('paramsView.no-diffs-file') : t('paramsView.no-diffs-vehicle'))
                  : t('paramsView.diffs-found', { n: fileParamDiffs.length })
                }
              </p>
              {(() => {
                const currentVehicle = offlineMode ? offlineVehicleType : (connectionState.vehicleType || connectionState.fcVariant);
                return fileVehicleType && currentVehicle && fileVehicleType !== currentVehicle ? (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 bg-amber-500/10 border-amber-500/30 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span className="text-xs text-amber-300">
                      {t('paramsView.vehicle-mismatch', { fileType: fileVehicleType, vehicleType: currentVehicle })}
                    </span>
                  </div>
                ) : null;
              })()}
              {fileSkippedCount > 0 && (
                <p className="text-xs text-content-secondary mt-2">
                  {t('paramsView.file-stats', { total: fileTotalCount, matched: fileTotalCount - fileSkippedCount, skipped: fileSkippedCount })}
                </p>
              )}
            </div>

            {fileParamDiffs.length > 0 && (
              <>
                {/* Select all / Deselect all */}
                <div className="px-6 py-2 border-b border-subtle flex items-center gap-3">
                  <button
                    onClick={selectAllDiffs}
                    className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
                  >
                    {t('paramsView.select-all')}
                  </button>
                  <span className="text-content-tertiary">|</span>
                  <button
                    onClick={deselectAllDiffs}
                    className="text-xs text-content-secondary hover:text-content transition-colors"
                  >
                    {t('paramsView.deselect-all')}
                  </button>
                  <span className="ml-auto text-xs text-content-secondary">
                    {t('paramsView.selected-count', { n: fileParamDiffs.filter(d => d.selected).length, m: fileParamDiffs.length })}
                  </span>
                </div>

                <div className="flex-1 overflow-auto px-6 py-2">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-xs text-content-secondary uppercase">
                        <th className="pb-2 w-8"></th>
                        <th className="pb-2">{t('paramsView.col-parameter')}</th>
                        <th className="pb-2 text-right">{offlineMode ? t('paramsView.col-current') : t('paramsView.col-vehicle')}</th>
                        <th className="pb-2 text-center w-8"></th>
                        <th className="pb-2">{t('paramsView.compare')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-subtle">
                      {fileParamDiffs.map(diff => (
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
                            {diff.note && (
                              <div className="text-xs text-content-tertiary font-sans mt-0.5">{diff.note}</div>
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
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* Progress bar while applying */}
            {isApplyingFileParams && applyProgress && (
              <div className="px-6 py-2 border-t border-subtle">
                <div className="flex items-center justify-between text-xs text-content-secondary mb-1">
                  <span>{t('paramsView.applying-parameters')}</span>
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
                {fileParamDiffs.length === 0 ? t('paramsView.close') : t('paramsView.cancel')}
              </button>
              {fileParamDiffs.length > 0 && (
                <button
                  onClick={handleApplySelectedParams}
                  disabled={isApplyingFileParams || fileParamDiffs.filter(d => d.selected).length === 0}
                  className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-surface-raised text-blue-400 disabled:text-content-tertiary rounded-lg text-sm font-medium transition-colors"
                >
                  {isApplyingFileParams
                    ? t('paramsView.applying')
                    : t('paramsView.apply-n-params', { n: fileParamDiffs.filter(d => d.selected).length })
                  }
                </button>
              )}
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
}
