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
  ArduPilotFrameCatalog,
  ArduPilotFrameInfo,
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
  /** Simulated battery resting voltage (V). 0 = use firmware default (12.6V) */
  simBattVoltage: number;
  /** Simulated battery capacity (Ah). 0 = unlimited / firmware default */
  simBattCapAh: number;
  /** Absolute path to user-authored physics frame JSON. undefined = built-in. */
  customFramePath?: string;
  /** Motor count of active custom frame. Drives SITL --model type prefix. */
  customFrameMotors?: number;
  /** Setter (single call to preserve atomicity of the pair). */
  setCustomFrame: (path: string | undefined, motors: number | undefined) => void;

  // ArduDeck in-app simulator (Phase 5 turnkey UX). When enabled, SITL launches
  // against our own 6DOF physics (sim-engine) instead of its built-in FDM. The
  // fidelity flags below shape that physics; they're forwarded at SITL-start
  // time only (the start path already relays config to the engine).
  /** Use ArduDeck's in-app simulator as SITL's external FDM. */
  useArduDeckSim: boolean;
  /** Wind intensity 0..1 (0 = calm). */
  simWindIntensity: number;
  /** Inject realistic IMU/GPS sensor noise. */
  simSensorNoise: boolean;
  /** Model battery voltage sag under load. */
  simBatterySag: boolean;
  setUseArduDeckSim: (on: boolean) => void;
  setSimWindIntensity: (v: number) => void;
  setSimSensorNoise: (on: boolean) => void;
  setSimBatterySag: (on: boolean) => void;

  // RC State
  isRcSending: boolean;
  rcState: VirtualRCState;

  // FlightGear viewer. ArduPilot SITL streams FGNetFDM to 127.0.0.1:5503
  // (always-on, see main/sitl); FlightGear attaches as a pure external-FDM
  // viewer so the user can watch the SITL-flown mission in a 3D world. This is
  // ArduPilot's native path — no protocol bridge, no X-Plane.
  /** null = not yet probed; true/false = FlightGear install detected or not. */
  flightGearInstalled: boolean | null;
  flightGearRunning: boolean;
  flightGearStarting: boolean;
  flightGearError: string | null;
  /** Visual airframe shell shown in FlightGear (persisted). */
  flightGearAircraft: string;
  /** User-picked FlightGear executable when auto-detect misses it (persisted). */
  flightGearCustomPath?: string;
  detectFlightGear: () => Promise<void>;
  browseFlightGear: () => Promise<void>;
  launchFlightGear: () => Promise<boolean>;
  stopFlightGear: () => Promise<void>;
  setFlightGearAircraft: (aircraft: string) => void;

  // Errors
  lastError: string | null;

  // Frame catalog (fetched from upstream vehicleinfo.py via IPC)
  framesLoading: boolean;
  framesCatalog: ArduPilotFrameCatalog | null;

  // Crash recovery surfaces in two stages:
  //   1. First-strike: stable crashed during init → offer auto-switch to dev.
  //   2. Second-strike: the upgraded track ALSO crashed → not a track issue,
  //      this frame is broken on this platform regardless. Offer to switch
  //      to a known-good alternative frame for the same vehicle type.
  // We never silently swallow an early crash, even after auto-upgrade.
  crashRecovery:
    | {
        kind: 'switch-track';
        vehicleType: ArduPilotVehicleType;
        model: string;
        failedTrack: ArduPilotReleaseTrack;
        suggestedTrack: ArduPilotReleaseTrack;
        uptimeMs: number;
        signal: string | null;
      }
    | {
        kind: 'switch-frame';
        vehicleType: ArduPilotVehicleType;
        failedModel: string;
        failedTrack: ArduPilotReleaseTrack;
        suggestedModel: string;
        uptimeMs: number;
        signal: string | null;
      }
    | null;
  /** Frames we've already auto-upgraded so we don't loop on repeat failures. */
  autoUpgradedFrames: Record<string, ArduPilotReleaseTrack>;
  /**
   * Per-frame list of tracks that early-crashed. Lets the recovery flow tell
   * "we haven't tried dev yet" apart from "every track we have crashes" so
   * the banner suggests a track switch only when one might actually help,
   * and falls back to suggesting a different frame once all tracks are
   * exhausted. Persists across sessions.
   * Key: `${vehicleType}:${model}` — value: tracks that have early-crashed.
   */
  crashedFrameTracks: Record<string, ArduPilotReleaseTrack[]>;

  // Actions
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  download: () => Promise<boolean>;
  checkBinary: () => Promise<void>;
  checkPlatform: () => Promise<void>;
  loadFrames: () => Promise<void>;
  refreshFrames: () => Promise<void>;
  /** Accept the suggested track switch + auto-restart SITL with same frame. */
  acceptCrashRecovery: () => Promise<void>;
  /** Dismiss the recovery prompt without acting on it. */
  dismissCrashRecovery: () => void;
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
  alt: 0, // AMSL; 0 grounds SITL to terrain. >0 spawns airborne → planes drift.
  heading: 270,
};

