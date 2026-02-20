/**
 * ProfileManager Component
 *
 * Reusable custom profile save/load functionality.
 * Stores profiles in localStorage with type safety.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { RotateCcw, Check } from 'lucide-react';

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
  label = 'My Profiles',
  showReset = true,
}: ProfileManagerProps<T>) {
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
    <div className="bg-gray-800/30 rounded-xl border border-gray-700/30 p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-gray-400">{label}</h4>
          {showReset && (
            <button
              onClick={onReset}
              className="px-2 py-1 text-xs rounded bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
              title="Reset to factory defaults"
            >
              <RotateCcw className="w-3 h-3" />
              Reset
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {Object.entries(profiles).map(([id, profile]) => (
            <div
              key={id}
              className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden"
            >
              <button
                onClick={() => handleLoad(id)}
                className="px-3 py-1.5 text-sm text-gray-300 hover:text-white hover:bg-gray-600/50 transition-colors"
              >
                {profile.name}
              </button>
              <button
                onClick={() => handleDelete(id)}
                className="px-2 py-1.5 text-gray-500 hover:text-red-400 hover:bg-gray-600/50 transition-colors"
              >
                ×
              </button>
            </div>
          ))}
          {showSaveDialog ? (
            <div className="flex items-center gap-1 bg-gray-700/50 rounded-lg overflow-hidden">
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="Name..."
                className="w-24 px-2 py-1.5 bg-transparent text-white text-sm focus:outline-none"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSave();
                  if (e.key === 'Escape') setShowSaveDialog(false);
                }}
              />
              <button
                onClick={handleSave}
                disabled={!profileName.trim()}
                className="px-2 py-1.5 text-emerald-400 hover:text-emerald-300 disabled:text-gray-600 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowSaveDialog(false)}
                className="px-2 py-1.5 text-gray-500 hover:text-gray-300 transition-colors"
              >
                ×
              </button>
            </div>
          ) : (
            <button
              onClick={() => setShowSaveDialog(true)}
              className="px-3 py-1.5 text-sm rounded-lg bg-gray-700/50 hover:bg-gray-600/50 text-gray-400 hover:text-gray-200 transition-colors flex items-center gap-1"
              title="Save current settings as a profile"
            >
              <span>+</span> Save
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default ProfileManager;
