/**
 * ArduPilot SITL Store
 *
 * Manages state for the ArduPilot SITL (Software-In-The-Loop) simulator including
 * process lifecycle, binary downloads, and configuration.
 */

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  ArduPilotSitlConfig,
  ArduPilotSitlStatus,
  ArduPilotSitlDownloadProgress,
  ArduPilotSitlBinaryInfo,
  ArduPilotVehicleType,
  ArduPilotReleaseTrack,
  ArduPilotSimulatorType,
  VirtualRCState,
} from '../../shared/ipc-channels.js';

// =============================================================================
// Types
// =============================================================================

export interface ArduPilotSitlStore {
  // Platform Support
  platformSupported: boolean;
  platformError: string | null;
  usesDocker: boolean;

  // Process State
  isRunning: boolean;
  isStarting: boolean;
  isStopping: boolean;
  isStatusChecked: boolean;
  lastCommand: string | null;

  // Download State
  isDownloading: boolean;
  downloadProgress: ArduPilotSitlDownloadProgress | null;
  binaryInfo: ArduPilotSitlBinaryInfo | null;

  // Output Log
  output: string[];
  maxOutputLines: number;

  // Configuration (persisted)
  vehicleType: ArduPilotVehicleType;
  model: string;
  releaseTrack: ArduPilotReleaseTrack;
  homeLocation: {
    lat: number;
    lng: number;
    alt: number;
    heading: number;
  };
  speedup: number;
  wipeOnStart: boolean;
  simulator: ArduPilotSimulatorType;
  simAddress: string;

  // RC State
  isRcSending: boolean;
  rcState: VirtualRCState;

  // Errors
  lastError: string | null;

  // Actions
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  download: () => Promise<boolean>;
  checkBinary: () => Promise<void>;
  checkPlatform: () => Promise<void>;
  appendOutput: (text: string, isError?: boolean) => void;
  clearOutput: () => void;

  // Configuration Actions
  setVehicleType: (type: ArduPilotVehicleType) => void;
  setModel: (model: string) => void;
  setReleaseTrack: (track: ArduPilotReleaseTrack) => void;
  setHomeLocation: (loc: { lat: number; lng: number; alt: number; heading: number }) => void;
  setSpeedup: (speedup: number) => void;
  setWipeOnStart: (wipe: boolean) => void;
  setSimulator: (sim: ArduPilotSimulatorType) => void;
  setSimAddress: (address: string) => void;

  // RC Actions
  startRcSender: () => Promise<void>;
  stopRcSender: () => Promise<void>;
  setRcState: (state: Partial<VirtualRCState>) => Promise<void>;
  resetRcState: () => void;

  // Initialization
  initListeners: () => () => void;
  checkStatus: () => Promise<void>;

  // Reset
  reset: () => void;
}

// =============================================================================
// Model Options by Vehicle Type
// =============================================================================

export const ARDUPILOT_MODELS: Record<ArduPilotVehicleType, Array<{ value: string; label: string }>> = {
  copter: [
    { value: 'quad', label: 'Quad (default)' },
    { value: '+', label: 'Quad Plus (+)' },
    { value: 'hexa', label: 'Hexacopter' },
    { value: 'octa', label: 'Octocopter' },
    { value: 'tri', label: 'Tricopter' },
    { value: 'coax', label: 'Coaxial Copter' },
    { value: 'heli', label: 'Helicopter' },
    { value: 'singlecopter', label: 'Single Copter' },
  ],
  plane: [
    { value: 'plane', label: 'Plane (default)' },
    { value: 'quadplane', label: 'QuadPlane' },
    { value: 'firefly', label: 'FireFly6' },
    { value: 'plane-vtail', label: 'V-Tail Plane' },
    { value: 'plane-dspoilers', label: 'Plane w/ Spoilers' },
  ],
  rover: [
    { value: 'rover', label: 'Rover (default)' },
    { value: 'rover-skid', label: 'Skid Steering' },
    { value: 'boat', label: 'Boat' },
    { value: 'sailboat', label: 'Sailboat' },
    { value: 'balancebot', label: 'Balance Bot' },
  ],
  sub: [
    { value: 'vectored', label: 'Vectored (default)' },
    { value: 'vectored_6dof', label: 'Vectored 6DOF' },
  ],
};