const DEFAULT_RC_STATE: VirtualRCState = {
  roll: 0,
  pitch: 0,
  yaw: 0,
  throttle: -1, // Minimum for safety
  // Ch5-8 default LOW so FLTMODE_CH (default Ch8 on plane, Ch5 on copter) lands
  // in the lowest FLTMODE slot. For plane that's Manual; for copter Stabilize.
  // Prevents boot from snapping into FBWA / Loiter.
  aux1: -1,
  aux2: -1,
  aux3: -1,
  aux4: -1,
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
      simBattVoltage: 0,
      simBattCapAh: 0,
      customFramePath: undefined,
      customFrameMotors: undefined,
      setCustomFrame: (path, motors) => set({ customFramePath: path, customFrameMotors: motors }),
      simAddress: '127.0.0.1',

      // ArduDeck in-app simulator + fidelity (Phase 5)
      useArduDeckSim: false,
      simWindIntensity: 0,
      simSensorNoise: false,
      simBatterySag: false,
      setUseArduDeckSim: (on) => set({ useArduDeckSim: on }),
      setSimWindIntensity: (v) => set({ simWindIntensity: Math.max(0, Math.min(1, v)) }),
      setSimSensorNoise: (on) => set({ simSensorNoise: on }),
      setSimBatterySag: (on) => set({ simBatterySag: on }),

      isRcSending: false,
      rcState: DEFAULT_RC_STATE,

      flightGearInstalled: null,
      flightGearRunning: false,
      flightGearStarting: false,
      flightGearError: null,
      flightGearAircraft: 'c172p',
      flightGearCustomPath: undefined,

      lastError: null,

      framesLoading: false,
      framesCatalog: null,

      crashRecovery: null,
      autoUpgradedFrames: {},
      crashedFrameTracks: {},

      // Start SITL
      start: async () => {
        const {
          isRunning,
          isStarting,
          vehicleType,
          model,
          homeLocation,
          speedup,
          wipeOnStart,
          simulator,
          simAddress,
          simBattVoltage,
          simBattCapAh,
          customFramePath,
          customFrameMotors,
          useArduDeckSim,
          simWindIntensity,
          simSensorNoise,
          simBatterySag,
          appendOutput,
          autoUpgradedFrames,
          crashedFrameTracks,
        } = get();
        // Honor any persisted auto-upgrade for this (vehicle, frame). If the
        // last run on `stable` early-crashed and the user accepted the
        // upgrade, we silently use `dev` from now on — no crash flow this
        // session.
        const frameKey = `${vehicleType}:${model}`;
        const upgraded = autoUpgradedFrames[frameKey];
        const releaseTrack = upgraded ?? get().releaseTrack;
        if (upgraded && upgraded !== get().releaseTrack) {
          appendOutput(`Using ${upgraded} track for "${model}" (auto-upgraded after a previous crash on ${get().releaseTrack}).\n`);
          set({ releaseTrack: upgraded });
        }

        // Pre-flight: if every track for this frame is already in the
        // crashed-ledger, don't bother launching — surface the second-strike
        // banner immediately so the user sees a frame fallback, not another
        // SIGILL log.
        const ALL_TRACKS_PRE: ArduPilotReleaseTrack[] = ['stable', 'dev'];
        const tried = crashedFrameTracks[frameKey] ?? [];
        if (tried.length > 0 && ALL_TRACKS_PRE.every(t => tried.includes(t))) {
          const safeFallback: Record<ArduPilotVehicleType, string> = {
            copter: 'quad',
            plane:  'plane',
            rover:  'rover',
            sub:    'vectored',
          };
          const suggested = safeFallback[vehicleType];
          if (suggested && suggested !== model) {
            appendOutput(`\n"${model}" has crashed on every available track for this platform — skipping launch.\n`);
            set({
              crashRecovery: {
                kind: 'switch-frame',
                vehicleType,
                failedModel: model,
                failedTrack: releaseTrack,
                suggestedModel: suggested,
                uptimeMs: 0,
                signal: null,
              },
            });
            return false;
          }
        }

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
            simBattVoltage: simBattVoltage > 0 ? simBattVoltage : undefined,
            simBattCapAh: simBattCapAh > 0 ? simBattCapAh : undefined,
            customFramePath,
            customFrameMotors,
            // ArduDeck physics engine: only for copter in v1.
            useArduDeckSim: useArduDeckSim && vehicleType === 'copter',
            simWindIntensity,
            simSensorNoise,
            simBatterySag,
          };

          const result = await window.electronAPI.ardupilotSitlStart(config);

          if (result.success) {
            // Auto-uncheck "Wipe EEPROM" after successful start so restarts/reboots don't wipe again
            set({ isRunning: true, isStarting: false, lastCommand: result.command ?? null, wipeOnStart: false });
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

          // Tear down the FlightGear viewer alongside SITL (no-op if closed).
          if (get().flightGearRunning) {
            await get().stopFlightGear();
          }

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

      // Load the SITL frame catalog from the main process. Cheap when
      // already cached upstream — prefer this over `refreshFrames` for
      // mount-time fetches so users on metered connections aren't hammered.
      loadFrames: async () => {
        if (get().framesLoading) return;
        set({ framesLoading: true });
        try {
          const result = await window.electronAPI.ardupilotSitlListFrames();
          set({ framesCatalog: result, framesLoading: false });
        } catch (err) {
          // Don't surface an error toast — the dropdown will fall back to
          // the small hardcoded list and keep working offline.
          console.warn('[SITL] frames load failed:', err);
          set({ framesLoading: false });
        }
      },

      // Force-refresh from upstream. Used by the Refresh button.
      refreshFrames: async () => {
        if (get().framesLoading) return;
        set({ framesLoading: true });
        try {
          const result = await window.electronAPI.ardupilotSitlRefreshFrames();
          set({ framesCatalog: result, framesLoading: false });
        } catch (err) {
          console.warn('[SITL] frames refresh failed:', err);
          set({ framesLoading: false });
        }
      },

      // Crash recovery dispatcher. Two distinct flows depending on whether
      // we're switching tracks (first strike) or switching frames (second
      // strike — the upgraded track also failed so the frame itself is
      // broken on this platform).
      acceptCrashRecovery: async () => {
        const recovery = get().crashRecovery;
        if (!recovery) return;

        if (recovery.kind === 'switch-track') {
          const frameKey = `${recovery.vehicleType}:${recovery.model}`;
          set({
            releaseTrack: recovery.suggestedTrack,
            autoUpgradedFrames: { ...get().autoUpgradedFrames, [frameKey]: recovery.suggestedTrack },
            crashRecovery: null,
            lastError: null,
          });
          get().appendOutput(
            `\n--- Auto-switching to ${recovery.suggestedTrack} track for "${recovery.model}" (last run on ${recovery.failedTrack} crashed in ${recovery.uptimeMs}ms${recovery.signal ? `, ${recovery.signal}` : ''}) ---\n`,
          );
          const info = await window.electronAPI.ardupilotSitlCheckBinary(recovery.vehicleType, recovery.suggestedTrack);
          set({ binaryInfo: info });
          if (!info.exists) {
            get().appendOutput(`Downloading ${recovery.suggestedTrack} ${recovery.vehicleType}…\n`);
            set({ isDownloading: true });
            await window.electronAPI.ardupilotSitlDownload(recovery.vehicleType, recovery.suggestedTrack);
            const after = await window.electronAPI.ardupilotSitlCheckBinary(recovery.vehicleType, recovery.suggestedTrack);
            set({ binaryInfo: after, isDownloading: false });
            if (!after.exists) {
              set({ lastError: `Failed to download ${recovery.suggestedTrack} binary` });
              return;
            }
          }
          await get().start();
        } else {
          // Second strike — switch to the safe fallback frame instead.
          set({
            model: recovery.suggestedModel,
            crashRecovery: null,
            lastError: null,
          });
          get().appendOutput(
            `\n--- Falling back to "${recovery.suggestedModel}" — "${recovery.failedModel}" crashed on both stable and dev tracks for this platform ---\n`,
          );
          await get().start();
        }
      },

      dismissCrashRecovery: () => {
        set({ crashRecovery: null });
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
        // Explicit user choice overrides any prior auto-upgrade. Without
        // this, clicking "Stable" while a frame had been auto-bumped to
        // "dev" silently snaps back to dev on the next Start — which is
        // exactly the bug that surfaced in production.
        const { vehicleType, model, autoUpgradedFrames } = get();
        const frameKey = `${vehicleType}:${model}`;
        const next = { ...autoUpgradedFrames };
        delete next[frameKey];
        set({ releaseTrack: track, binaryInfo: null, autoUpgradedFrames: next });
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

      // FlightGear viewer actions
      detectFlightGear: async () => {
        try {
          const info = await window.electronAPI.ardupilotFlightGearDetect(get().flightGearCustomPath);
          set({ flightGearInstalled: info.installed });
          // Sync running state in case a viewer is already up (e.g. after a
          // renderer reload while SITL + FlightGear kept running).
          const status = await window.electronAPI.ardupilotFlightGearStatus();
          set({ flightGearRunning: status.running });
        } catch {
          set({ flightGearInstalled: false });
        }
      },

      browseFlightGear: async () => {
        try {
          const result = await window.electronAPI.ardupilotFlightGearBrowse();
          if (result.success && result.path) {
            set({ flightGearCustomPath: result.path, flightGearError: null });
            await get().detectFlightGear();
          }
        } catch (err) {
          set({ flightGearError: err instanceof Error ? err.message : 'Browse failed' });
        }
      },

      launchFlightGear: async () => {
        const { flightGearRunning, flightGearStarting, homeLocation, flightGearAircraft, flightGearCustomPath, appendOutput } = get();
        if (flightGearRunning || flightGearStarting) return false;

        set({ flightGearStarting: true, flightGearError: null });
        appendOutput('\n--- Opening FlightGear viewer ---\n');
        try {
          const result = await window.electronAPI.ardupilotFlightGearLaunch(
            {
              // `ufo` is FlightGear's invisible camera object; coerce any stale
              // persisted value to a visible airframe so the vehicle actually shows.
              aircraft: (flightGearAircraft && flightGearAircraft !== 'ufo') ? flightGearAircraft : 'c172p',
              lat: homeLocation.lat,
              lon: homeLocation.lng,
              // home.alt is AMSL metres; FlightGear --altitude wants feet.
              altitudeFt: Math.round(homeLocation.alt * 3.28084),
              headingDeg: homeLocation.heading,
            },
            flightGearCustomPath,
          );
          if (result.success) {
            set({ flightGearRunning: true, flightGearStarting: false });
            appendOutput('FlightGear launched — it will show the SITL vehicle once scenery finishes loading.\n');
            return true;
          }
          set({ flightGearStarting: false, flightGearError: result.error ?? 'Failed to launch FlightGear' });
          appendOutput(`FlightGear error: ${result.error}\n`, true);
          return false;
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Unknown error';
          set({ flightGearStarting: false, flightGearError: message });
          appendOutput(`FlightGear error: ${message}\n`, true);
          return false;
        }
      },

      stopFlightGear: async () => {
        try {
          await window.electronAPI.ardupilotFlightGearStop();
        } catch {
          // best-effort
        }
        set({ flightGearRunning: false, flightGearStarting: false });
      },

      setFlightGearAircraft: (aircraft) => set({ flightGearAircraft: aircraft }),

      // Initialize IPC listeners
      initListeners: () => {
        const { appendOutput, checkBinary, checkPlatform } = get();

        // Check platform and binary on init
        checkPlatform();
        checkBinary();
        // Probe FlightGear so the viewer button can show install state.
        void get().detectFlightGear();

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
          // FlightGear is driven purely by SITL's FGNetFDM stream; once SITL is
          // gone the viewer just freezes, so close it too.
          if (get().flightGearRunning) {
            void get().stopFlightGear();
          }
          if (data.code !== null) {
            appendOutput(`\nSITL exited with code ${data.code}\n`);
          } else if (data.signal) {
            appendOutput(`\nSITL killed by signal ${data.signal}\n`);
          }
          // Early-crash recovery — record the (frame, track) crash, then
          // decide what to suggest based on the per-frame ledger:
          //  • untried track exists  → 'switch-track' banner, offer it
          //  • all tracks exhausted  → 'switch-frame' banner, offer the
          //    safe-default frame for this vehicle (frame is genuinely
          //    broken on this platform — likely upstream physics bug).
          if (
            data.wasEarlyCrash &&
            data.vehicleType !== undefined &&
            data.model !== undefined &&
            data.releaseTrack !== undefined
          ) {
            const frameKey = `${data.vehicleType}:${data.model}`;
            const prior = get().crashedFrameTracks[frameKey] ?? [];
            const tracks = prior.includes(data.releaseTrack)
              ? prior
              : [...prior, data.releaseTrack];
            set({
              crashedFrameTracks: { ...get().crashedFrameTracks, [frameKey]: tracks },
            });

            const ALL_TRACKS: ArduPilotReleaseTrack[] = ['stable', 'dev'];
            const untried = ALL_TRACKS.find(t => !tracks.includes(t));

            if (untried) {
              set({
                crashRecovery: {
                  kind: 'switch-track',
                  vehicleType: data.vehicleType,
                  model: data.model,
                  failedTrack: data.releaseTrack,
                  suggestedTrack: untried,
                  uptimeMs: data.uptimeMs ?? 0,
                  signal: data.signal,
                },
              });
            } else {
              const safeFallback: Record<typeof data.vehicleType, string> = {
                copter: 'quad',
                plane:  'plane',
                rover:  'rover',
                sub:    'vectored',
              };
              const suggested = safeFallback[data.vehicleType];
              if (suggested && suggested !== data.model) {
                set({
                  crashRecovery: {
                    kind: 'switch-frame',
                    vehicleType: data.vehicleType,
                    failedModel: data.model,
                    failedTrack: data.releaseTrack,
                    suggestedModel: suggested,
                    uptimeMs: data.uptimeMs ?? 0,
                    signal: data.signal,
                  },
                });
              }
            }
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
        // Sim battery overrides (so user-tuned battery profiles survive restart).
        simBattVoltage: state.simBattVoltage,
        simBattCapAh: state.simBattCapAh,
        // Active custom frame selection. The frame definitions themselves live
        // on disk under userData/sitl-frames/; we only persist the path/motors
        // pair so the next launch knows which one to stage.
        customFramePath: state.customFramePath,
        customFrameMotors: state.customFrameMotors,
        // ArduDeck in-app sim selection + fidelity preferences.
        useArduDeckSim: state.useArduDeckSim,
        simWindIntensity: state.simWindIntensity,
        simSensorNoise: state.simSensorNoise,
        simBatterySag: state.simBatterySag,
        // Remember auto-upgrades so a frame that crashes on stable goes
        // straight to dev on subsequent runs without the user seeing it.
        autoUpgradedFrames: state.autoUpgradedFrames,
        // Persist the per-frame crash ledger too — without it, restarting
        // the app would re-offer a track we already know crashes for the
        // selected frame.
        crashedFrameTracks: state.crashedFrameTracks,
        // FlightGear viewer preferences.
        flightGearAircraft: state.flightGearAircraft,
        flightGearCustomPath: state.flightGearCustomPath,
      }),
    }
  )
);
