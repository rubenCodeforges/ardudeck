/**
 * MSP Telemetry Store
 *
 * Zustand store for Betaflight/iNav/Cleanflight telemetry data.
 * Receives updates from main process via IPC.
 */

import { create } from 'zustand';
import type { MSPConnectionState, MSPTelemetryData } from '../../shared/ipc-channels';

// ============================================================================
// State Interfaces
// ============================================================================

interface MSPTelemetryState {
  // Connection
  connection: MSPConnectionState;

  // Telemetry data
  attitude: {
    roll: number;
    pitch: number;
    yaw: number;
  };
  altitude: {
    altitude: number;
    vario: number;
  };
  analog: {
    voltage: number;
    mAhDrawn: number;
    rssi: number;
    current: number;
  };
  status: {
    cycleTime: number;
    cpuLoad: number;
    armingFlags: number;
    flightModeFlags: number;
    isArmed: boolean;
  };
  rc: {
    channels: number[];
  };
  motors: {
    values: number[];
  };
  gps: {
    fixType: number;
    satellites: number;
    lat: number;
    lon: number;
    alt: number;
    speed: number;
    heading: number;
  };

  // Timestamps
  lastUpdate: number;
  lastConnectionUpdate: number;
}

interface MSPTelemetryActions {
  updateConnection: (state: MSPConnectionState) => void;
  updateTelemetry: (data: MSPTelemetryData) => void;
  reset: () => void;
}

type MSPTelemetryStore = MSPTelemetryState & MSPTelemetryActions;

// ============================================================================
// Initial State
// ============================================================================

const initialConnection: MSPConnectionState = {
  isConnected: false,
  port: '',
  baudRate: 115200,
  fcVariant: '',
  fcVersion: '',
  boardId: '',
  apiVersion: '',
};

const initialState: MSPTelemetryState = {
  connection: initialConnection,

  attitude: { roll: 0, pitch: 0, yaw: 0 },
  altitude: { altitude: 0, vario: 0 },
  analog: { voltage: 0, mAhDrawn: 0, rssi: 0, current: 0 },
  status: {
    cycleTime: 0,
    cpuLoad: 0,
    armingFlags: 0,
    flightModeFlags: 0,
    isArmed: false,
  },
  rc: { channels: [1500, 1500, 1000, 1500, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000, 1000] },
  motors: { values: [0, 0, 0, 0, 0, 0, 0, 0] },
  gps: {
    fixType: 0,
    satellites: 0,
    lat: 0,
    lon: 0,
    alt: 0,
    speed: 0,
    heading: 0,
  },

  lastUpdate: 0,
  lastConnectionUpdate: 0,
};

// ============================================================================
// Store
// ============================================================================

export const useMspTelemetryStore = create<MSPTelemetryStore>((set) => ({
  ...initialState,

  updateConnection: (state) =>
    set({
      connection: state,
      lastConnectionUpdate: Date.now(),
    }),

  updateTelemetry: (data) =>
    set((prev) => ({
      attitude: data.attitude ?? prev.attitude,
      altitude: data.altitude ?? prev.altitude,
      analog: data.analog ?? prev.analog,
      status: data.status ?? prev.status,
      rc: data.rc ?? prev.rc,
      motors: data.motors ?? prev.motors,
      gps: data.gps ?? prev.gps,
      lastUpdate: data.timestamp,
    })),

  reset: () => set(initialState),
}));

// ============================================================================
// Selectors (for optimized re-renders)
// ============================================================================

export const selectMspConnection = (state: MSPTelemetryStore) => state.connection;
export const selectMspAttitude = (state: MSPTelemetryStore) => state.attitude;
export const selectMspAltitude = (state: MSPTelemetryStore) => state.altitude;
export const selectMspAnalog = (state: MSPTelemetryStore) => state.analog;
export const selectMspStatus = (state: MSPTelemetryStore) => state.status;
export const selectMspRc = (state: MSPTelemetryStore) => state.rc;
export const selectMspMotors = (state: MSPTelemetryStore) => state.motors;
export const selectMspGps = (state: MSPTelemetryStore) => state.gps;
export const selectMspIsArmed = (state: MSPTelemetryStore) => state.status.isArmed;

// ============================================================================
// Helper: Setup IPC Listeners
// ============================================================================

let listenersSetup = false;

/**
 * Setup IPC listeners for MSP telemetry updates.
 * Call this once when the app starts.
 */
export function setupMspTelemetryListeners(): () => void {
  if (listenersSetup) {
    return () => {};
  }

  listenersSetup = true;
  const store = useMspTelemetryStore.getState();

  // Connection state listener
  const removeConnectionListener = window.electronAPI.onMspConnectionState((state) => {
    useMspTelemetryStore.getState().updateConnection(state);
  });

  // Telemetry update listener
  const removeTelemetryListener = window.electronAPI.onMspTelemetryUpdate((data) => {
    useMspTelemetryStore.getState().updateTelemetry(data);
  });

  // Return cleanup function
  return () => {
    removeConnectionListener();
    removeTelemetryListener();
    listenersSetup = false;
  };
}
