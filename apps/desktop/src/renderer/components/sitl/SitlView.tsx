/**
 * SITL View
 *
 * Main view for SITL (Software-In-The-Loop) simulation.
 * Allows starting/stopping the SITL process and managing profiles.
 */

import { useEffect, useRef, useState } from 'react';
import { useSitlStore } from '../../stores/sitl-store';
import { useConnectionStore } from '../../stores/connection-store';
import { useSettingsStore } from '../../stores/settings-store';

export default function SitlView() {
  const {
    isRunning,
    isStarting,
    isStopping,
    output,
    profiles,
    currentProfileName,
    lastError,
    lastCommand,
    startSitl,
    stopSitl,
    clearOutput,
    selectProfile,
    createProfile,
    deleteProfile,
    getCurrentProfile,
    initListeners,
    checkStatus,
  } = useSitlStore();

  const { connectionState } = useConnectionStore();
  const { setPendingSitlSwitch } = useSettingsStore();
  const outputRef = useRef<HTMLDivElement>(null);
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [newProfileName, setNewProfileName] = useState('');
  const [newProfileDesc, setNewProfileDesc] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Initialize listeners and check status on mount
  useEffect(() => {
    checkStatus();
    const cleanup = initListeners();
    return cleanup;
  }, [initListeners, checkStatus]);

  // Switch connection panel to TCP when SITL starts
  useEffect(() => {
    if (isRunning) {
      // Set flag to tell ConnectionPanel to switch to TCP
      setPendingSitlSwitch(true);
    }
  }, [isRunning, setPendingSitlSwitch]);

  // Auto-scroll output to bottom
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [output]);

  const handleCreateProfile = () => {
    if (newProfileName.trim()) {
      createProfile(newProfileName.trim(), newProfileDesc.trim() || undefined);
      setNewProfileName('');
      setNewProfileDesc('');
      setShowNewProfile(false);
    }
  };

  const handleDeleteProfile = async () => {
    const profile = getCurrentProfile();
    if (profile && !profile.isStandard) {
      await deleteProfile(profile.name);
      setShowDeleteConfirm(false);
    }
  };

  const currentProfile = getCurrentProfile();
  const canDelete = currentProfile && !currentProfile.isStandard;

  return (
    <div className="h-full flex flex-col bg-zinc-950">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
        <div className="flex items-center gap-3">
          {/* SITL icon */}
          <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
            <svg className="w-4 h-4 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">SITL Simulator</h1>
            <p className="text-xs text-zinc-500">
              Test iNav without hardware - runs the real flight controller firmware
            </p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
            isRunning
              ? 'bg-green-500/10 text-green-400 border border-green-500/30'
              : 'bg-zinc-800 text-zinc-400 border border-zinc-700'
          }`}>
            <div className={`w-2 h-2 rounded-full ${
              isRunning ? 'bg-green-400 animate-pulse' : 'bg-zinc-500'
            }`} />
            {isRunning ? 'Running' : 'Stopped'}
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden p-4 gap-4">
        {/* Profile selection card */}
        <div className="bg-zinc-900/50 border border-zinc-800 rounded-lg p-4">
          <div className="flex items-start gap-4">
            {/* Profile info */}
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <label className="text-sm font-medium text-zinc-300">Profile</label>
                <select
                  value={currentProfileName ?? ''}
                  onChange={(e) => selectProfile(e.target.value)}
                  disabled={isRunning || isStarting}
                  className="px-3 py-1.5 bg-zinc-800 text-white text-sm border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50 disabled:opacity-50"
                >
                  {profiles.map((profile) => (
                    <option key={profile.name} value={profile.name}>
                      {profile.name} {profile.isStandard ? '' : '(custom)'}
                    </option>
                  ))}
                </select>

                {/* New profile button */}
                <button
                  onClick={() => setShowNewProfile(true)}
                  disabled={isRunning || isStarting}
                  className="px-2 py-1.5 text-xs font-medium text-zinc-300 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded-lg transition-colors disabled:opacity-50"
                  title="Create new profile"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                </button>

                {/* Delete profile button */}
                {canDelete && (
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    disabled={isRunning || isStarting}
                    className="px-2 py-1.5 text-xs font-medium text-red-400 bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 rounded-lg transition-colors disabled:opacity-50"
                    title="Delete profile"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                )}
              </div>

              {/* Profile description */}
              {currentProfile && (
                <div className="text-xs text-zinc-500 mb-3">
                  {currentProfile.description || 'Custom profile with its own EEPROM file.'}
                </div>
              )}

              {/* What is a profile? */}
              <div className="text-xs text-zinc-600 border-t border-zinc-800 pt-3">
                <span className="text-zinc-500">What's a profile?</span> Each profile has its own EEPROM file that stores
                your FC config (PIDs, rates, modes, mixer, etc.). Configs persist across SITL restarts, just like a real board.
              </div>
            </div>

            {/* Start/Stop buttons */}
            <div className="flex flex-col gap-2">
              {!isRunning ? (
                <button
                  onClick={startSitl}
                  disabled={isStarting || connectionState.isConnected}
                  className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isStarting ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Starting...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Start SITL
                    </>
                  )}
                </button>
              ) : (
                <button
                  onClick={stopSitl}
                  disabled={isStopping}
                  className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors disabled:opacity-50 flex items-center gap-2"
                >
                  {isStopping ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Stopping...
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 10a1 1 0 011-1h4a1 1 0 011 1v4a1 1 0 01-1 1h-4a1 1 0 01-1-1v-4z" />
                      </svg>
                      Stop SITL
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Connection hint */}
        {isRunning && !connectionState.isConnected && (
          <div className="flex items-center gap-3 px-4 py-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <svg className="w-5 h-5 text-blue-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-blue-300">
              <span className="font-medium">SITL is running!</span>{' '}
              Connect via TCP in the sidebar — <code className="px-1.5 py-0.5 bg-blue-500/20 rounded text-blue-200 font-mono">127.0.0.1:5760</code>
            </div>
          </div>
        )}

        {/* Error display */}
        {lastError && (
          <div className="flex items-center gap-2 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg">
            <svg className="w-5 h-5 text-red-400 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div className="text-sm text-red-300">{lastError}</div>
          </div>
        )}

        {/* Output log */}
        <div className="flex-1 flex flex-col overflow-hidden bg-zinc-900 border border-zinc-800 rounded-lg">
          <div className="flex items-center justify-between px-3 py-2 border-b border-zinc-800 bg-zinc-900/50">
            <span className="text-xs font-medium text-zinc-400">Console Output</span>
            <div className="flex items-center gap-2">
              {lastCommand && (
                <span className="text-xs text-zinc-500 font-mono truncate max-w-md" title={lastCommand}>
                  {lastCommand.split('/').pop()}
                </span>
              )}
              <button
                onClick={clearOutput}
                disabled={output.length === 0}
                className="px-2 py-1 text-xs text-zinc-400 hover:text-white transition-colors disabled:opacity-50"
                title="Clear output"
              >
                Clear
              </button>
            </div>
          </div>
          <div
            ref={outputRef}
            className="flex-1 overflow-auto p-3 font-mono text-xs leading-relaxed"
          >
            {output.length === 0 ? (
              <div className="text-zinc-600 italic">
                No output yet. Start SITL to see process output.
              </div>
            ) : (
              output.map((line, idx) => {
                // Filter out verbose EEPROM programming messages
                if (line.includes('[EEPROM] Program word')) return null;

                return (
                  <div
                    key={idx}
                    className={
                      line.startsWith('[ERROR]')
                        ? 'text-red-400'
                        : line.startsWith('---')
                          ? 'text-purple-400 font-medium'
                          : line.startsWith('Command:')
                            ? 'text-blue-400'
                            : line.includes('[SYSTEM]') || line.includes('[SIM]')
                              ? 'text-green-400'
                              : line.includes('[EEPROM]')
                                ? 'text-yellow-400'
                                : 'text-zinc-300'
                    }
                  >
                    {line}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* New Profile Modal */}
      {showNewProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-[420px] shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-1">Create New Profile</h3>
            <p className="text-xs text-zinc-500 mb-4">
              Each profile has its own EEPROM file for storing your FC configuration.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-zinc-400 mb-1">Profile Name</label>
                <input
                  type="text"
                  value={newProfileName}
                  onChange={(e) => setNewProfileName(e.target.value)}
                  placeholder="e.g., My Quad Setup"
                  className="w-full px-3 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setShowNewProfile(false);
                  }}
                />
              </div>

              <div>
                <label className="block text-sm text-zinc-400 mb-1">Description (optional)</label>
                <input
                  type="text"
                  value={newProfileDesc}
                  onChange={(e) => setNewProfileDesc(e.target.value)}
                  placeholder="e.g., Testing GPS rescue settings"
                  className="w-full px-3 py-2 bg-zinc-800 text-white border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500/50"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleCreateProfile();
                    if (e.key === 'Escape') setShowNewProfile(false);
                  }}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => {
                  setShowNewProfile(false);
                  setNewProfileName('');
                  setNewProfileDesc('');
                }}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateProfile}
                disabled={!newProfileName.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-purple-600 hover:bg-purple-500 rounded-lg transition-colors disabled:opacity-50"
              >
                Create Profile
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && currentProfile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-6 w-96 shadow-xl">
            <h3 className="text-lg font-semibold text-white mb-2">Delete Profile</h3>
            <p className="text-sm text-zinc-400 mb-4">
              Are you sure you want to delete "<span className="text-white">{currentProfile.name}</span>"?
              This will also delete the EEPROM file with all your saved configuration.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-sm text-zinc-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteProfile}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-500 rounded-lg transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
