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

// Simulator info from detection
export interface SimulatorInfo {
  name: 'flightgear' | 'xplane';
  installed: boolean;
  path: string | null;
  version: string | null;
}

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

  // Visual Simulator State (FlightGear / X-Plane)
  detectedSimulators: SimulatorInfo[];
  isFlightGearRunning: boolean;
  isBridgeRunning: boolean;
  isFlightGearStarting: boolean;
  flightGearError: string | null;

  // Simulator Config
  simulatorEnabled: boolean;
  flightGearConfig: {
    aircraft: string;
    airport: string;
    timeOfDay: 'dawn' | 'morning' | 'noon' | 'afternoon' | 'dusk' | 'night';
    weather: 'clear' | 'cloudy' | 'rain';
  };

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

  // Visual Simulator Actions
  detectSimulators: () => Promise<void>;
  setSimulatorEnabled: (enabled: boolean) => void;
  setFlightGearConfig: (config: Partial<SitlStore['flightGearConfig']>) => void;
  launchFlightGear: () => Promise<boolean>;
  stopFlightGear: () => Promise<boolean>;
  startBridge: () => Promise<boolean>;
  stopBridge: () => Promise<boolean>;
  launchWithSimulator: () => Promise<boolean>;
  stopWithSimulator: () => Promise<boolean>;

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

      // Visual Simulator Initial State
      detectedSimulators: [],
      isFlightGearRunning: false,
      isBridgeRunning: false,
      isFlightGearStarting: false,
      flightGearError: null,
      simulatorEnabled: false,
      flightGearConfig: {
        aircraft: 'c172p',
        airport: 'KSFO',
        timeOfDay: 'noon',
        weather: 'clear',
      },

      // Start SITL
      startSitl: async () => {
        const { isRunning, isStarting, getCurrentProfile, appendOutput, simulatorEnabled } = get();

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
          // Use store's simulatorEnabled to determine if we should use X-Plane sim mode
          const useSimulator = simulatorEnabled || profile.simEnabled;

          const config: SitlConfig = {
            eepromFileName: profile.eepromFileName,
            simulator: useSimulator ? 'xp' : undefined,  // 'xp' for X-Plane protocol (used by bridge)
            simIp: profile.simIp || '127.0.0.1',
            // simPort is where SITL SENDS pwm/servo data TO (for control surface feedback)
            // SITL receives sensor data on port 49000 (hardcoded in iNav SITL)
            simPort: profile.simPort || 49000,
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

      // =============================================================================
      // Visual Simulator Actions
      // =============================================================================

      // Detect installed simulators
      detectSimulators: async () => {
        try {
          const simulators = await window.electronAPI.simulatorDetect();
          set({ detectedSimulators: simulators });
        } catch (error) {
          console.error('[SITL Store] Failed to detect simulators:', error);
        }
      },

      // Enable/disable simulator integration
      setSimulatorEnabled: (enabled: boolean) => {
        set({ simulatorEnabled: enabled });
      },

      // Update FlightGear config
      setFlightGearConfig: (config) => {
        set((state) => ({
          flightGearConfig: { ...state.flightGearConfig, ...config },
        }));
      },

      // Launch FlightGear
      launchFlightGear: async () => {
        const { isFlightGearRunning, isFlightGearStarting, flightGearConfig, appendOutput } = get();

        if (isFlightGearRunning || isFlightGearStarting) {
          return false;
        }

        set({ isFlightGearStarting: true, flightGearError: null });
        appendOutput('\n--- Launching FlightGear ---\n');

        try {
          const result = await window.electronAPI.simulatorLaunchFlightGear(flightGearConfig);

          if (result.success) {
            set({ isFlightGearRunning: true, isFlightGearStarting: false });
            appendOutput(`FlightGear launched with aircraft: ${flightGearConfig.aircraft}, airport: ${flightGearConfig.airport}\n`);
            return true;
          } else {
            set({ isFlightGearStarting: false, flightGearError: result.error ?? 'Failed to launch FlightGear' });
            appendOutput(`FlightGear error: ${result.error}\n`, true);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ isFlightGearStarting: false, flightGearError: message });
          appendOutput(`FlightGear error: ${message}\n`, true);
          return false;
        }
      },

      // Stop FlightGear
      stopFlightGear: async () => {
        const { isFlightGearRunning, appendOutput } = get();

        if (!isFlightGearRunning) {
          return false;
        }

        appendOutput('\n--- Stopping FlightGear ---\n');

        try {
          await window.electronAPI.simulatorStopFlightGear();
          set({ isFlightGearRunning: false });
          appendOutput('FlightGear stopped.\n');
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ flightGearError: message });
          appendOutput(`FlightGear stop error: ${message}\n`, true);
          return false;
        }
      },

      // Start protocol bridge
      startBridge: async () => {
        const { isBridgeRunning, appendOutput } = get();

        if (isBridgeRunning) {
          return false;
        }

        appendOutput('Starting protocol bridge...\n');

        try {
          const result = await window.electronAPI.bridgeStart();

          if (result.success) {
            set({ isBridgeRunning: true });
            appendOutput('Protocol bridge started (FlightGear <-> iNav SITL)\n');
            return true;
          } else {
            appendOutput(`Bridge error: ${result.error}\n`, true);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          appendOutput(`Bridge error: ${message}\n`, true);
          return false;
        }
      },

      // Stop protocol bridge
      stopBridge: async () => {
        const { isBridgeRunning, appendOutput } = get();

        if (!isBridgeRunning) {
          return false;
        }

        appendOutput('Stopping protocol bridge...\n');

        try {
          await window.electronAPI.bridgeStop();
          set({ isBridgeRunning: false });
          appendOutput('Protocol bridge stopped.\n');
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          appendOutput(`Bridge stop error: ${message}\n`, true);
          return false;
        }
      },

      // Launch everything with simulator (one-click experience)
      launchWithSimulator: async () => {
        const {
          simulatorEnabled,
          detectedSimulators,
          launchFlightGear,
          startBridge,
          startSitl,
          appendOutput,
        } = get();

        // If simulator not enabled, just start SITL
        if (!simulatorEnabled) {
          return await startSitl();
        }

        // Check if FlightGear is installed
        const flightGear = detectedSimulators.find((s) => s.name === 'flightgear');
        if (!flightGear?.installed) {
          set({ flightGearError: 'FlightGear is not installed' });
          appendOutput('FlightGear is not installed. Please install it first.\n', true);
          return false;
        }

        appendOutput('\n========== LAUNCHING SIMULATION ==========\n');

        // Step 1: Launch FlightGear
        const fgSuccess = await launchFlightGear();
        if (!fgSuccess) {
          return false;
        }

        // Step 2: Start protocol bridge (before FlightGear is fully ready)
        const bridgeSuccess = await startBridge();
        if (!bridgeSuccess) {
          // Clean up FlightGear
          await get().stopFlightGear();
          return false;
        }

        // Wait for FlightGear to fully initialize and start sending data
        // This can take 15-30 seconds depending on scenery complexity
        appendOutput('Waiting for FlightGear to initialize (this may take 15-30 seconds)...\n');
        await new Promise((resolve) => setTimeout(resolve, 15000));

        // Step 3: Start SITL with X-Plane simulator mode
        appendOutput('Starting iNav SITL...\n');
        const sitlSuccess = await startSitl();
        if (!sitlSuccess) {
          // Clean up
          await get().stopBridge();
          await get().stopFlightGear();
          return false;
        }

        appendOutput('========== SIMULATION READY ==========\n');
        appendOutput('FlightGear is now controlled by iNav SITL.\n');
        appendOutput('Connect ArduDeck to TCP 127.0.0.1:5760 to access telemetry.\n');

        return true;
      },

      // Stop everything
      stopWithSimulator: async () => {
        const { stopSitl, stopBridge, stopFlightGear, simulatorEnabled, appendOutput } = get();

        appendOutput('\n========== STOPPING SIMULATION ==========\n');

        // Stop in reverse order
        await stopSitl();

        if (simulatorEnabled) {
          await stopBridge();
          await stopFlightGear();
        }

        appendOutput('========== SIMULATION STOPPED ==========\n');
        return true;
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
          // Check SITL process status
          const sitlStatus = await window.electronAPI.sitlGetStatus();
          set({ isRunning: sitlStatus.isRunning });

          // Check FlightGear status
          const fgStatus = await window.electronAPI.simulatorFlightGearStatus();
          set({ isFlightGearRunning: fgStatus.running });

          // Check bridge status
          const bridgeStatus = await window.electronAPI.bridgeStatus();
          set({ isBridgeRunning: bridgeStatus.running });

          // Detect simulators
          get().detectSimulators();
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
          isFlightGearRunning: false,
          isBridgeRunning: false,
          isFlightGearStarting: false,
          flightGearError: null,
        });
      },
    }),
    {
      name: 'sitl-storage',
      // Persist profiles, selection, and simulator config
      partialize: (state) => ({
        profiles: state.profiles,
        currentProfileName: state.currentProfileName,
        simulatorEnabled: state.simulatorEnabled,
        flightGearConfig: state.flightGearConfig,
      }),
    }
  )
);