// =============================================================================
// Default Configuration
// =============================================================================

const DEFAULT_HOME = {
  lat: 37.7749,
  lng: -122.4194,
  alt: 10,
  heading: 270,
};

const DEFAULT_RC_STATE: VirtualRCState = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: -1, // Minimum for safety
  aux1: 0,
  aux2: 0,
  aux3: 0,
  aux4: 0,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useArduPilotSitlStore = create<ArduPilotSitlStore>()(
  persist(
    (set, get) => ({
      // Initial State
      platformSupported: true, // Assume true until checked
      platformError: null,
      usesDocker: false,

      isRunning: false,
      isStarting: false,
      isStopping: false,
      isStatusChecked: false,
      lastCommand: null,

      isDownloading: false,
      downloadProgress: null,
      binaryInfo: null,

      output: [],
      maxOutputLines: 1000,

      // Default configuration
      vehicleType: 'copter',
      model: 'quad',
      releaseTrack: 'stable',
      homeLocation: DEFAULT_HOME,
      speedup: 1,
      wipeOnStart: false,
      simulator: 'none',
      simAddress: '127.0.0.1',

      isRcSending: false,
      rcState: DEFAULT_RC_STATE,

      lastError: null,

      // Start SITL
      start: async () => {
        const {
          isRunning,
          isStarting,
          vehicleType,
          model,
          releaseTrack,
          homeLocation,
          speedup,
          wipeOnStart,
          simulator,
          simAddress,
          appendOutput,
        } = get();

        if (isRunning || isStarting) {
          return false;
        }

        set({ isStarting: true, lastError: null });
        appendOutput(`\n--- Starting ArduPilot SITL (${vehicleType}) ---\n`);

        try {
          const config: ArduPilotSitlConfig = {
            vehicleType,
            model,
            releaseTrack,
            homeLocation,
            speedup,
            wipeOnStart,
            simulator: simulator === 'none' ? undefined : simulator,
            simAddress: simulator !== 'none' ? simAddress : undefined,
          };

          const result = await window.electronAPI.ardupilotSitlStart(config);

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
      stop: async () => {
        const { isRunning, isStopping, appendOutput, stopRcSender } = get();

        if (!isRunning || isStopping) {
          return false;
        }

        set({ isStopping: true });
        appendOutput('\n--- Stopping ArduPilot SITL ---\n');

        try {
          // Stop RC sender first
          await stopRcSender();

          await window.electronAPI.ardupilotSitlStop();
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

      // Download binary
      download: async () => {
        const { vehicleType, releaseTrack, appendOutput } = get();

        set({ isDownloading: true, lastError: null });
        appendOutput(`\n--- Downloading ArduPilot SITL binary (${vehicleType} ${releaseTrack}) ---\n`);

        try {
          const result = await window.electronAPI.ardupilotSitlDownload(vehicleType, releaseTrack);

          if (result.success) {
            set({ isDownloading: false });
            appendOutput(`Downloaded to: ${result.path}\n`);
            // Refresh binary info
            await get().checkBinary();
            return true;
          } else {
            set({ isDownloading: false, lastError: result.error ?? 'Download failed' });
            appendOutput(`Download failed: ${result.error}\n`, true);
            return false;
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unknown error';
          set({ isDownloading: false, lastError: message });
          appendOutput(`Download error: ${message}\n`, true);
          return false;
        }
      },

      // Check if binary exists
      checkBinary: async () => {
        const { vehicleType, releaseTrack } = get();

        try {
          const info = await window.electronAPI.ardupilotSitlCheckBinary(vehicleType, releaseTrack);
          set({ binaryInfo: info });
        } catch {
          set({ binaryInfo: null });
        }
      },

      // Check if platform supports ArduPilot SITL
      checkPlatform: async () => {
        try {
          const result = await window.electronAPI.ardupilotSitlCheckPlatform();
          set({
            platformSupported: result.supported,
            platformError: result.error ?? null,
            usesDocker: result.useDocker ?? false,
          });
        } catch {
          // Assume supported if check fails
          set({ platformSupported: true, platformError: null, usesDocker: false });
        }
      },

      // Append to output log
      appendOutput: (text: string, _isError = false) => {
        set((state) => {
          const newOutput = [...state.output];
          const lines = text.split('\n');

          for (const line of lines) {
            if (line || lines.length === 1) {
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

      // Configuration setters
      setVehicleType: (type) => {
        // Reset model to default for new vehicle type
        const defaultModel = ARDUPILOT_MODELS[type][0]?.value ?? type;
        set({ vehicleType: type, model: defaultModel, binaryInfo: null });
        get().checkBinary();
      },
      setModel: (model) => set({ model }),
      setReleaseTrack: (track) => {
        set({ releaseTrack: track, binaryInfo: null });
        get().checkBinary();
      },
      setHomeLocation: (loc) => set({ homeLocation: loc }),
      setSpeedup: (speedup) => set({ speedup }),
      setWipeOnStart: (wipe) => set({ wipeOnStart: wipe }),
      setSimulator: (sim) => set({ simulator: sim }),
      setSimAddress: (address) => set({ simAddress: address }),

      // RC Actions
      startRcSender: async () => {
        try {
          await window.electronAPI.ardupilotSitlRcStart();
          set({ isRcSending: true });
        } catch {
          // Ignore
        }
      },

      stopRcSender: async () => {
        try {
          await window.electronAPI.ardupilotSitlRcStop();
          set({ isRcSending: false });
        } catch {
          // Ignore
        }
      },

      setRcState: async (state) => {
        const newState = { ...get().rcState, ...state };
        set({ rcState: newState });
        await window.electronAPI.ardupilotSitlRcSend(state);
      },

      resetRcState: () => {
        set({ rcState: DEFAULT_RC_STATE });
      },

      // Initialize IPC listeners
      initListeners: () => {
        const { appendOutput, checkBinary, checkPlatform } = get();

        // Check platform and binary on init
        checkPlatform();
        checkBinary();

        // Listen for stdout
        const unsubStdout = window.electronAPI.onArdupilotSitlStdout((data) => {
          appendOutput(data);
        });

        // Listen for stderr
        const unsubStderr = window.electronAPI.onArdupilotSitlStderr((data) => {
          appendOutput(data, true);
        });

        // Listen for errors
        const unsubError = window.electronAPI.onArdupilotSitlError((error) => {
          set({ lastError: error, isRunning: false, isStarting: false });
          appendOutput(`Process error: ${error}\n`, true);
        });

        // Listen for exit
        const unsubExit = window.electronAPI.onArdupilotSitlExit((data) => {
          set({ isRunning: false, isStarting: false, isStopping: false, isRcSending: false });
          if (data.code !== null) {
            appendOutput(`\nSITL exited with code ${data.code}\n`);
          } else if (data.signal) {
            appendOutput(`\nSITL killed by signal ${data.signal}\n`);
          }
        });

        // Listen for download progress
        const unsubProgress = window.electronAPI.onArdupilotSitlDownloadProgress((progress) => {
          set({ downloadProgress: progress });
          if (progress.status === 'complete') {
            set({ isDownloading: false });
            checkBinary();
          } else if (progress.status === 'error') {
            set({ isDownloading: false, lastError: progress.error ?? 'Download failed' });
          }
        });

        // Return cleanup function
        return () => {
          unsubStdout();
          unsubStderr();
          unsubError();
          unsubExit();
          unsubProgress();
        };
      },

      // Check SITL status (on mount)
      checkStatus: async () => {
        try {
          const status = await window.electronAPI.ardupilotSitlGetStatus();
          set({ isRunning: status.isRunning });
        } catch {
          // Ignore errors
        } finally {
          set({ isStatusChecked: true });
        }
      },

      // Reset store
      reset: () => {
        set({
          isRunning: false,
          isStarting: false,
          isStopping: false,
          isStatusChecked: false,
          lastCommand: null,
          isDownloading: false,
          downloadProgress: null,
          output: [],
          lastError: null,
          isRcSending: false,
          rcState: DEFAULT_RC_STATE,
        });
      },
    }),
    {
      name: 'ardupilot-sitl-storage',
      // Persist configuration only
      partialize: (state) => ({
        vehicleType: state.vehicleType,
        model: state.model,
        releaseTrack: state.releaseTrack,
        homeLocation: state.homeLocation,
        speedup: state.speedup,
        wipeOnStart: state.wipeOnStart,
        simulator: state.simulator,
        simAddress: state.simAddress,
      }),
    }
  )
);
