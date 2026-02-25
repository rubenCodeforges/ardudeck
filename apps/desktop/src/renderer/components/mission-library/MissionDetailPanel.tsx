import { useState, useEffect } from 'react';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useSettingsStore } from '../../stores/settings-store';
import { FlightLogPanel } from './FlightLogPanel';
import { TagInput } from '../ui/TagInput';
import type { FlightStatus } from '../../../shared/mission-library-types';

const STATUS_COLORS: Record<FlightStatus, string> = {
  planned: 'text-blue-400',
  in_progress: 'text-amber-400',
  completed: 'text-emerald-400',
  aborted: 'text-red-400',
};

const STATUS_LABELS: Record<FlightStatus, string> = {
  planned: 'Planned',
  in_progress: 'In Progress',
  completed: 'Completed',
  aborted: 'Aborted',
};

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

interface MissionDetailPanelProps {
  onLoadToEditor: () => void;
}

export function MissionDetailPanel({ onLoadToEditor }: MissionDetailPanelProps) {
  const { selectedMission, clearSelection, deleteMission, duplicateMission, saveMission, selectMission, allTags } = useMissionLibraryStore();
  const { vehicles } = useSettingsStore();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  // Reset edit state when selection changes
  useEffect(() => {
    setIsEditing(false);
  }, [selectedMission?.id]);

  if (!selectedMission) return null;

  const vehicle = vehicles.find(v => v.id === selectedMission.vehicleProfileId);

  const handleStartEdit = () => {
    setEditName(selectedMission.name);
    setEditDescription(selectedMission.description);
    setEditTags([...selectedMission.tags]);
    setIsEditing(true);
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim()) return;

    setSaving(true);

    const result = await saveMission({
      name: editName.trim(),
      description: editDescription.trim(),
      vehicleProfileId: selectedMission.vehicleProfileId,
      tags: editTags,
      items: selectedMission.items,
      homePosition: selectedMission.homePosition,
      existingId: selectedMission.id,
    });

    setSaving(false);

    if (result) {
      setIsEditing(false);
      // Re-select to refresh the detail panel with updated data
      await selectMission(selectedMission.id);
    }
  };

  const handleDuplicate = async () => {
    await duplicateMission(selectedMission.id, `${selectedMission.name} (copy)`);
  };

  const handleDelete = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
      return;
    }
    await deleteMission(selectedMission.id);
    setConfirmDelete(false);
  };

  return (
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 border-b border-gray-700/30 flex items-center justify-between">
        <div className="flex items-center gap-3 min-w-0">
          {isEditing ? (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              className="text-base font-semibold text-white bg-gray-900/50 border border-gray-600 rounded-lg px-2.5 py-1 focus:outline-none focus:border-blue-500/50 min-w-0"
              autoFocus
            />
          ) : (
            <h3 className="text-base font-semibold text-white truncate">{selectedMission.name}</h3>
          )}
          {selectedMission.lastFlightStatus && !isEditing && (
            <span className={`text-xs font-medium ${STATUS_COLORS[selectedMission.lastFlightStatus]}`}>
              {STATUS_LABELS[selectedMission.lastFlightStatus]}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {!isEditing && (
            <button
              onClick={handleStartEdit}
              className="p-1.5 rounded-md hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
              title="Edit"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
          )}
          <button
            onClick={clearSelection}
            className="p-1.5 rounded-md hover:bg-gray-700/50 text-gray-500 hover:text-gray-300 transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      <div className="flex divide-x divide-gray-700/30">
        {/* Left: Mission details */}
        <div className="flex-1 p-5 space-y-4">
          {/* Description */}
          {isEditing ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Description</label>
              <textarea
                value={editDescription}
                onChange={e => setEditDescription(e.target.value)}
                rows={3}
                placeholder="Optional mission description..."
                className="w-full px-2.5 py-1.5 bg-gray-900/50 border border-gray-600 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-blue-500/50 resize-none"
              />
            </div>
          ) : selectedMission.description ? (
            <p className="text-sm text-gray-400">{selectedMission.description}</p>
          ) : null}

          {/* Metadata grid */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="bg-gray-900/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 block">Waypoints</span>
              <span className="text-white font-medium">{selectedMission.waypointCount}</span>
            </div>
            <div className="bg-gray-900/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 block">Distance</span>
              <span className="text-white font-medium">{formatDistance(selectedMission.totalDistanceMeters)}</span>
            </div>
            <div className="bg-gray-900/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 block">Vehicle</span>
              <span className="text-white font-medium">{vehicle?.name ?? 'None'}</span>
            </div>
            <div className="bg-gray-900/30 rounded-lg px-3 py-2">
              <span className="text-gray-500 block">Flights</span>
              <span className="text-white font-medium">{selectedMission.flightCount}</span>
            </div>
          </div>

          {/* Tags */}
          {isEditing ? (
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tags</label>
              <TagInput
                tags={editTags}
                onChange={setEditTags}
                placeholder="survey, field-1, high-alt"
                suggestions={allTags}
              />
            </div>
          ) : selectedMission.tags.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {selectedMission.tags.map(tag => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-700/50 text-gray-400 rounded"
                >
                  {tag}
                </span>
              ))}
            </div>
          ) : null}

          {/* Dates */}
          {!isEditing && (
            <div className="text-[11px] text-gray-500 space-y-0.5">
              <div>Created: {new Date(selectedMission.createdAt).toLocaleDateString()}</div>
              <div>Updated: {new Date(selectedMission.updatedAt).toLocaleDateString()}</div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            {isEditing ? (
              <>
                <button
                  onClick={handleSaveEdit}
                  disabled={saving || !editName.trim()}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
                    saving || !editName.trim()
                      ? 'bg-blue-600/30 text-blue-400/50 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-500 text-white'
                  }`}
                >
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
                <button
                  onClick={handleCancelEdit}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={onLoadToEditor}
                  className="px-3 py-1.5 text-xs font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Load into Editor
                </button>
                <button
                  onClick={handleStartEdit}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  Edit
                </button>
                <button
                  onClick={handleDuplicate}
                  className="px-3 py-1.5 text-xs font-medium bg-gray-700/50 hover:bg-gray-600/50 text-gray-300 rounded-lg transition-colors"
                >
                  Duplicate
                </button>
                <button
                  onClick={handleDelete}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                    confirmDelete
                      ? 'bg-red-600 text-white'
                      : 'bg-red-600/20 hover:bg-red-600/30 text-red-400'
                  }`}
                >
                  {confirmDelete ? 'Confirm Delete' : 'Delete'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Right: Flight logs */}
        <div className="w-80 p-5 shrink-0">
          <FlightLogPanel missionId={selectedMission.id} />
        </div>
      </div>
    </div>
  );
}
