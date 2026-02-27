/**
 * ParameterTable
 *
 * Full parameter table for expert users.
 * Provides search, filter, edit, and file operations.
 */

import React, { useState, useCallback } from 'react';
import { History } from 'lucide-react';
import { useParameterStore, type SortColumn } from '../../stores/parameter-store';
import { PARAMETER_GROUPS } from '../../../shared/parameter-groups';
import { useConnectionStore } from '../../stores/connection-store';
import BitmaskEditor from './BitmaskEditor';
import ParamHistoryModal from './ParamHistoryModal';

// Toast notification state
type ToastType = 'success' | 'error' | 'info';
interface Toast {
  message: string;
  type: ToastType;
}

/**
 * Format a parameter value for display.
 * Strips IEEE 754 float32 representation noise (precision beyond ~7 sig digits)
 * but preserves all meaningful precision. Edit field always uses raw value.
 */
function formatParamValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  // float32 has ~7 significant digits. Anything beyond that is IEEE noise.
  // toPrecision(7) then parseFloat strips trailing zeros.
  return String(parseFloat(value.toPrecision(7)));
}

/** Group color map for filter tabs */
const GROUP_COLORS: Record<string, string> = {
  all: 'blue',
  arming: 'emerald',
  battery: 'orange',
  failsafe: 'red',
  flight_modes: 'purple',
  tuning: 'blue',
  gps: 'cyan',
  compass: 'pink',
  rc: 'teal',
  motors: 'amber',
  navigation: 'indigo',
  logging: 'zinc',
};

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
  } = useParameterStore();

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
        await window.electronAPI?.saveParamCheckpoint(boardUid, boardName,
          modified.map(p => ({ paramId: p.id, oldValue: p.originalValue ?? p.value, newValue: p.value }))
        );
      }

      const result = await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
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
  }, [markAllAsSaved, showToast, modifiedParameters, connectionState]);

  const handleSaveToFile = useCallback(async () => {
    setIsSavingFile(true);
    try {
      const params = Array.from(parameters.values()).map(p => ({ id: p.id, value: p.value }));
      const result = await window.electronAPI?.saveParamsToFile(params);
      if (result?.success) {
        showToast(`Saved ${params.length} parameters to file`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsSavingFile(false);
    }
  }, [parameters, showToast]);

  const handleLoadFromFile = useCallback(async () => {
    setIsLoadingFile(true);
    try {
      const result = await window.electronAPI?.loadParamsFromFile();
      if (result?.success && result.params) {
        let appliedCount = 0;
        for (const param of result.params) {
          const existing = parameters.get(param.id);
          if (existing) {
            await setParameter(param.id, param.value);
            appliedCount++;
          }
        }
        showToast(`Applied ${appliedCount} of ${result.params.length} parameters`, 'success');
      } else if (result?.error && result.error !== 'Cancelled') {
        showToast(result.error, 'error');
      }
    } finally {
      setIsLoadingFile(false);
    }
  }, [parameters, setParameter, showToast]);

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

  return (
    <div className="h-full flex flex-col">
      {/* Search & filter bar */}
      <div className="shrink-0 px-4 py-3 border-b border-zinc-800/50 bg-zinc-900/30">
        <div className="flex items-center gap-3">
          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search parameters..."
              className="w-full px-4 py-2 pl-10 bg-zinc-800/50 border border-zinc-700/50 rounded-lg text-sm text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-blue-500/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {/* File operations */}
          <button
            onClick={handleSaveToFile}
            disabled={isSavingFile || paramCount === 0}
            className="px-3 py-2 bg-zinc-700/30 hover:bg-zinc-700/50 disabled:bg-zinc-800/30 text-zinc-300 disabled:text-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Save parameters to file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {isSavingFile ? 'Saving...' : 'Save'}
          </button>

          <button
            onClick={handleLoadFromFile}
            disabled={isLoadingFile}
            className="px-3 py-2 bg-zinc-700/30 hover:bg-zinc-700/50 disabled:bg-zinc-800/30 text-zinc-300 disabled:text-zinc-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Load parameters from file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {isLoadingFile ? 'Loading...' : 'Load'}
          </button>

          <button
            onClick={() => setShowHistory(true)}
            className="px-3 py-2 bg-zinc-700/30 hover:bg-zinc-700/50 text-zinc-300 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="View parameter change history"
          >
            <History className="w-4 h-4" />
            History
          </button>

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
        </div>

        {/* Progress bar */}
        {isLoading && progress && (
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
              <span>Downloading parameters...</span>
              <span>{progress.received} / {progress.total} ({progress.percentage}%)</span>
            </div>
            <div className="h-1.5 bg-zinc-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message - hide while actively loading */}
        {error && !isLoading && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Group tabs */}
      {paramCount > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-zinc-800/50 bg-zinc-900/20 overflow-x-auto">
          <div className="flex gap-1">
            {PARAMETER_GROUPS.map((group) => {
              const count = groupCounts().get(group.id) ?? 0;
              const isActive = selectedGroup === group.id;
              if (group.id !== 'all' && count === 0) return null;
              const c = GROUP_COLORS[group.id] ?? 'zinc';

              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? `bg-${c}-500/20 text-${c}-400 border border-${c}-500/30`
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-800/50'
                  }`}
                  title={group.description}
                >
                  <svg className={`w-3.5 h-3.5 ${isActive ? `text-${c}-400` : `text-${c}-400 opacity-50`}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                  </svg>
                  {group.name}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? `bg-${c}-500/30 text-${c}-300` : 'bg-zinc-700/50 text-zinc-500'
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

      {/* Parameter table */}
      <div className="flex-1 overflow-auto">
        {paramCount === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center text-zinc-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-zinc-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">Loading parameters...</p>
              <p className="text-sm text-zinc-600">Parameters will download automatically when connected</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-900/95 backdrop-blur border-b border-zinc-800/50 z-10">
              <tr className="text-left text-xs text-zinc-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-[220px]">
                  <button
                    onClick={() => toggleSort('name')}
                    className="group flex items-center hover:text-zinc-300 transition-colors"
                  >
                    Name
                    <SortIndicator column="name" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[140px]">Value</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium w-[100px]">
                  <button
                    onClick={() => toggleSort('status')}
                    className="group flex items-center hover:text-zinc-300 transition-colors"
                  >
                    Status
                    <SortIndicator column="status" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {displayParams.map((param, idx) => (
                <tr
                  key={param.id}
                  className={`hover:bg-zinc-800/30 transition-colors ${idx % 2 === 0 ? 'bg-zinc-900/20' : ''}`}
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-sm text-zinc-200">{param.id}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {param.isReadOnly ? (
                      <span className="font-mono text-sm text-zinc-500 tabular-nums" title="Read-only parameter">
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
                          className={`w-full px-2 py-1 bg-zinc-800 border rounded text-sm font-mono text-zinc-200 focus:outline-none ${
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
                      return (
                        <div className="relative flex items-center gap-2">
                          <button
                            onClick={() => startEdit(param.id, param.value)}
                            className="font-mono text-sm text-zinc-300 hover:text-blue-400 transition-colors tabular-nums"
                            title={(() => {
                              const hints: string[] = [];
                              hints.push(`Raw: ${param.value}`);
                              if (meta?.range) hints.push(`Range: ${meta.range.min} to ${meta.range.max}`);
                              if (meta?.values) hints.push(`Values: ${Object.entries(meta.values).map(([k,v]) => `${k}=${v}`).join(', ')}`);
                              if (meta?.units) hints.push(`Units: ${meta.units}`);
                              return hints.join('\n');
                            })()}
                          >
                            {formatParamValue(param.value)}
                          </button>
                          {hasBitmask && (
                            <button
                              onClick={() => setBitmaskParam(bitmaskParam === param.id ? null : param.id)}
                              className="px-2 py-0.5 bg-blue-500/15 hover:bg-blue-500/25 text-blue-400 rounded text-xs font-medium transition-colors"
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
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-sm line-clamp-1 ${
                        hasOfficialDescription(param.id)
                          ? 'text-zinc-400'
                          : 'text-zinc-500 italic'
                      }`}
                      title={getDescription(param.id)}
                    >
                      {getDescription(param.id)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {param.isReadOnly ? (
                      <span className="px-2 py-0.5 bg-zinc-700/50 text-zinc-500 rounded text-xs">
                        Read-only
                      </span>
                    ) : param.isModified ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                          Modified
                        </span>
                        <button
                          onClick={() => revertParameter(param.id)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                          title={`Revert to ${param.originalValue}`}
                        >
                          (revert)
                        </button>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Status bar */}
      <div className="shrink-0 px-4 py-2 border-t border-zinc-800/50 bg-zinc-900/30 text-xs text-zinc-500 flex items-center gap-4">
        <span>{paramCount} parameters</span>
        {(searchQuery || selectedGroup !== 'all' || showOnlyModified) && displayParams.length !== paramCount && (
          <>
            <span className="text-zinc-700">|</span>
            <span>{displayParams.length} shown</span>
          </>
        )}
        {showOnlyModified && (
          <>
            <span className="text-zinc-700">|</span>
            <span className="text-amber-400">Modified only</span>
          </>
        )}
        {selectedGroup !== 'all' && (
          <>
            <span className="text-zinc-700">|</span>
            <span>Group: {PARAMETER_GROUPS.find(g => g.id === selectedGroup)?.name}</span>
          </>
        )}
        <span className="text-zinc-700">|</span>
        <span>System ID: {connectionState.systemId ?? '-'}</span>
        {lastRefresh > 0 && (
          <>
            <span className="text-zinc-700">|</span>
            <span>Last refresh: {new Date(lastRefresh).toLocaleTimeString()}</span>
          </>
        )}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-zinc-800">
              <h3 className="text-lg font-semibold text-white">Write Parameters to Flash</h3>
              <p className="text-sm text-zinc-400 mt-1">
                The following {modifiedParameters().length} parameter(s) will be saved permanently to the flight controller.
              </p>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500 uppercase">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2 text-right">Original</th>
                    <th className="pb-2 text-center px-2">-</th>
                    <th className="pb-2">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-zinc-300">{param.id}</td>
                      <td className="py-2 text-right font-mono text-zinc-500">{param.originalValue}</td>
                      <td className="py-2 text-center text-zinc-600">-</td>
                      <td className="py-2 font-mono text-amber-400">{param.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-zinc-800 flex justify-end gap-3">
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
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

      {/* Toast notification */}
      {toast && (
        <div className={`fixed bottom-4 right-4 px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 z-50 ${
          toast.type === 'success' ? 'bg-green-500/20 border border-green-500/30 text-green-400' :
          toast.type === 'error' ? 'bg-red-500/20 border border-red-500/30 text-red-400' :
          'bg-blue-500/20 border border-blue-500/30 text-blue-400'
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
