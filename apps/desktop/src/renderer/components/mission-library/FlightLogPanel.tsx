import { useState } from 'react';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import type { FlightLog, FlightStatus, AbortReason } from '../../../shared/mission-library-types';

const STATUS_OPTIONS: { value: FlightStatus; label: string; color: string }[] = [
  { value: 'completed', label: 'Completed', color: 'bg-emerald-400' },
  { value: 'aborted', label: 'Aborted', color: 'bg-red-400' },
  { value: 'in_progress', label: 'In Progress', color: 'bg-amber-400' },
  { value: 'planned', label: 'Planned', color: 'bg-gray-400' },
];

const ABORT_REASONS: { value: AbortReason; label: string }[] = [
  { value: 'battery_low', label: 'Battery Low' },
  { value: 'airspace', label: 'Airspace' },
  { value: 'weather', label: 'Weather' },
  { value: 'manual', label: 'Manual' },
  { value: 'other', label: 'Other' },
];

function formatDate(iso: string | null): string {
  if (!iso) return '--';
  return new Date(iso).toLocaleString();
}

function formatDuration(start: string | null, end: string | null): string {
  if (!start || !end) return '--';
  const diffMs = new Date(end).getTime() - new Date(start).getTime();
  const mins = Math.floor(diffMs / 60000);
  const secs = Math.floor((diffMs % 60000) / 1000);
  if (mins < 1) return `${secs}s`;
  return `${mins}m ${secs}s`;
}

interface FlightLogPanelProps {
  missionId: string;
}

