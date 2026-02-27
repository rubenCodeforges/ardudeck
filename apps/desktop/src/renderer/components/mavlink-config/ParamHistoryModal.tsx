/**
 * ParamHistoryModal
 *
 * Shows parameter checkpoint history for the connected board.
 * Allows restoring or deleting checkpoints.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { History, ChevronDown, ChevronRight, RotateCcw, Trash2, X, Loader2 } from 'lucide-react';
import type { ParamCheckpoint, ParamChange } from '../../../shared/param-history-types';
import { useParameterStore } from '../../stores/parameter-store';

interface Props {
  boardUid: string;
  boardName: string;
  onClose: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return 'Just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toLocaleString();
}

const ParamHistoryModal: React.FC<Props> = ({ boardUid, boardName, onClose, showToast }) => {
  const [checkpoints, setCheckpoints] = useState<ParamCheckpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const { setParameter } = useParameterStore();

  const loadHistory = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.electronAPI?.getParamHistory(boardUid);
      setCheckpoints(result ?? []);
    } catch {
      setCheckpoints([]);
    } finally {
      setLoading(false);
    }
  }, [boardUid]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  const handleRestore = useCallback(async (checkpointId: string) => {
    setRestoring(checkpointId);
    try {
      const result = await window.electronAPI?.restoreParamCheckpoint(boardUid, checkpointId);
      if (result?.success && result.changes) {
        let applied = 0;
        let failed = 0;
        for (const change of result.changes) {
          try {
            const success = await setParameter(change.paramId, change.oldValue);
            if (success) applied++;
            else failed++;
          } catch {
            failed++;
          }
        }
        if (applied > 0) {
          showToast(
            `Restored ${applied} parameter${applied !== 1 ? 's' : ''} to previous values${failed > 0 ? ` (${failed} failed)` : ''}. Write to Flash to persist.`,
            failed > 0 ? 'info' : 'success'
          );
        } else {
          showToast('Failed to restore parameters', 'error');
        }
      } else {
        showToast('Checkpoint not found', 'error');
      }
    } catch {
      showToast('Failed to restore checkpoint', 'error');
    } finally {
      setRestoring(null);
    }
  }, [boardUid, setParameter, showToast]);

  const handleDelete = useCallback(async (checkpointId: string) => {
    try {
      const result = await window.electronAPI?.deleteParamCheckpoint(boardUid, checkpointId);
      if (result?.success) {
        setCheckpoints(prev => prev.filter(c => c.id !== checkpointId));
        setConfirmDeleteId(null);
      }
    } catch {
      showToast('Failed to delete checkpoint', 'error');
    }
  }, [boardUid, showToast]);

  const toggleExpand = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id);
  }, []);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-blue-500/20 flex items-center justify-center">
              <History className="w-5 h-5 text-blue-400" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Parameter History</h3>
              <p className="text-xs text-zinc-500">{boardName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-zinc-500 hover:text-zinc-300 transition-colors rounded-lg hover:bg-zinc-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-zinc-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              Loading history...
            </div>
          ) : checkpoints.length === 0 ? (
            <div className="text-center py-12">
              <History className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
              <p className="text-zinc-500 text-sm">No history yet</p>
              <p className="text-zinc-600 text-xs mt-1">
                Changes are recorded each time you write to flash.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {checkpoints.map((cp) => (
                <div
                  key={cp.id}
                  className="border border-zinc-800 rounded-lg overflow-hidden"
                >
                  {/* Checkpoint header */}
                  <button
                    onClick={() => toggleExpand(cp.id)}
                    className="w-full px-4 py-3 flex items-center gap-3 hover:bg-zinc-800/50 transition-colors text-left"
                  >
                    {expandedId === cp.id ? (
                      <ChevronDown className="w-4 h-4 text-zinc-500 shrink-0" />
                    ) : (
                      <ChevronRight className="w-4 h-4 text-zinc-500 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-zinc-300 truncate">
                          {cp.changes.length <= 3
                            ? <span className="font-mono">{cp.changes.map(c => c.paramId).join(', ')}</span>
                            : `${cp.changes.length} parameters changed`}
                        </span>
                        {cp.label && (
                          <span className="text-xs text-zinc-500 truncate">{cp.label}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-zinc-600" title={formatTimestamp(cp.timestamp)}>
                          {formatRelativeTime(cp.timestamp)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                      <button
                        onClick={() => handleRestore(cp.id)}
                        disabled={restoring !== null}
                        className="px-2.5 py-1.5 text-xs font-medium rounded-md bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        title="Restore these parameters (sets values in RAM, then Write to Flash to persist)"
                      >
                        {restoring === cp.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="w-3.5 h-3.5" />
                        )}
                        Restore
                      </button>
                      {confirmDeleteId === cp.id ? (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleDelete(cp.id)}
                            className="px-2 py-1.5 text-xs font-medium rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors"
                          >
                            Confirm
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="px-2 py-1.5 text-xs font-medium rounded-md text-zinc-500 hover:text-zinc-300 transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(cp.id)}
                          className="p-1.5 text-zinc-600 hover:text-red-400 transition-colors rounded-md hover:bg-zinc-800"
                          title="Delete checkpoint"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </button>

                  {/* Expanded changes table */}
                  {expandedId === cp.id && (
                    <div className="px-4 pb-3 border-t border-zinc-800/50">
                      <table className="w-full text-xs mt-2">
                        <thead>
                          <tr className="text-zinc-600 uppercase">
                            <th className="pb-1.5 text-left font-medium">Parameter</th>
                            <th className="pb-1.5 text-right font-medium">Old Value</th>
                            <th className="pb-1.5 text-center font-medium px-2"></th>
                            <th className="pb-1.5 text-left font-medium">New Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-zinc-800/30">
                          {cp.changes.map((change, idx) => (
                            <tr key={idx}>
                              <td className="py-1.5 font-mono text-zinc-400">{change.paramId}</td>
                              <td className="py-1.5 text-right font-mono text-blue-400/70">{change.oldValue}</td>
                              <td className="py-1.5 text-center text-zinc-700">→</td>
                              <td className="py-1.5 font-mono text-amber-400/70">{change.newValue}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-zinc-800 flex justify-between items-center">
          <span className="text-xs text-zinc-600">
            {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

export default ParamHistoryModal;
