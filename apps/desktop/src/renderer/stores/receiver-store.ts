/**
 * Receiver Store
 *
 * Manages RC channel state, signal diagnostics, serial port config,
 * channel mapping, and deadband. Used by Receiver tab, Ports tab,
 * Quick Setup, and Receiver Wizard.
 */

import { create } from 'zustand';

// =============================================================================
// Types
// =============================================================================

export interface SerialPort {
  identifier: number;
  functionMask: number;
  mspBaudrate: number;
  sensorsBaudrate: number;
  telemetryBaudrate: number;
  peripheralsBaudrate: number;
}

export interface SerialConfig {
  ports: SerialPort[];
}

export type SignalStatus = 'none' | 'stale' | 'active';

interface ReceiverState {
  // Live RC channels
  channels: number[];
  lastRcUpdate: number;
  isPolling: boolean;
  pollInterval: ReturnType<typeof setInterval> | null;
  signalStatus: SignalStatus;

  // Channel mapping (MSP_RX_MAP)
  rxMap: number[];
  rxMapOriginal: number[];

  // RC Deadband
  deadband: number;
  yawDeadband: number;
  altHoldDeadband: number;
  deadbandThrottle: number;
  originalDeadband: number;
  originalYawDeadband: number;
  originalAltHoldDeadband: number;
  originalDeadbandThrottle: number;

  // Serial port config (MSP only)
  serialConfig: SerialConfig | null;
  originalSerialConfig: SerialConfig | null;

  // Loading state
  isLoading: boolean;
  isSaving: boolean;
  configLoaded: boolean;

  // Actions
  startPolling: () => void;
  stopPolling: () => void;
  loadConfig: () => Promise<void>;
  saveConfig: () => Promise<boolean>;
  hasChanges: () => boolean;
  reset: () => void;

  // Mutators
  setRxMap: (map: number[]) => void;
  setDeadband: (value: number) => void;
  setYawDeadband: (value: number) => void;
  setAltHoldDeadband: (value: number) => void;
  setDeadbandThrottle: (value: number) => void;
  setSerialConfig: (config: SerialConfig) => void;
  updatePortFunction: (identifier: number, functionMask: number) => void;
  updatePortBaudrate: (identifier: number, category: 'msp' | 'sensors' | 'telemetry' | 'peripherals', baudIndex: number) => void;
}

// =============================================================================
// Signal Detection
// =============================================================================

function detectSignalStatus(
  channels: number[],
  lastUpdate: number,
): SignalStatus {
  const now = Date.now();

  // No update in 500ms = stale
  if (lastUpdate > 0 && now - lastUpdate > 500) return 'stale';

  // All zeros or no data
  if (channels.length === 0) return 'none';

  // All channels at same value for extended time = no signal
  const firstVal = channels[0]!;
  const allSame = channels.every((ch) => ch === firstVal);
  if (allSame && (firstVal === 0 || firstVal === 1500)) return 'none';

  // Check if any channel is varying (not all static)
  return 'active';
}

// =============================================================================
// Store
// =============================================================================

