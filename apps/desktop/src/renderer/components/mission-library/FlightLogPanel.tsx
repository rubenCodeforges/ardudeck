import { useTranslation } from 'react-i18next';
import { useState } from 'react';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import type { FlightLog, FlightStatus, AbortReason } from '../../../shared/mission-library-types';

const STATUS_OPTIONS: { value: FlightStatus; labelKey: string; color: string }[] = [
  { value: 'completed', labelKey: 'mission-library:flightStatus.completed', color: 'bg-emerald-400' },
  { value: 'aborted', labelKey: 'mission-library:flightStatus.aborted', color: 'bg-red-400' },
  { value: 'in_progress', labelKey: 'mission-library:flightStatus.inProgress', color: 'bg-amber-400' },
  { value: 'planned', labelKey: 'mission-library:flightStatus.planned', color: 'bg-gray-400' },
];

const ABORT_REASONS: { value: AbortReason; labelKey: string }[] = [
  { value: 'battery_low', labelKey: 'mission-library:abortReason.batteryLow' },
  { value: 'airspace', labelKey: 'mission-library:abortReason.airspace' },
  { value: 'weather', labelKey: 'common:weather' },
  { value: 'manual', labelKey: 'mission-library:abortReason.manual' },
  { value: 'other', labelKey: 'mission-library:abortReason.other' },
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
  const { t } = useTranslation();
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
        <h4 className="text-sm font-medium text-content">{t('mission-library:flightLogPanel.flightHistory')}</h4>
        {!showNewForm && (
          <button
            onClick={() => setShowNewForm(true)}
            className="px-2.5 py-1 text-xs bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 rounded-md transition-colors flex items-center gap-1"
          >
            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('mission-library:flightLogPanel.logFlight')}
          </button>
        )}
      </div>

      {/* New flight form */}
      {showNewForm && (
        <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-3 mb-3 space-y-2.5">
          <div className="text-xs font-medium text-blue-300 mb-1">{t('mission-library:flightLogPanel.recordFlight')}</div>

          {/* Status */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-content-secondary w-14">{t('common:status')}</label>
            <select
              value={newStatus}
              onChange={e => setNewStatus(e.target.value as FlightStatus)}
              className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
            >
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
              ))}
            </select>
          </div>

          {/* Abort reason */}
          {newStatus === 'aborted' && (
            <div className="flex items-center gap-2">
              <label className="text-xs text-content-secondary w-14">{t('mission-library:flightLogPanel.reason')}</label>
              <select
                value={newAbortReason ?? ''}
                onChange={e => setNewAbortReason((e.target.value || null) as AbortReason | null)}
                className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
              >
                <option value="">{t('mission-library:flightLogPanel.selectReason')}</option>
                {ABORT_REASONS.map(r => (
                  <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                ))}
              </select>
            </div>
          )}

          {/* Last WP */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-content-secondary w-14">{t('mission-library:flightLogPanel.lastWp')}</label>
            <input
              type="number"
              value={newLastWp}
              onChange={e => setNewLastWp(e.target.value)}
              placeholder={t('mission-library:flightLogPanel.optional')}
              className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
            />
          </div>

          {/* Notes */}
          <div className="flex items-start gap-2">
            <label className="text-xs text-content-secondary w-14 pt-1">{t('mission-library:flightLogPanel.notes')}</label>
            <textarea
              value={newNotes}
              onChange={e => setNewNotes(e.target.value)}
              rows={2}
              placeholder={t('mission-library:flightLogPanel.notesPlaceholder')}
              className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content placeholder-content-tertiary focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={() => { setShowNewForm(false); setNewStatus('completed'); setNewAbortReason(null); setNewNotes(''); setNewLastWp(''); }}
              className="px-2 py-1 text-xs bg-surface-raised hover:bg-surface-raised text-content rounded transition-colors"
            >
              {t('common:cancel')}
            </button>
            <button
              onClick={handleCreateFlight}
              className="px-2.5 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
            >
              {t('mission-library:flightLogPanel.saveFlight')}
            </button>
          </div>
        </div>
      )}

      {flightLogs.length === 0 && !showNewForm ? (
        <p className="text-xs text-content-secondary py-4 text-center">{t('mission-library:flightLogPanel.noFlights')}</p>
      ) : (
        <div className="space-y-2">
          {flightLogs.map(log => {
            const isEditing = editingId === log.id;
            const statusObj = STATUS_OPTIONS.find(s => s.value === (isEditing ? editData.status : log.status));

            return (
              <div
                key={log.id}
                className="bg-surface-raised rounded-lg border border-subtle p-3"
              >
                {isEditing ? (
                  /* Edit mode */
                  <div className="space-y-2">
                    {/* Status select */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-content-secondary w-14">{t('common:status')}</label>
                      <select
                        value={editData.status ?? log.status}
                        onChange={e => setEditData({ ...editData, status: e.target.value as FlightStatus })}
                        className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
                      >
                        {STATUS_OPTIONS.map(opt => (
                          <option key={opt.value} value={opt.value}>{t(opt.labelKey)}</option>
                        ))}
                      </select>
                    </div>

                    {/* Abort reason (only for aborted) */}
                    {editData.status === 'aborted' && (
                      <div className="flex items-center gap-2">
                        <label className="text-xs text-content-secondary w-14">{t('mission-library:flightLogPanel.reason')}</label>
                        <select
                          value={editData.abortReason ?? ''}
                          onChange={e => setEditData({ ...editData, abortReason: (e.target.value || null) as AbortReason | null })}
                          className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
                        >
                          <option value="">{t('mission-library:flightLogPanel.selectReason')}</option>
                          {ABORT_REASONS.map(r => (
                            <option key={r.value} value={r.value}>{t(r.labelKey)}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Last WP */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs text-content-secondary w-14">{t('mission-library:flightLogPanel.lastWp')}</label>
                      <input
                        type="number"
                        value={editData.lastWaypointReached ?? ''}
                        onChange={e => setEditData({ ...editData, lastWaypointReached: e.target.value ? parseInt(e.target.value) : null })}
                        placeholder="--"
                        className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50"
                      />
                    </div>

                    {/* Notes */}
                    <div className="flex items-start gap-2">
                      <label className="text-xs text-content-secondary w-14 pt-1">{t('mission-library:flightLogPanel.notes')}</label>
                      <textarea
                        value={editData.notes ?? log.notes}
                        onChange={e => setEditData({ ...editData, notes: e.target.value })}
                        rows={2}
                        className="flex-1 px-2 py-1 bg-surface-input border border-subtle rounded text-xs text-content focus:outline-none focus:border-blue-500/50 resize-none"
                      />
                    </div>

                    {/* Edit actions */}
                    <div className="flex justify-end gap-2 pt-1">
                      <button
                        onClick={() => { setEditingId(null); setEditData({}); }}
                        className="px-2 py-1 text-xs bg-surface-raised hover:bg-surface-raised text-content rounded transition-colors"
                      >
                        {t('common:cancel')}
                      </button>
                      <button
                        onClick={() => handleSaveEdit(log)}
                        className="px-2 py-1 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded transition-colors"
                      >
                        {t('common:save')}
                      </button>
                    </div>
                  </div>
                ) : (
                  /* Display mode */
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2 h-2 rounded-full ${statusObj?.color ?? 'bg-gray-400'}`} />
                        <span className="text-xs font-medium text-content">{statusObj ? t(statusObj.labelKey) : t('common:unknown')}</span>
                        {log.abortReason && (
                          <span className="text-[10px] text-red-400 bg-red-500/10 px-1.5 py-0.5 rounded">
                            {(() => { const r = ABORT_REASONS.find(r => r.value === log.abortReason); return r ? t(r.labelKey) : log.abortReason; })()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartEdit(log)}
                          className="p-1 rounded hover:bg-surface-raised text-content-secondary hover:text-content transition-colors"
                          title={t('common:edit')}
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
                              {t('common:confirm')}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 text-[10px] bg-surface-raised text-content rounded transition-colors"
                            >
                              {t('mission-library:flightLogPanel.no')}
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDeleteId(log.id)}
                            className="p-1 rounded hover:bg-surface-raised text-content-secondary hover:text-red-400 transition-colors"
                            title={t('mission-library:flightLogPanel.delete')}
                          >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-content-secondary">
                      <span>{formatDate(log.createdAt)}</span>
                      {log.startedAt && log.endedAt && (
                        <span>{t('mission-library:flightLogPanel.durationValue', { value: formatDuration(log.startedAt, log.endedAt) })}</span>
                      )}
                      {log.lastWaypointReached !== null && (
                        <span>{t('mission-library:flightLogPanel.lastWpValue', { n: log.lastWaypointReached })}</span>
                      )}
                    </div>

                    {log.notes && (
                      <p className="text-[11px] text-content-secondary mt-1.5">{log.notes}</p>
                    )}

                    {log.cameraEvents.length > 0 && (
                      <div className="text-[10px] text-content-secondary mt-1">
                        {t('mission-library:flightLogPanel.cameraEvents', { count: log.cameraEvents.length })}
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
