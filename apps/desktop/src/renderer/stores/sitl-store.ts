/**
 * SITL Store
 *
 * Manages state for the SITL (Software-In-The-Loop) simulator including
 * process lifecycle, profiles, and output logging.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { SitlProfile, SitlConfig } from '../../shared/ipc-channels.js';

// =============================================================================
// Types
// =============================================================================

export interface SitlStore {
  // Process State
  isRunning: boolean;
  isStarting: boolean;
  isStopping: boolean;
  lastCommand: string | null;

  // Output Log
  output: string[];
  maxOutputLines: number;

  // Profiles
  profiles: SitlProfile[];
  currentProfileName: string | null;

  // Errors
  lastError: string | null;

  // Actions
  startSitl: () => Promise<boolean>;
  stopSitl: () => Promise<boolean>;
  appendOutput: (text: string, isError?: boolean) => void;
  clearOutput: () => void;

  // Profile Actions
  selectProfile: (name: string) => void;
  createProfile: (name: string, description?: string) => SitlProfile | null;
  deleteProfile: (name: string) => Promise<boolean>;
  getCurrentProfile: () => SitlProfile | null;

  // Initialization
  initListeners: () => () => void;
  checkStatus: () => Promise<void>;

  // Reset
  reset: () => void;
}

// =============================================================================
// Standard Profiles (not deletable)
// =============================================================================

/**
 * Standard profiles with descriptions explaining what they're for.
 *
 * Each profile has its own EEPROM file that stores:
 * - PIDs, rates, and tuning
 * - Flight modes and aux channel config
 * - Mixer setup (motor/servo)
 * - GPS and navigation settings
 * - All other FC config
 *
 * This persists across SITL restarts, simulating a real FC's EEPROM.
 */
const STANDARD_PROFILES: SitlProfile[] = [
  {
    name: 'Default',
    description: 'Fresh iNav install with factory defaults. Use for general testing.',
    eepromFileName: 'inav-default.bin',
    isStandard: true,
  },
  {
    name: 'Airplane',
    description: 'Pre-configured for fixed-wing testing with airplane mixer.',
    eepromFileName: 'inav-airplane.bin',
    isStandard: true,
  },
  {
    name: 'Quadcopter',
    description: 'Pre-configured for quad testing with X mixer.',
    eepromFileName: 'inav-quadcopter.bin',
    isStandard: true,
  },
];

// =============================================================================
// Store Implementation
// =============================================================================