export const useReceiverStore = create<ReceiverState>((set, get) => ({
  // Initial state
  channels: Array(16).fill(1500) as number[],
  lastRcUpdate: 0,
  isPolling: false,
  pollInterval: null,
  signalStatus: 'none',

  rxMap: [0, 1, 2, 3],
  rxMapOriginal: [0, 1, 2, 3],

  deadband: 0,
  yawDeadband: 0,
  altHoldDeadband: 0,
  deadbandThrottle: 0,
  originalDeadband: 0,
  originalYawDeadband: 0,
  originalAltHoldDeadband: 0,
  originalDeadbandThrottle: 0,

  serialConfig: null,
  originalSerialConfig: null,

  isLoading: false,
  isSaving: false,
  configLoaded: false,

  // ============================================================================
  // RC Polling
  // ============================================================================

  startPolling: () => {
    const { isPolling, pollInterval } = get();
    if (isPolling || pollInterval) return;

    let pending = false;
    let loggedOnce = false;

    const interval = setInterval(async () => {
      if (pending) return;
      pending = true;
      try {
        const result = await window.electronAPI?.mspGetRc();
        if (result?.channels) {
          if (!loggedOnce) {
            console.log(`[ReceiverStore] MSP_RC: ${result.channels.length} channels:`, result.channels.join(','));
            loggedOnce = true;
          }
          const now = Date.now();
          const status = detectSignalStatus(result.channels, now);
          set({
            channels: result.channels,
            lastRcUpdate: now,
            signalStatus: status,
          });
        }
      } catch {
        // Silently ignore polling errors
      } finally {
        pending = false;
      }
    }, 100); // 10Hz

    set({ isPolling: true, pollInterval: interval });
  },

  stopPolling: () => {
    const { pollInterval } = get();
    if (pollInterval) {
      clearInterval(pollInterval);
      set({ isPolling: false, pollInterval: null });
    }
  },

  // ============================================================================
  // Load Config
  // ============================================================================

  loadConfig: async () => {
    set({ isLoading: true });

    try {
      // Load serial config
      const serialConfig = await window.electronAPI?.mspGetSerialConfig();
      if (serialConfig) {
        const deepCopy: SerialConfig = {
          ports: serialConfig.ports.map((p) => ({ ...p })),
        };
        set({
          serialConfig: deepCopy,
          originalSerialConfig: {
            ports: serialConfig.ports.map((p) => ({ ...p })),
          },
        });
      }

      // Load RX map
      const rxMap = await window.electronAPI?.mspGetRxMap();
      console.log('[ReceiverStore] RX map from FC:', rxMap);
      if (rxMap) {
        set({ rxMap: [...rxMap], rxMapOriginal: [...rxMap] });
      }

      // Load RC deadband
      const deadband = await window.electronAPI?.mspGetRcDeadband();
      console.log('[ReceiverStore] RC deadband from FC:', deadband);
      if (deadband) {
        set({
          deadband: deadband.deadband,
          yawDeadband: deadband.yawDeadband,
          altHoldDeadband: deadband.altHoldDeadband,
          deadbandThrottle: deadband.deadbandThrottle,
          originalDeadband: deadband.deadband,
          originalYawDeadband: deadband.yawDeadband,
          originalAltHoldDeadband: deadband.altHoldDeadband,
          originalDeadbandThrottle: deadband.deadbandThrottle,
        });
      } else {
        console.warn('[ReceiverStore] RC deadband fetch returned null — FC may not support MSP_RC_DEADBAND or transport closed');
      }
      set({ configLoaded: true });
    } catch (error) {
      console.error('[ReceiverStore] loadConfig failed:', error);
    } finally {
      set({ isLoading: false });
    }
  },

  // ============================================================================
  // Save Config
  // ============================================================================

  saveConfig: async () => {
    set({ isSaving: true });
    let success = true;

    try {
      const state = get();

      // Save serial config if changed
      if (state.serialConfig && state.originalSerialConfig) {
        const serialChanged = JSON.stringify(state.serialConfig) !== JSON.stringify(state.originalSerialConfig);
        if (serialChanged) {
          const result = await window.electronAPI?.mspSetSerialConfig(state.serialConfig);
          if (!result) success = false;
        }
      }

      // Save RX map if changed
      const rxMapChanged = JSON.stringify(state.rxMap) !== JSON.stringify(state.rxMapOriginal);
      if (rxMapChanged) {
        const result = await window.electronAPI?.mspSetRxMap(state.rxMap);
        if (!result) success = false;
      }

      // Save deadband if changed
      const deadbandChanged =
        state.deadband !== state.originalDeadband ||
        state.yawDeadband !== state.originalYawDeadband ||
        state.altHoldDeadband !== state.originalAltHoldDeadband ||
        state.deadbandThrottle !== state.originalDeadbandThrottle;

      if (deadbandChanged) {
        const result = await window.electronAPI?.mspSetRcDeadband({
          deadband: state.deadband,
          yawDeadband: state.yawDeadband,
          altHoldDeadband: state.altHoldDeadband,
          deadbandThrottle: state.deadbandThrottle,
        });
        if (!result) success = false;
      }

      // Update originals on success
      if (success) {
        set({
          rxMapOriginal: [...state.rxMap],
          originalDeadband: state.deadband,
          originalYawDeadband: state.yawDeadband,
          originalAltHoldDeadband: state.altHoldDeadband,
          originalDeadbandThrottle: state.deadbandThrottle,
          originalSerialConfig: state.serialConfig
            ? { ports: state.serialConfig.ports.map((p) => ({ ...p })) }
            : null,
        });
      }

      return success;
    } catch (error) {
      console.error('[ReceiverStore] saveConfig failed:', error);
      return false;
    } finally {
      set({ isSaving: false });
    }
  },

  // ============================================================================
  // Change Detection
  // ============================================================================

  hasChanges: () => {
    const state = get();
    if (JSON.stringify(state.rxMap) !== JSON.stringify(state.rxMapOriginal)) return true;
    if (state.deadband !== state.originalDeadband) return true;
    if (state.yawDeadband !== state.originalYawDeadband) return true;
    if (state.altHoldDeadband !== state.originalAltHoldDeadband) return true;
    if (state.deadbandThrottle !== state.originalDeadbandThrottle) return true;
    if (state.serialConfig && state.originalSerialConfig) {
      if (JSON.stringify(state.serialConfig) !== JSON.stringify(state.originalSerialConfig)) return true;
    }
    return false;
  },

  // ============================================================================
  // Mutators
  // ============================================================================

  setRxMap: (map) => set({ rxMap: map }),
  setDeadband: (value) => set({ deadband: value }),
  setYawDeadband: (value) => set({ yawDeadband: value }),
  setAltHoldDeadband: (value) => set({ altHoldDeadband: value }),
  setDeadbandThrottle: (value) => set({ deadbandThrottle: value }),
  setSerialConfig: (config) => set({ serialConfig: config }),

  updatePortFunction: (identifier, functionMask) => {
    const { serialConfig } = get();
    if (!serialConfig) return;

    const ports = serialConfig.ports.map((p) =>
      p.identifier === identifier ? { ...p, functionMask } : { ...p },
    );
    set({ serialConfig: { ports } });
  },

  updatePortBaudrate: (identifier, category, baudIndex) => {
    const { serialConfig } = get();
    if (!serialConfig) return;

    const key =
      category === 'msp' ? 'mspBaudrate' :
      category === 'sensors' ? 'sensorsBaudrate' :
      category === 'telemetry' ? 'telemetryBaudrate' :
      'peripheralsBaudrate';

    const ports = serialConfig.ports.map((p) =>
      p.identifier === identifier ? { ...p, [key]: baudIndex } : { ...p },
    );
    set({ serialConfig: { ports } });
  },

  reset: () => {
    const { pollInterval } = get();
    if (pollInterval) clearInterval(pollInterval);

    set({
      channels: Array(16).fill(1500) as number[],
      lastRcUpdate: 0,
      isPolling: false,
      pollInterval: null,
      signalStatus: 'none',
      rxMap: [0, 1, 2, 3, 4, 5, 6, 7],
      rxMapOriginal: [0, 1, 2, 3, 4, 5, 6, 7],
      deadband: 5,
      yawDeadband: 5,
      altHoldDeadband: 40,
      deadbandThrottle: 50,
      originalDeadband: 5,
      originalYawDeadband: 5,
      originalAltHoldDeadband: 40,
      originalDeadbandThrottle: 50,
      serialConfig: null,
      originalSerialConfig: null,
      isLoading: false,
      isSaving: false,
      configLoaded: false,
    });
  },
}));
