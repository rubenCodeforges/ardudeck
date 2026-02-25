import { useState } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { MissionItem } from '../../../shared/mission-types';
import { calculateMissionDistance } from '../../../shared/mission-types';
import { TagInput } from '../ui/TagInput';

interface SaveMissionModalProps {
  onClose: () => void;
  onSaved?: () => void;
  /** When provided, saves these items instead of the mission store items */
  importedItems?: MissionItem[];
  /** Home position extracted from imported file */
  importedHome?: { lat: number; lon: number; alt: number } | null;
}

export function SaveMissionModal({ onClose, onSaved, importedItems, importedHome }: SaveMissionModalProps) {
  const missionStore = useMissionStore();
  const { saveMission, error: storeError } = useMissionLibraryStore();
  const { activeVehicleId } = useSettingsStore();

  // Use imported data if provided, otherwise fall back to mission store
  const items = importedItems ?? missionStore.missionItems;
  const homePosition = importedItems ? (importedHome ?? null) : missionStore.homePosition;
  const distance = importedItems ? calculateMissionDistance(importedItems) : missionStore.getTotalDistance();
  const isImport = !!importedItems;

  const allTags = useMissionLibraryStore(s => s.allTags);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Mission name is required');
      return;
    }

    setSaving(true);
    setError(null);

    const result = await saveMission({
      name: name.trim(),
      description: description.trim(),
      vehicleProfileId: activeVehicleId,
      tags,
      items,
      homePosition,
    });

    setSaving(false);

    if (result) {
      onSaved?.();
      onClose();
    } else {
      setError(storeError || 'Failed to save mission. Check the console for details.');
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-xl border border-gray-700/50 w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-700">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-white">
              {isImport ? 'Import to Library' : 'Save to Library'}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Survey Grid North Field"
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Optional notes about this mission..."
              rows={3}
              className="w-full px-3 py-2 bg-gray-900/50 border border-gray-700 rounded-lg text-white placeholder-gray-500 text-sm focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">Tags</label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="survey, north-field, high-alt"
              suggestions={allTags}
            />
          </div>

          {/* Summary */}
          <div className="flex items-center gap-4 text-xs text-gray-400 bg-gray-900/30 rounded-lg px-3 py-2">
            <span>{items.length} waypoints</span>
            <span>{distance < 1000
              ? `${Math.round(distance)}m`
              : `${(distance / 1000).toFixed(1)} km`
            }</span>
            {homePosition && <span>Home set</span>}
          </div>

          {/* Error */}
          {error && (
            <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="px-6 py-4 border-t border-gray-700 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-gray-700 hover:bg-gray-600 text-gray-300 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim()}
            className={`flex-1 px-4 py-2.5 rounded-lg font-medium transition-colors ${
              saving || !name.trim()
                ? 'bg-blue-600/30 text-blue-400/50 cursor-not-allowed'
                : 'bg-blue-600 hover:bg-blue-500 text-white'
            }`}
          >
            {saving ? 'Saving...' : isImport ? 'Import' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}
