/**
 * Parameters View - Full parameter management
 * Displays parameter table with search, refresh, and editing
 */

import { useState, useCallback } from 'react';
import { useConnectionStore } from '../../stores/connection-store';
import { useParameterStore } from '../../stores/parameter-store';
import { getParamTypeName } from '../../../shared/parameter-types';

export function ParametersView() {
  const { connectionState } = useConnectionStore();
  const {
    parameters,
    isLoading,
    progress,
    error,
    lastRefresh,
    searchQuery,
    filteredParameters,
    fetchParameters,
    setParameter,
    setSearchQuery,
    revertParameter,
    modifiedCount,
  } = useParameterStore();

  const [editingParam, setEditingParam] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>('');

  const handleRefresh = useCallback(() => {
    fetchParameters();
  }, [fetchParameters]);

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchQuery(e.target.value);
  }, [setSearchQuery]);

  const startEdit = useCallback((paramId: string, currentValue: number) => {
    setEditingParam(paramId);
    setEditValue(String(currentValue));
  }, []);

  const cancelEdit = useCallback(() => {
    setEditingParam(null);
    setEditValue('');
  }, []);

  const saveEdit = useCallback(async (paramId: string) => {
    const newValue = parseFloat(editValue);
    if (isNaN(newValue)) {
      cancelEdit();
      return;
    }
    await setParameter(paramId, newValue);
    cancelEdit();
  }, [editValue, setParameter, cancelEdit]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, paramId: string) => {
    if (e.key === 'Enter') {
      saveEdit(paramId);
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  }, [saveEdit, cancelEdit]);

  if (!connectionState.isConnected) {
    return (
      <div className="h-full flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500/20 to-blue-500/20 border border-gray-700/50 flex items-center justify-center mb-6">
            <svg className="w-8 h-8 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </div>

          <h2 className="text-2xl font-semibold text-white mb-3">
            Parameter Management
          </h2>
          <p className="text-gray-400 mb-6 leading-relaxed">
            Connect to your flight controller to view and edit parameters.
            Parameters control every aspect of your vehicle's behavior.
          </p>

          <div className="p-4 rounded-xl bg-gray-800/30 border border-gray-700/30 text-left">
            <h3 className="text-sm font-medium text-gray-200 mb-2">What you can do:</h3>
            <ul className="text-xs text-gray-500 space-y-1">
              <li>• View all 800+ vehicle parameters</li>
              <li>• Search and filter by name</li>
              <li>• Edit values with type validation</li>
              <li>• Upload changes to flight controller</li>
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
        <div className="flex items-center gap-4">
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="px-4 py-2 bg-blue-500/20 hover:bg-blue-500/30 disabled:bg-gray-700/30 text-blue-400 disabled:text-gray-500 rounded-lg text-sm font-medium transition-colors flex items-center gap-2"
          >
            <svg className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {isLoading ? 'Downloading...' : 'Refresh'}
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
            <div className="px-3 py-1 bg-amber-500/20 text-amber-400 rounded-full text-xs font-medium">
              {modified} modified
            </div>
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

      {/* Parameter table */}
      <div className="flex-1 overflow-auto">
        {paramCount === 0 && !isLoading ? (
          <div className="h-full flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              <p className="text-lg mb-2">Click "Refresh" to download parameters</p>
              <p className="text-sm text-gray-600">Parameters will appear here once downloaded from the flight controller</p>
            </div>
          </div>
        ) : (
          <table className="w-full">
            <thead className="sticky top-0 bg-gray-900/95 backdrop-blur border-b border-gray-800/50">
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-4 py-3 font-medium w-[280px]">Name</th>
                <th className="px-4 py-3 font-medium w-[180px]">Value</th>
                <th className="px-4 py-3 font-medium w-[100px]">Type</th>
                <th className="px-4 py-3 font-medium">Status</th>
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
                    {editingParam === param.id ? (
                      <input
                        type="text"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, param.id)}
                        onBlur={() => saveEdit(param.id)}
                        autoFocus
                        className="w-full px-2 py-1 bg-gray-800 border border-blue-500/50 rounded text-sm font-mono text-gray-200 focus:outline-none"
                      />
                    ) : (
                      <button
                        onClick={() => startEdit(param.id, param.value)}
                        className="font-mono text-sm text-gray-300 hover:text-blue-400 transition-colors tabular-nums"
                      >
                        {param.value}
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="text-xs text-gray-500">{getParamTypeName(param.type)}</span>
                  </td>
                  <td className="px-4 py-2.5">
                    {param.isModified && (
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
                    )}
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
        {searchQuery && displayParams.length !== paramCount && (
          <>
            <span className="text-gray-700">|</span>
            <span>{displayParams.length} shown</span>
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
    </div>
  );
}
