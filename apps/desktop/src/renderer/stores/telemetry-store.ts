import { create } from 'zustand';
import type { TelemetryState, AttitudeData, PositionData, GpsData, BatteryData, VfrHudData, FlightState } from '../../shared/telemetry-types';

interface TelemetryStore extends TelemetryState {
  updateAttitude: (data: AttitudeData) => void;
  updatePosition: (data: PositionData) => void;
  updateGps: (data: GpsData) => void;
  updateBattery: (data: BatteryData) => void;
  updateVfrHud: (data: VfrHudData) => void;
  updateFlight: (data: FlightState) => void;
  reset: () => void;
}

const initialState: TelemetryState = {
  lastHeartbeat: 0,
  lastAttitude: 0,
  lastPosition: 0,
  lastGps: 0,
  lastBattery: 0,
  lastVfrHud: 0,

  attitude: { roll: 0, pitch: 0, yaw: 0, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0 },
  position: { lat: 0, lon: 0, alt: 0, relativeAlt: 0, vx: 0, vy: 0, vz: 0 },
  gps: { fixType: 0, satellites: 0, hdop: 99, lat: 0, lon: 0, alt: 0 },
  battery: { voltage: 0, current: 0, remaining: 0 },
  vfrHud: { airspeed: 0, groundspeed: 0, heading: 0, throttle: 0, alt: 0, climb: 0 },
  flight: { mode: 'Unknown', modeNum: 0, armed: false, isFlying: false },
};

export const useTelemetryStore = create<TelemetryStore>((set) => ({
  ...initialState,

  updateAttitude: (data) => set({ attitude: data, lastAttitude: Date.now() }),
  updatePosition: (data) => set({ position: data, lastPosition: Date.now() }),
  updateGps: (data) => set({ gps: data, lastGps: Date.now() }),
  updateBattery: (data) => set({ battery: data, lastBattery: Date.now() }),
  updateVfrHud: (data) => set({ vfrHud: data, lastVfrHud: Date.now() }),
  updateFlight: (data) => set({ flight: data, lastHeartbeat: Date.now() }),
  reset: () => set(initialState),
}));
