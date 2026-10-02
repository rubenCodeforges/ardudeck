/**
 * PX4 SITL Store
 *
 * Manages state for the PX4 SITL (Software-In-The-Loop) simulator including
 * process lifecycle, bundle downloads, and configuration.
 *
 * Deliberately simpler than the ArduPilot SITL store: PX4 ships a single
 * per-track bundle covering every airframe (no per-vehicle binary, no frame
 * catalog), physics come from a bundled backend (jMAVSim by default) so there
 * is no custom JSON FDM, no ArduDeck sim-engine, no FlightGear viewer, and no
 * virtual RC sender.
 */

import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import { persist } from 'zustand/middleware';
import type {
  Px4VehicleType,
  Px4ReleaseTrack,
  Px4SimulatorBackend,
  Px4SitlConfig,
  Px4SitlStatus,
  Px4SitlBinaryInfo,
  Px4SitlDownloadProgress,
  Px4SitlExitData,
  Px4SitlStartedData,
} from '../../shared/ipc-channels.js';

// =============================================================================
// Types
// =============================================================================

export interface Px4SitlStore {
  // Platform Support
  platform: { supported: boolean; needsJava: boolean; error?: string } | null;

  // Process State
  isRunning: boolean;
  pid: number | null;
  isStarting: boolean;
  isStopping: boolean;

  // Download State
  isDownloading: boolean;
  downloadProgress: Px4SitlDownloadProgress | null;
  binaryInfo: Px4SitlBinaryInfo | null;

  // Console Log
  consoleLines: string[];
  maxConsoleLines: number;

  // Configuration (persisted)
  vehicleType: Px4VehicleType;
  releaseTrack: Px4ReleaseTrack;
  simulator: Px4SimulatorBackend;
  homeLocation: {
    lat: number;
    lng: number;
    alt: number;
    heading: number;
  };
  speedup: number;
  wipeOnStart: boolean;

  // Errors
  lastError: string | null;

  // Configuration Actions
  setVehicleType: (type: Px4VehicleType) => void;
  setReleaseTrack: (track: Px4ReleaseTrack) => void;
  setSimulator: (sim: Px4SimulatorBackend) => void;
  setHomeLocation: (loc: { lat: number; lng: number; alt: number; heading: number }) => void;
  setSpeedup: (speedup: number) => void;
  setWipeOnStart: (wipe: boolean) => void;

  // Console helpers
  appendConsole: (text: string, isError?: boolean) => void;
  clearConsole: () => void;

  // Actions
  checkPlatform: () => Promise<void>;
  checkBinary: () => Promise<void>;
  download: () => Promise<boolean>;
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  checkStatus: () => Promise<void>;

  // Initialization
  subscribeToEvents: () => () => void;
  initEventListeners: () => () => void;

  // Reset
  reset: () => void;
}

// =============================================================================
// Default Configuration
// =============================================================================

// CMAC: ArduPilot/PX4's canonical Canberra Model Aircraft Club test field.
const DEFAULT_HOME = {
  lat: -35.363262,
  lng: 149.165237,
  alt: 584,
  heading: 0,
};

// =============================================================================
// Store Implementation
// =============================================================================