export function FlightLogPanel({ missionId }: FlightLogPanelProps) {
  const { flightLogs, addFlightLog, updateFlightLog, deleteFlightLog } = useMissionLibraryStore();
  const [showNewForm, setShowNewForm] = useState(false);
  const [newStatus, setNewStatus] = useState<FlightStatus>('completed');
  const [newAbortReason, setNewAbortReason] = useState<AbortReason | null>(null);
  const [newNotes, setNewNotes] = useState('');
  const [newLastWp, setNewLastWp] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editData, setEditData] = useState<Partial<FlightLog>>({});
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const handleCreateFlight = async () => {
    await addFlightLog(missionId, newStatus, {
      abortReason: newStatus === 'aborted' ? newAbortReason : null,
      notes: newNotes.trim(),
      lastWaypointReached: newLastWp ? parseInt(newLastWp) : null,
    });
    // Reset form
    setShowNewForm(false);
    setNewStatus('completed');
    setNewAbortReason(null);
    setNewNotes('');
    setNewLastWp('');
  };

  const handleStartEdit = (log: FlightLog) => {
    setEditingId(log.id);
    setEditData({ status: log.status, abortReason: log.abortReason, notes: log.notes, lastWaypointReached: log.lastWaypointReached });
  };

  const handleSaveEdit = async (log: FlightLog) => {
    const updated: FlightLog = {
      ...log,
      status: (editData.status ?? log.status) as FlightStatus,
      abortReason: editData.status === 'aborted' ? (editData.abortReason ?? log.abortReason) : null,
      notes: editData.notes ?? log.notes,
      lastWaypointReached: editData.lastWaypointReached ?? log.lastWaypointReached,
      startedAt: (editData.status === 'in_progress' || editData.status === 'completed' || editData.status === 'aborted')
        ? (log.startedAt ?? new Date().toISOString())
        : log.startedAt,
      endedAt: (editData.status === 'completed' || editData.status === 'aborted')
        ? (log.endedAt ?? new Date().toISOString())
        : log.endedAt,
    };
    await updateFlightLog(updated);
    setEditingId(null);
    setEditData({});
  };

  const handleDelete = async (logId: string) => {
    await deleteFlightLog(missionId, logId);
    setConfirmDeleteId(null);
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-medium text-gray-300">Flight History</h4>
        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="px-2.5 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-md transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            Log Flight
          </button>
        )}
      </div>

      {/* New flight form */}
      {showNewForm && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3 space-y-2.5">
          <div className="text-xs font-medium text-blue-300 mb-1">Record Flight</div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-14">Status</label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as FlightStatus)}
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          {/* Abort reason */}
          {newStatus === 'aborted' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 w-14">Reason</label>
              <select
                value={newAbortReason ?? ''}
                onChange={e => setNewAbortReason((e.target.value || null) as AbortReason | null)}
                className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
              >
                <option value="">Select reason...</option>
                {ABORT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Last WP */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-gray-500 w-14">Last WP</label>
            <input
              type="number"
              value={newLastWp}
              onChange={e => setNewLastWp(e.target.value)}
              placeholder="Optional"
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Notes */}
          <div className="flex items-start gap-2">
            <label className="text-xs text-gray-500 w-14 pt-1">Notes</label>
            <textarea
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              rows={2}
              placeholder="Optional flight notes..."
              className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowNewForm(false); setNewStatus('completed'); setNewAbortReason(null); setNewNotes(''); setNewLastWp(''); }}
              className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateFlight}
              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              Save Flight
            </button>
          </div>
        </div>
      )}

      {flightLogs.length === 0 && !showNewForm ? (
        <p className="text-xs text-gray-500 py-4 text-center">No flights recorded yet</p>
      ) : (
        <div className="space-y-2">
          {flightLogs.map(log => {
            const isEditing = editingId === log.id;
            const statusObj = STATUS_OPTIONS.find(s => s.value === (isEditing ? editData.status : log.status));

            return (
              <div
                key={log.id}
                className="bg-gray-900/30 rounded-lg border border-gray-700/30 p-3"
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    {/* Status select */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-14">Status</label>
                      <select
                        value={editData.status ?? log.status}
                        onChange={e => setEditData({ ...editData, status: e.target.value as FlightStatus })}
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    </div>

                    {/* Abort reason (only for aborted) */}
                    {editData.status === 'aborted' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-gray-500 w-14">Reason</label>
                        <select
                          value={editData.abortReason ?? ''}
                          onChange={e => setEditData({ ...editData, abortReason: (e.target.value || null) as AbortReason | null })}
                          className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
                        >
                          <option value="">Select reason...</option>
                          {ABORT_REASONS.map(r => (
                            <option key={r.value} value={r.value}>{r.label}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Last WP */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-gray-500 w-14">Last WP</label>
                      <input
                        type="number"
                        value={editData.lastWaypointReached ?? ''}
                        onChange={e => setEditData({ ...editData, lastWaypointReached: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="--"
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50"
                      />
                    </div>

                    {/* Notes */}
                    <div className="flex items-start gap-2">
                      <label className="text-xs text-gray-500 w-14 pt-1">Notes</label>
                      <textarea
                        value={editData.notes ?? log.notes}
                        onChange={e => setEditData({ ...editData, notes: e.target.value })}
                        rows={2}
                        className="flex-1 px-2 py-1 bg-gray-800 border border-gray-700 rounded text-xs text-white focus:outline-none focus:border-blue-500/50 resize-none"
                      />
                    </div>

                    {/* Edit actions */}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => { setEditingId(null); setEditData({}); }}
                        className="px-2 py-1 text-xs bg-gray-700 hover:bg-gray-600 text-gray-300 rounded transition-colors"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => handleSaveEdit(log)}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                      >
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusObj?.color ?? 'bg-gray-400'}`} />
                        <span className="text-xs font-medium text-gray-200">{statusObj?.label ?? 'Unknown'}</span>
                        {log.abortReason && (
                          <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                            {ABORT_REASONS.find(r => r.value === log.abortReason)?.label ?? log.abortReason}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartEdit(log)}
                          className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-gray-300 transition-colors"
                          title="Edit"
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {confirmDeleteId === log.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(log.id)}
                              className="px-1.5 py-0.5 text-[10px] bg-red-600 text-white rounded transition-colors"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 text-[10px] bg-gray-700 text-gray-300 rounded transition-colors"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(log.id)}
                            className="p-1 rounded hover:bg-gray-700 text-gray-500 hover:text-red-400 transition-colors"
                            title="Delete"
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-gray-500">
                      <span>{formatDate(log.createdAt)}</span>
                      {log.startedAt && log.endedAt && (
                        <span>Duration: {formatDuration(log.startedAt, log.endedAt)}</span>
                      )}
                      {log.lastWaypointReached !== null && (
                        <span>Last WP: #{log.lastWaypointReached}</span>
                      )}
                    </div>

                    {log.notes && (
                      <p className="text-[11px] text-gray-400 mt-1.5">{log.notes}</p>
                    )}

                    {log.cameraEvents.length > 0 && (
                      <div className="text-[10px] text-gray-500 mt-1">
                        {log.cameraEvents.length} camera events
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