export const useSitlStore = create<SitlStore>()(
  persist(
    (set, get) => ({
      // Initial State
      isRunning: false,
      isStarting: false,
      isStopping: false,
      lastCommand: null,
      output: [],
      maxOutputLines: 1000,
      profiles: [...STANDARD_PROFILES],
      currentProfileName: STANDARD_PROFILES[0]?.name ?? null,
      lastError: null,

      // Start SITL
      startSitl: async () => {
        const { isRunning, isStarting, getCurrentProfile, appendOutput } = get();

        if (isRunning || isStarting) {
          return false;
        }

        const profile = getCurrentProfile();
        if (!profile) {
          set({ lastError: 'No profile selected' });
          return false;
        }

        set({ isStarting: true, lastError: null });
        appendOutput(`\n--- Starting SITL with profile: ${profile.name} ---\n`);

        try {
          const config: SitlConfig = {
            profileName: profile.name,
            eepromFileName: profile.eepromFileName,
            simulator: profile.simEnabled ? profile.simulator : undefined,
            simIp: profile.simIp,
            simPort: profile.simPort,
            useImu: profile.useImu,
          };

          const result = await window.electronAPI.sitlStart(config);

          if (result.success) {
            set({ isRunning: true, isStarting: false, lastCommand: result.command ?? null });
            if (result.command) {
              appendOutput(`Command: ${result.command}`);
            }
            return true;
          } else {
            set({ isStarting: false, lastError: result.error ?? 'Failed to start SITL' });
            appendOutput(`Error: ${result.error}\n`, true);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ isStarting: false, lastError: message });
          appendOutput(`Error: ${message}\n`, true);
          return false;
        }
      },

      // Stop SITL
      stopSitl: async () => {
        const { isRunning, isStopping, appendOutput } = get();

        if (!isRunning || isStopping) {
          return false;
        }

        set({ isStopping: true });
        appendOutput('\n--- Stopping SITL ---\n');

        try {
          await window.electronAPI.sitlStop();
          set({ isRunning: false, isStopping: false });
          appendOutput('SITL stopped.\n');
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ isStopping: false, lastError: message });
          appendOutput(`Error stopping: ${message}\n`, true);
          return false;
        }
      },

      // Append to output log
      // Note: isError just means it came from stderr, not that it's actually an error
      appendOutput: (text: string, _isError = false) => {
        set((state) => {
          const newOutput = [...state.output];
          const lines = text.split('\n');

          for (const line of lines) {
            if (line || lines.length === 1) {
              // Don't prefix stderr as error - SITL uses stderr for normal logging
              newOutput.push(line);
            }
          }

          // Trim to max lines
          while (newOutput.length > state.maxOutputLines) {
            newOutput.shift();
          }

          return { output: newOutput };
        });
      },

      // Clear output log
      clearOutput: () => {
        set({ output: [] });
      },

      // Select profile
      selectProfile: (name: string) => {
        const { profiles } = get();
        const profile = profiles.find((p) => p.name === name);
        if (profile) {
          set({ currentProfileName: name });
        }
      },

      // Create new profile
      createProfile: (name: string, description?: string) => {
        const { profiles } = get();

        // Check for duplicate name
        if (profiles.some((p) => p.name === name)) {
          set({ lastError: 'Profile name already exists' });
          return null;
        }

        // Generate safe EEPROM filename
        const eepromFileName = name
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_|_$/g, '') + '.bin';

        const newProfile: SitlProfile = {
          name,
          description,
          eepromFileName,
          isStandard: false,
        };

        set((state) => ({
          profiles: [...state.profiles, newProfile],
          currentProfileName: name,
        }));

        return newProfile;
      },

      // Delete profile
      deleteProfile: async (name: string) => {
        const { profiles, currentProfileName } = get();

        const profile = profiles.find((p) => p.name === name);
        if (!profile) {
          return false;
        }

        // Can't delete standard profiles
        if (profile.isStandard) {
          set({ lastError: 'Cannot delete standard profiles' });
          return false;
        }

        // Delete EEPROM file
        try {
          await window.electronAPI.sitlDeleteEeprom(profile.eepromFileName);
        } catch {
          // Ignore - file might not exist
        }

        // Remove from profiles
        const newProfiles = profiles.filter((p) => p.name !== name);
        const newCurrentName = currentProfileName === name
          ? (newProfiles[0]?.name ?? null)
          : currentProfileName;

        set({
          profiles: newProfiles,
          currentProfileName: newCurrentName,
        });

        return true;
      },

      // Get current profile
      getCurrentProfile: () => {
        const { profiles, currentProfileName } = get();
        return profiles.find((p) => p.name === currentProfileName) ?? null;
      },

      // Initialize IPC listeners
      initListeners: () => {
        const { appendOutput } = get();

        // Listen for stdout
        const unsubStdout = window.electronAPI.onSitlStdout((data) => {
          appendOutput(data);
        });

        // Listen for stderr
        const unsubStderr = window.electronAPI.onSitlStderr((data) => {
          appendOutput(data, true);
        });

        // Listen for errors
        const unsubError = window.electronAPI.onSitlError((error) => {
          set({ lastError: error, isRunning: false, isStarting: false });
          appendOutput(`Process error: ${error}\n`, true);
        });

        // Listen for exit
        const unsubExit = window.electronAPI.onSitlExit((data) => {
          set({ isRunning: false, isStarting: false, isStopping: false });
          if (data.code !== null) {
            appendOutput(`\nSITL exited with code ${data.code}\n`);
          } else if (data.signal) {
            appendOutput(`\nSITL killed by signal ${data.signal}\n`);
          }
        });

        // Return cleanup function
        return () => {
          unsubStdout();
          unsubStderr();
          unsubError();
          unsubExit();
        };
      },

      // Check SITL status (on mount)
      checkStatus: async () => {
        try {
          const status = await window.electronAPI.sitlGetStatus();
          set({ isRunning: status.isRunning });
        } catch {
          // Ignore errors
        }
      },

      // Reset store
      reset: () => {
        set({
          isRunning: false,
          isStarting: false,
          isStopping: false,
          lastCommand: null,
          output: [],
          lastError: null,
        });
      },
    }),
    {
      name: 'sitl-storage',
      // Only persist profiles and current selection
      partialize: (state) => ({
        profiles: state.profiles,
        currentProfileName: state.currentProfileName,
      }),
    }
  )
);
