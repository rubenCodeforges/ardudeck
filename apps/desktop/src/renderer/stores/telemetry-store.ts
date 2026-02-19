import { create } from 'zustand';
import type { TelemetryState, AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState, RcChannelsData } from '../../shared/telemetry-types';

/** Batch telemetry update - all fields optional */
export interface TelemetryBatch {
  attitude?: AttitudeData;
  position?: PositionData;
  gps?: GpsData;
  battery?: BatteryData;
  vfrHud?: VfrHudData;
  flight?: FlightState;
  rcChannels?: RcChannelsData;
}

interface TelemetryStore extends TelemetryState {
  updateAttitude: (data: AttitudeData) => void;
  updatePosition: (data: PositionData) => void;
  updateGps: (data: GpsData) => void;
  updateBattery: (data: BatteryData) => void;
  updateVfrHud: (data: VfrHudData) => void;
  updateFlight: (data: FlightState) => void;
  /** Batch update - updates multiple telemetry fields in a single store mutation */
  updateBatch: (batch: TelemetryBatch) => void;
  reset: () => void;
}

const initialState: TelemetryState = {
  lastHeartbeat: 0,
  lastAttitude: 0,
  lastPosition: 0,
  lastGps: 0,
  lastBattery: 0,
  lastVfrHud: 0,
  lastRcChannels: 0,

  attitude: { roll: 0, pitch: 0, yaw: 0, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0 },
  position: { lat: 0, lon: 0, alt: 0, relativeAlt: 0, vx: 0, vy: 0, vz: 0 },
  gps: { fixType: 0, satellites: 0, hdop: 99, lat: 0, lon: 0, alt: 0 },
  battery: { voltage: 0, current: 0, remaining: 0 },
  vfrHud: { airspeed: 0, groundspeed: 0, heading: 0, throttle: 0, alt: 0, climb: 0 },
  flight: { mode: 'Unknown', modeNum: 0, armed: false, isFlying: false },
  rcChannels: { channels: [], chancount: 0, rssi: 0 },
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  ...initialState,

  updateAttitude: (data) => set({ attitude: data, lastAttitude: Date.now() }),
  updatePosition: (data) => set({ position: data, lastPosition: Date.now() }),
  updateGps: (data) => set({ gps: data, lastGps: Date.now() }),
  updateBattery: (data) => set({ battery: data, lastBattery: Date.now() }),
  updateVfrHud: (data) => set({ vfrHud: data, lastVfrHud: Date.now() }),
  updateFlight: (data) => set({ flight: data, lastHeartbeat: Date.now() }),

  // Batch update - updates all provided fields in a single store mutation
  // This reduces re-renders from 6 per telemetry cycle to 1
  updateBatch: (batch) => {
    const now = Date.now();
    const updates: Partial<TelemetryState> = {};

    if (batch.attitude) {
      updates.attitude = batch.attitude;
      updates.lastAttitude = now;
    }
    if (batch.position) {
      updates.position = batch.position;
      updates.lastPosition = now;
    }
    if (batch.gps) {
      updates.gps = batch.gps;
      updates.lastGps = now;
    }
    if (batch.battery) {
      updates.battery = batch.battery;
      updates.lastBattery = now;
    }
    if (batch.vfrHud) {
      updates.vfrHud = batch.vfrHud;
      updates.lastVfrHud = now;
    }
    if (batch.flight) {
      updates.flight = batch.flight;
      updates.lastHeartbeat = now;
    }
    if (batch.rcChannels) {
      updates.rcChannels = batch.rcChannels;
      updates.lastRcChannels = now;
    }

    set(updates);
  },

  reset: () => set(initialState),
}));