export const usePx4SitlStore = create<Px4SitlStore>()(
  persist(
    (set, get) => ({
      // Initial State
      platform: null,

      isRunning: false,
      pid: null,
      isStarting: false,
      isStopping: false,

      isDownloading: false,
      downloadProgress: null,
      binaryInfo: null,

      consoleLines: [],
      maxConsoleLines: 1000,

      // Default configuration
      vehicleType: 'copter',
      releaseTrack: 'stable',
      simulator: 'jmavsim',
      homeLocation: DEFAULT_HOME,
      speedup: 1,
      wipeOnStart: false,

      lastError: null,

      // Configuration setters
      setVehicleType: (type) => set({ vehicleType: type }),
      setReleaseTrack: (track) => {
        // Binary bundles are per-track, so a track change invalidates the
        // cached binary info until the next probe.
        set({ releaseTrack: track, binaryInfo: null });
        get().checkBinary();
      },
      setSimulator: (sim) => set({ simulator: sim }),
      setHomeLocation: (loc) => set({ homeLocation: loc }),
      setSpeedup: (speedup) => set({ speedup }),
      setWipeOnStart: (wipe) => set({ wipeOnStart: wipe }),

      // Append to console log
      appendConsole: (text: string, _isError = false) => {
        set((state) => {
          const newLines = [...state.consoleLines];
          const lines = text.split('\n');

          for (const line of lines) {
            if (line || lines.length === 1) {
              newLines.push(line);
            }
          }

          // Trim to max lines
          while (newLines.length > state.maxConsoleLines) {
            newLines.shift();
          }

          return { consoleLines: newLines };
        });
      },

      clearConsole: () => {
        set({ consoleLines: [] });
      },

      // Check if platform supports PX4 SITL
      checkPlatform: async () => {
        try {
          const result = await window.electronAPI.px4SitlCheckPlatform();
          set({
            platform: {
              supported: result.supported,
              needsJava: result.needsJava,
              error: result.error,
            },
          });
        } catch {
          // Assume supported if the probe itself fails.
          set({ platform: { supported: true, needsJava: false } });
        }
      },

      // Check if the bundle for the current track exists
      checkBinary: async () => {
        const { releaseTrack } = get();
        try {
          const info = await window.electronAPI.px4SitlCheckBinary(releaseTrack);
          set({ binaryInfo: info });
        } catch {
          set({ binaryInfo: null });
        }
      },

      // Download the bundle for the current track
      download: async () => {
        const { releaseTrack, appendConsole } = get();

        set({ isDownloading: true, lastError: null });
        appendConsole(`\n--- Downloading PX4 SITL bundle (${releaseTrack}) ---\n`);

        try {
          const result = await window.electronAPI.px4SitlDownload(releaseTrack);

          if (result.success) {
            set({ isDownloading: false });
            appendConsole(`Downloaded to: ${result.path}\n`);
            await get().checkBinary();
            return true;
          }
          set({ isDownloading: false, lastError: result.error ?? t('stores:px4SitlStore.downloadFailed') });
          appendConsole(`Download failed: ${result.error}\n`, true);
          return false;
        } catch (error) {
          const message = error instanceof Error ? error.message : t('common:unknownError');
          set({ isDownloading: false, lastError: message });
          appendConsole(`Download error: ${message}\n`, true);
          return false;
        }
      },

      // Start SITL
      start: async () => {
        const {
          isRunning,
          isStarting,
          vehicleType,
          releaseTrack,
          simulator,
          homeLocation,
          speedup,
          wipeOnStart,
          appendConsole,
        } = get();

        if (isRunning || isStarting) {
          return false;
        }

        set({ isStarting: true, lastError: null });
        appendConsole(`\n--- Starting PX4 SITL (${vehicleType}) ---\n`);

        try {
          const config: Px4SitlConfig = {
            vehicleType,
            releaseTrack,
            homeLocation,
            speedup,
            wipeOnStart,
            simulator,
          };

          const result = await window.electronAPI.px4SitlStart(config);

          if (result.success) {
            // Auto-uncheck "Wipe params" after a successful start so restarts
            // don't wipe again.
            set({ isRunning: true, isStarting: false, wipeOnStart: false });
            if (result.command) {
              appendConsole(`Command: ${result.command}`);
            }
            return true;
          }
          set({ isStarting: false, lastError: result.error ?? t('stores:px4SitlStore.startFailed') });
          appendConsole(`Error: ${result.error}\n`, true);
          return false;
        } catch (error) {
          const message = error instanceof Error ? error.message : t('common:unknownError');
          set({ isStarting: false, lastError: message });
          appendConsole(`Error: ${message}\n`, true);
          return false;
        }
      },

      // Stop SITL
      stop: async () => {
        const { isRunning, isStopping, appendConsole } = get();

        if (!isRunning || isStopping) {
          return false;
        }

        set({ isStopping: true });
        appendConsole('\n--- Stopping PX4 SITL ---\n');

        try {
          await window.electronAPI.px4SitlStop();
          set({ isRunning: false, isStopping: false, pid: null });
          appendConsole('SITL stopped.\n');
          // The SITL link is UDP, which never "closes": killing px4 leaves the
          // app connected to silence (TCP-based ArduPilot SITL disconnects for
          // free when its socket dies). If the active connection is a PX4,
          // it can only be this SITL, so drop the link explicitly.
          try {
            const { useConnectionStore } = await import('./connection-store');
            const conn = useConnectionStore.getState();
            if (conn.connectionState.isConnected && conn.connectionState.firmware === 'px4') {
              appendConsole(`${t('stores:px4SitlStore.disconnecting')}\n`);
              await conn.disconnect();
            }
          } catch { /* disconnect is best-effort; the stop itself succeeded */ }
          return true;
        } catch (error) {
          const message = error instanceof Error ? error.message : t('common:unknownError');
          set({ isStopping: false, lastError: message });
          appendConsole(`Error stopping: ${message}\n`, true);
          return false;
        }
      },

      // Check SITL status (on mount)
      checkStatus: async () => {
        try {
          const status: Px4SitlStatus = await window.electronAPI.px4SitlGetStatus();
          set({ isRunning: status.isRunning, pid: status.pid ?? null });
        } catch {
          // Ignore errors
        }
      },

      // Initialize IPC listeners
      subscribeToEvents: () => {
        const { appendConsole, checkPlatform, checkBinary } = get();

        // Probe platform + binary on init
        checkPlatform();
        checkBinary();

        // Listen for stdout
        const unsubStdout = window.electronAPI.onPx4SitlStdout((line: string) => {
          appendConsole(line);
        });

        // Listen for stderr
        const unsubStderr = window.electronAPI.onPx4SitlStderr((line: string) => {
          appendConsole(line, true);
        });

        // Listen for process errors
        const unsubError = window.electronAPI.onPx4SitlError((error: string) => {
          set({ lastError: error, isRunning: false, isStarting: false });
          appendConsole(`Process error: ${error}\n`, true);
        });

        // Listen for exit
        const unsubExit = window.electronAPI.onPx4SitlExit((data: Px4SitlExitData) => {
          // Half of a deliberate relaunch: a PX4_SITL_STARTED (or _ERROR)
          // follows, so don't report it as stopped here.
          if (data.relaunching) {
            appendConsole('\nSITL is restarting...\n');
            return;
          }
          set({ isRunning: false, isStarting: false, isStopping: false, pid: null });
          if (data.code !== null) {
            appendConsole(`\nSITL exited with code ${data.code}\n`);
          } else if (data.signal) {
            appendConsole(`\nSITL killed by signal ${data.signal}\n`);
          }
        });

        // Authoritative "this is what SITL is running with" push, sent by main
        // on every successful spawn. homeLocation is persisted, so this keeps
        // the store in step with a relaunch main did on its own behalf.
        const unsubStarted = window.electronAPI.onPx4SitlStarted((data: Px4SitlStartedData) => {
          set({
            isRunning: true,
            isStarting: false,
            isStopping: false,
            lastError: null,
            homeLocation: data.homeLocation,
            vehicleType: data.vehicleType,
            releaseTrack: data.releaseTrack,
            pid: data.pid ?? null,
          });
          if (data.wasRelaunch) {
            const { lat, lng, alt, heading } = data.homeLocation;
            appendConsole(`SITL is back up, taking off from ${lat}, ${lng} (alt ${alt} m, heading ${heading} deg).\n`);
          }
        });

        // Listen for download progress
        const unsubProgress = window.electronAPI.onPx4SitlDownloadProgress((progress: Px4SitlDownloadProgress) => {
          set({ downloadProgress: progress });
          if (progress.status === 'complete') {
            set({ isDownloading: false });
            checkBinary();
          } else if (progress.status === 'error') {
            set({ isDownloading: false, lastError: progress.error ?? t('stores:px4SitlStore.downloadFailed') });
          }
        });

        return () => {
          unsubStdout();
          unsubStderr();
          unsubError();
          unsubExit();
          unsubStarted();
          unsubProgress();
        };
      },

      // Alias kept to mirror the naming used elsewhere in the app.
      initEventListeners: () => get().subscribeToEvents(),

      // Reset store
      reset: () => {
        set({
          isRunning: false,
          pid: null,
          isStarting: false,
          isStopping: false,
          isDownloading: false,
          downloadProgress: null,
          consoleLines: [],
          lastError: null,
        });
      },
    }),
    {
      name: 'px4-sitl-storage',
      // Persist configuration only
      partialize: (state) => ({
        vehicleType: state.vehicleType,
        releaseTrack: state.releaseTrack,
        simulator: state.simulator,
        homeLocation: state.homeLocation,
        speedup: state.speedup,
        wipeOnStart: state.wipeOnStart,
      }),
    }
  )
);
