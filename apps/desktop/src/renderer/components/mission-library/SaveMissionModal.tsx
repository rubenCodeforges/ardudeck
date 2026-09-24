import { useEffect, useState } from 'react';
import { useMissionStore } from '../../stores/mission-store';
import { useMissionLibraryStore } from '../../stores/mission-library-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { MissionItem } from '../../../shared/mission-types';
import { calculateMissionDistance } from '../../../shared/mission-types';
import { formatDistanceFromMeters } from '../../../shared/user-units.js';
import { TagInput } from '../ui/TagInput';
import { useSurveyAreaStore } from '../../stores/survey-area-store';
import { isSurveyGroup } from '../../../shared/mission-group-types';
import { useCargoEnabled, VAULT_CARGO_SLUG } from '../../modules/capabilities';

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
  const distanceUnit = useSettingsStore((s) => s.unitPreferences.distance);

  // Use imported data if provided, otherwise fall back to mission store
  const items = importedItems ?? missionStore.missionItems;
  const homePosition = importedItems ? (importedHome ?? null) : missionStore.homePosition;
  const distance = importedItems ? calculateMissionDistance(importedItems) : missionStore.getTotalDistance();
  const isImport = !!importedItems;
  // Saving the active mission preserves its group structure. Imports go in
  // unstructured; the provider's migrateSavePayload wraps them in a default
  // Manual group on write.
  const groups = importedItems ? undefined : missionStore.groups;

  // The surveys in this plan can be kept as reusable areas at the same time:
  // pressing Save with three surveys on the map and finding none of them in the
  // library afterwards is the obvious reading of "save", and the wrong one.
  const surveyGroups = importedItems ? [] : missionStore.groups.filter(isSurveyGroup);
  const saveGroupAsArea = useSurveyAreaStore(s => s.saveGroupAsArea);
  const pushToVault = useSurveyAreaStore(s => s.pushToVault);
  const pushMissionToVault = useMissionLibraryStore(s => s.pushMissionToVault);
  const vaultEnabled = useCargoEnabled(VAULT_CARGO_SLUG);
  const setSurveyGroupSource = useMissionStore(s => s.setSurveyGroupSource);

  const allTags = useMissionLibraryStore(s => s.allTags);
  const knownSites = useSurveyAreaStore(s => s.vaultSites);
  const loadVault = useSurveyAreaStore(s => s.loadVault);

  useEffect(() => { void loadVault(); }, []);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [site, setSite] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveAreas, setSaveAreas] = useState(true);
  const [backup, setBackup] = useState(false);
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
      ...(site.trim() ? { site: site.trim() } : {}),
      tags,
      groups,
      items,
      homePosition,
    });

    const project = site.trim();
    const savedAreaIds: string[] = [];

    if (result && saveAreas) {
      for (const group of surveyGroups) {
        const doc = await saveGroupAsArea(group, {
          name: group.name,
          ...(project ? { site: project } : {}),
          ...(group.source ? { id: group.source.docId } : {}),
        });
        if (doc) {
          savedAreaIds.push(doc.id);
          setSurveyGroupSource(group.id, { docId: doc.id, revision: doc.revision, name: doc.name });
        }
      }
    }

    // One press files the whole project: the plan, its areas, and a copy of
    // each in the backup, so planning never has to detour through the vault.
    if (result && backup && project) {
      await pushMissionToVault(result.id, project);
      for (const areaId of savedAreaIds) await pushToVault(areaId, project);
    }

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
      <div className="bg-surface-solid rounded-xl border border-subtle w-full max-w-md mx-4 overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-subtle">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-blue-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-content">
              {isImport ? 'Import to Library' : 'Save project'}
            </h2>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-content mb-1">Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Survey Grid North Field"
              className="w-full px-3 py-2 bg-surface-input border border-subtle rounded-lg text-content placeholder-content-tertiary text-sm focus:outline-none focus:border-blue-500/50"
              autoFocus
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium text-content mb-1">Description</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder={isImport ? "Optional notes about this mission..." : "Optional notes about this plan..."}
              rows={3}
              className="w-full px-3 py-2 bg-surface-input border border-subtle rounded-lg text-content placeholder-content-tertiary text-sm focus:outline-none focus:border-blue-500/50 resize-none"
            />
          </div>

          {/* Project / site */}
          <div>
            <label className="block text-sm font-medium text-content mb-1">Project</label>
            <input
              type="text"
              value={site}
              onChange={e => setSite(e.target.value)}
              placeholder="Site or job this mission belongs to"
              list="ardudeck-site-suggestions"
              className="w-full px-3 py-2 bg-surface-input border border-subtle rounded-lg text-content placeholder-content-tertiary text-sm focus:outline-none focus:border-blue-500/50"
            />
            <datalist id="ardudeck-site-suggestions">
              {knownSites.map(s => <option key={s} value={s} />)}
            </datalist>
          </div>

          {surveyGroups.length > 0 && (
            <label className="flex items-start gap-2.5 rounded-lg border border-subtle bg-surface p-3 cursor-pointer">
              <input
                type="checkbox"
                checked={saveAreas}
                onChange={e => setSaveAreas(e.target.checked)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm text-content">
                  Keep {surveyGroups.length === 1 ? 'the survey area' : `all ${surveyGroups.length} survey areas`} as reusable areas
                </span>
                <span className="block text-xs text-content-secondary mt-0.5">
                  Keeps each survey's shape and settings on its own as well, so you can reuse this field in another
                  mission without opening this one.
                </span>
              </span>
            </label>
          )}

          {vaultEnabled && (
            <label className={`flex items-start gap-2.5 rounded-lg border p-3 ${
              site.trim() ? 'border-subtle bg-surface cursor-pointer' : 'border-subtle bg-surface opacity-60'
            }`}>
              <input
                type="checkbox"
                checked={backup && !!site.trim()}
                disabled={!site.trim()}
                onChange={e => setBackup(e.target.checked)}
                className="mt-0.5"
              />
              <span className="min-w-0">
                <span className="block text-sm text-content">Copy to backup as well</span>
                <span className="block text-xs text-content-secondary mt-0.5">
                  {site.trim()
                    ? `Files the plan and its areas under "${site.trim()}" in your backup, where earlier versions stay and your other computers can pick them up.`
                    : 'Give this a project name first: the backup files everything by project.'}
                </span>
              </span>
            </label>
          )}

          {/* Tags */}
          <div>
            <label className="block text-sm font-medium text-content mb-1">Tags</label>
            <TagInput
              tags={tags}
              onChange={setTags}
              placeholder="survey, north-field, high-alt"
              suggestions={allTags}
            />
          </div>

          {/* Summary */}
          <div className="flex items-center gap-4 text-xs text-content-secondary bg-surface-raised rounded-lg px-3 py-2">
            <span>{items.length} waypoints</span>
            <span>{formatDistanceFromMeters(distance, distanceUnit)}</span>
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
        <div className="px-6 py-4 border-t border-subtle flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-2.5 bg-surface-raised hover:bg-surface-raised text-content rounded-lg transition-colors"
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
