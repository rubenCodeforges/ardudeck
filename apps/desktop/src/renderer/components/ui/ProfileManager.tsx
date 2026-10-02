/**
 * ProfileManager Component
 *
 * Reusable custom profile save/load functionality.
 * Stores profiles in localStorage with type safety.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Check } from 'lucide-react';
import { useTranslation } from 'react-i18next';

// Storage utilities
export function loadProfiles<T>(storageKey: string): Record<string, { name: string; data: T }> {
  try {
    const stored = localStorage.getItem(storageKey);
    return stored ? JSON.parse(stored) : {};
  } catch {
    return {};
  }
}

export function saveProfiles<T>(
  storageKey: string,
  profiles: Record<string, { name: string; data: T }>
): void {
  localStorage.setItem(storageKey, JSON.stringify(profiles));
}

export interface ProfileManagerProps<T> {
  /** localStorage key for storing profiles */
  storageKey: string;
  /** Current data to save as a profile */
  currentData: T;
  /** Callback when a profile is loaded */
  onLoad: (data: T) => void;
  /** Callback when reset to defaults is clicked */
  onReset: () => void;
  /** Label shown before profile list */
  label?: string;
  /** Show reset button */
  showReset?: boolean;
}

export function ProfileManager<T>({
  storageKey,
  currentData,
  onLoad,
  onReset,
  label,
  showReset = true,
}: ProfileManagerProps<T>) {
  const { t } = useTranslation();
  const [profiles, setProfiles] = useState<Record<string, { name: string; data: T }>>({});
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [profileName, setProfileName] = useState('');

  // Load profiles on mount
  useEffect(() => {
    setProfiles(loadProfiles<T>(storageKey));
  }, [storageKey]);

  // Save current data as a profile
  const handleSave = useCallback(() => {
    if (!profileName.trim()) return;
    const id = `custom-${Date.now()}`;
    const newProfiles = {
      ...profiles,
      [id]: {
        name: profileName.trim(),
        data: currentData,
      },
    };
    setProfiles(newProfiles);
    saveProfiles(storageKey, newProfiles);
    setProfileName('');
    setShowSaveDialog(false);
  }, [profileName, profiles, currentData, storageKey]);

  // Load a profile
  const handleLoad = useCallback(
    (id: string) => {
      const profile = profiles[id];
      if (profile) {
        onLoad(profile.data);
      }
    },
    [profiles, onLoad]
  );

  // Delete a profile
  const handleDelete = useCallback(
    (id: string) => {
      const newProfiles = { ...profiles };
      delete newProfiles[id];
      setProfiles(newProfiles);
      saveProfiles(storageKey, newProfiles);
    },
    [profiles, storageKey]
  );

  return (
    <div className="bg-surface rounded-xl border border-subtle p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-content-secondary">{label ?? t('common:myProfiles')}</h4>
          {showReset && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-xs rounded bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
              title={t('ui:profileManager.resetToFactoryDefaults')}
            >
              <RotateCcw className="w-3 h-3" />
              {t('common:reset')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {Object.entries(profiles).map(([id, profile]) => (
            <div
              key={id}
              className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden"
            >
              <button
                onClick={() => handleLoad(id)}
                className="px-3 py-1.5 text-sm text-content hover:text-content hover:bg-surface-raised transition-colors"
              >
                {profile.name}
              </button>
              <button
                onClick={() => handleDelete(id)}
                className="px-2 py-1.5 text-content-secondary hover:text-red-400 hover:bg-surface-raised transition-colors"
              >
                ×
              </button>
            </div>
          ))}
          {showSaveDialog ? (
            <div className="flex items-center gap-1 bg-surface-raised rounded-lg overflow-hidden">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder={t('ui:profileManager.namePlaceholder')}
                className="w-24 px-2 py-1.5 bg-transparent text-content text-sm focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
              />
              <button
                onClick={handleSave}
                disabled={!profileName.trim()}
                className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-content-tertiary transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-2 py-1.5 text-content-secondary hover:text-content transition-colors"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-surface-raised hover:bg-surface-raised text-content-secondary hover:text-content transition-colors flex items-center gap-1"
              title={t('ui:profileManager.saveAsProfile')}
            >
              <span>+</span> {t('common:save')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileManager;
