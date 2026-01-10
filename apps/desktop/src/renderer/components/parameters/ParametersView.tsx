/**
 * Parameters View - Full parameter management
 * Routes to protocol-specific config views:
 * - MSP: Betaflight/iNav config (MspConfigView)
 * - MAVLink: ArduPilot config (MavlinkConfigView)
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore, type SortColumn } from '../../stores/parameter-store';
import { getParamTypeName } from '../../../shared/parameter-types';
import { PARAMETER_GROUPS } from '../../../shared/parameter-groups';
import { MspConfigView } from './MspConfigView';
import MavlinkConfigView from '../mavlink-config/MavlinkConfigView';
import { LegacyConfigView } from '../legacy-config';

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

export function ParametersView() {
  const { connectionState, platformChangeInProgress } = useConnectionStore();
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

  const [isWritingFlash, setIsWritingFlash] = useState(false);
  const [isSavingFile, setIsSavingFile] = useState(false);
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [showWriteConfirm, setShowWriteConfirm] = useState(false);
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
    // Show confirmation dialog
    setShowWriteConfirm(true);
  }, []);

  const handleWriteToFlashConfirm = useCallback(async () => {
    setShowWriteConfirm(false);
    setIsWritingFlash(true);
    try {
      const result = await window.electronAPI?.writeParamsToFlash();
      if (result?.success) {
        markAllAsSaved();
        showToast('Parameters saved to flash successfully', 'success');
      } else {
        showToast(result?.error ?? 'Failed to write to flash', 'error');
      }
    } catch (err) {
      showToast('Failed to write to flash', 'error');
    } finally {
      setIsWritingFlash(false);
    }
  }, [markAllAsSaved, showToast]);

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
        // Apply loaded parameters
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
    // Validate before saving
    const result = validateParameter(paramId, newValue);
    if (!result.valid) {
      setEditError(result.error ?? 'Invalid value');
      return;
    }
    await setParameter(paramId, newValue);
    cancelEdit();
  }, [editValue, setParameter, cancelEdit, validateParameter]);

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
  // Keep showing during platform change (board reboots but we auto-reconnect)
  if ((connectionState.isConnected && connectionState.protocol === 'msp') || platformChangeInProgress) {
    return <MspConfigView />;
  }

  // Show MAVLink config for ArduPilot/PX4 boards
  if (connectionState.isConnected && connectionState.protocol === 'mavlink') {
    return <MavlinkConfigView />;
  }

  if (!connectionState.isConnected && !platformChangeInProgress) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-gray-700/50 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-white mb-3">
            Configuration
          </h2>
          <p className="text-gray-400 mb-6 leading-relaxed">
            Connect to your flight controller to configure your vehicle.
            Supports ArduPilot, PX4, Betaflight, and iNav.
          </p>

          <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30 text-left">
            <h3 className="text-sm font-medium text-gray-200 mb-2">What you can do:</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• <span className="text-gray-400">ArduPilot/PX4:</span> Full parameter management</li>
              <li>• <span className="text-gray-400">Betaflight/iNav:</span> PID tuning, rates, flight modes</li>
              <li>• Search, filter, and edit with validation</li>
              <li>• Save changes to flight controller</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  const displayParams = filteredParameters();
  const paramCount = parameters.size;
  const modified = modifiedCount();

  return (
    <div className="h-full flex flex-col">
      {/* Toolbar */}
      <div className="shrink-0 px-4 py-3 border-b border-gray-800/50 bg-gray-900/30">
        <div className="flex items-center gap-2">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-700/30 text-blue-400 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Download parameters from flight controller"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Downloading...' : 'Refresh'}
          </button>

          {/* Write to Flash button - only show if there are modified params */}
          {modified > 0 && (
            <button
              onClick={handleWriteToFlashClick}
              disabled={isWritingFlash}
              className="px-3 py-2 bg-green-500/20 hover:bg-green-500/30 disabled:bg-gray-700/30 text-green-400 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
              title="Save parameters to flight controller's permanent storage (EEPROM)"
            >
              <svg className={`w-4 h-4 ${isWritingFlash ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
              </svg>
              {isWritingFlash ? 'Writing...' : 'Write to Flash'}
            </button>
          )}

          <div className="w-px h-6 bg-gray-700/50 mx-1" />

          {/* File operations */}
          <button
            onClick={handleSaveToFile}
            disabled={isSavingFile || paramCount === 0}
            className="px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 disabled:bg-gray-800/30 text-gray-300 disabled:text-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
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
            className="px-3 py-2 bg-gray-700/30 hover:bg-gray-700/50 disabled:bg-gray-800/30 text-gray-300 disabled:text-gray-600 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
            title="Load parameters from file"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {isLoadingFile ? 'Loading...' : 'Load'}
          </button>

          <div className="flex-1 relative">
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearch}
              placeholder="Search parameters..."
              className="w-full max-w-md px-4 py-2 pl-10 bg-gray-800/50 border border-gray-700/50 rounded-lg text-sm text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500/50"
            />
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
          </div>

          {modified > 0 && (
            <button
              onClick={toggleShowOnlyModified}
              className={`px-3 py-1 rounded-full text-xs font-medium transition-colors flex items-center gap-1.5 ${
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
            <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
              <span>Downloading parameters...</span>
              <span>{progress.received} / {progress.total} ({progress.percentage}%)</span>
            </div>
            <div className="h-1.5 bg-gray-800 rounded-full overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all duration-150"
                style={{ width: `${progress.percentage}%` }}
              />
            </div>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mt-3 px-3 py-2 bg-red-500/10 border border-red-500/20 rounded-lg text-sm text-red-400">
            {error}
          </div>
        )}
      </div>

      {/* Group tabs */}
      {paramCount > 0 && (
        <div className="shrink-0 px-4 py-2 border-b border-gray-800/50 bg-gray-900/20 overflow-x-auto">
          <div className="flex gap-1">
            {PARAMETER_GROUPS.map((group) => {
              const count = groupCounts().get(group.id) ?? 0;
              const isActive = selectedGroup === group.id;
              // Don't show groups with 0 parameters (except 'all')
              if (group.id !== 'all' && count === 0) return null;

              return (
                <button
                  key={group.id}
                  onClick={() => setSelectedGroup(group.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    isActive
                      ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      : 'text-gray-400 hover:text-gray-200 hover:bg-gray-800/50'
                  }`}
                  title={group.description}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={group.icon} />
                  </svg>
                  {group.name}
                  {count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isActive ? 'bg-blue-500/30 text-blue-300' : 'bg-gray-700/50 text-gray-500'
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
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">Loading parameters...</p>
              <p className="text-sm text-gray-600">Parameters will download automatically when connected</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800/50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-[220px]">
                  <button
                    onClick={() => toggleSort('name')}
                    className="group flex items-center hover:text-gray-300 transition-colors"
                  >
                    Name
                    <SortIndicator column="name" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
                <th className="px-4 py-3 font-medium w-[120px]">Value</th>
                <th className="px-4 py-3 font-medium w-[80px]">Type</th>
                <th className="px-4 py-3 font-medium">Description</th>
                <th className="px-4 py-3 font-medium w-[100px]">
                  <button
                    onClick={() => toggleSort('status')}
                    className="group flex items-center hover:text-gray-300 transition-colors"
                  >
                    Status
                    <SortIndicator column="status" currentColumn={sortColumn} direction={sortDirection} />
                  </button>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800/30">
              {displayParams.map((param) => (
                <tr
                  key={param.id}
                  className="hover:bg-gray-800/20 transition-colors"
                >
                  <td className="px-4 py-2.5">
                    <span className="font-mono text-sm text-gray-200">{param.id}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {param.isReadOnly ? (
                      <span className="font-mono text-sm text-gray-500 tabular-nums" title="Read-only parameter">
                        {param.value}
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
                          className={`w-full px-2 py-1 bg-gray-800 border rounded text-sm font-mono text-gray-200 focus:outline-none ${
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
                        className="font-mono text-sm text-gray-300 hover:text-blue-400 transition-colors tabular-nums"
                        title={(() => {
                          const meta = getParameterMetadata(param.id);
                          if (!meta) return undefined;
                          const hints: string[] = [];
                          if (meta.range) hints.push(`Range: ${meta.range.min} to ${meta.range.max}`);
                          if (meta.values) hints.push(`Values: ${Object.entries(meta.values).map(([k,v]) => `${k}=${v}`).join(', ')}`);
                          if (meta.units) hints.push(`Units: ${meta.units}`);
                          return hints.length > 0 ? hints.join('\n') : undefined;
                        })()}
                      >
                        {param.value}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-500">{getParamTypeName(param.type)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span
                      className={`text-sm line-clamp-2 ${
                        hasOfficialDescription(param.id)
                          ? 'text-gray-400'
                          : 'text-gray-500 italic'
                      }`}
                      title={hasOfficialDescription(param.id) ? undefined : 'Auto-generated description'}
                    >
                      {getDescription(param.id)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    {param.isReadOnly ? (
                      <span className="px-2 py-0.5 bg-gray-700/50 text-gray-500 rounded text-xs">
                        Read-only
                      </span>
                    ) : param.isModified ? (
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 bg-amber-500/20 text-amber-400 rounded text-xs">
                          Modified
                        </span>
                        <button
                          onClick={() => revertParameter(param.id)}
                          className="text-xs text-gray-500 hover:text-gray-300"
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
      <div className="shrink-0 px-4 py-2 border-t border-gray-800/50 bg-gray-900/30 text-xs text-gray-500 flex items-center gap-4">
        <span>{paramCount} parameters</span>
        {(searchQuery || selectedGroup !== 'all' || showOnlyModified) && displayParams.length !== paramCount && (
          <>
            <span className="text-gray-700">|</span>
            <span>{displayParams.length} shown</span>
          </>
        )}
        {showOnlyModified && (
          <>
            <span className="text-gray-700">|</span>
            <span className="text-amber-400">Modified only</span>
          </>
        )}
        {selectedGroup !== 'all' && (
          <>
            <span className="text-gray-700">|</span>
            <span>Group: {PARAMETER_GROUPS.find(g => g.id === selectedGroup)?.name}</span>
          </>
        )}
        <span className="text-gray-700">|</span>
        <span>System ID: {connectionState.systemId ?? '-'}</span>
        {lastRefresh > 0 && (
          <>
            <span className="text-gray-700">|</span>
            <span>Last refresh: {new Date(lastRefresh).toLocaleTimeString()}</span>
          </>
        )}
      </div>

      {/* Write to Flash Confirmation Modal */}
      {showWriteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-900 border border-gray-700 rounded-xl shadow-2xl max-w-lg w-full mx-4 max-h-[80vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-800">
              <h3 className="text-lg font-semibold text-white">Write Parameters to Flash</h3>
              <p className="text-sm text-gray-400 mt-1">
                The following {modifiedParameters().length} parameter(s) will be saved permanently to the flight controller.
              </p>
            </div>

            <div className="flex-1 overflow-auto px-6 py-4">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase">
                    <th className="pb-2">Parameter</th>
                    <th className="pb-2 text-right">Original</th>
                    <th className="pb-2 text-center px-2">→</th>
                    <th className="pb-2">New</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800/50">
                  {modifiedParameters().map(param => (
                    <tr key={param.id}>
                      <td className="py-2 font-mono text-gray-300">{param.id}</td>
                      <td className="py-2 text-right font-mono text-gray-500">{param.originalValue}</td>
                      <td className="py-2 text-center text-gray-600">→</td>
                      <td className="py-2 font-mono text-amber-400">{param.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="px-6 py-4 border-t border-gray-800 flex justify-end gap-3">
              <button
                onClick={() => setShowWriteConfirm(false)}
                className="px-4 py-2 text-sm text-gray-400 hover:text-gray-200 transition-colors"
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
}
