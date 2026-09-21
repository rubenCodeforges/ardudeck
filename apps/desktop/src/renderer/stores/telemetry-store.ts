import { create } from 'zustand';
import type { TelemetryState, AttitudeData, PositionData, GpsData, BatteryData, BatteryInstanceData, VfrHudData, WindData, FlightState, RcChannelsData, RadioStatusData, SensorHealth, NavControllerData, GuidedTargetData } from '../../shared/telemetry-types';
import type { VibrationData, EscTelemetryData, ServoOutputData } from '../../shared/motor-test-types';

/** Batch telemetry update - all fields optional */
export interface TelemetryBatch {
  attitude?: AttitudeData;
  position?: PositionData;
  gps?: GpsData;
  gps2?: GpsData;
  battery?: BatteryData;
  /** Per-monitor BATTERY_STATUS instances received this batch, keyed by id. */
  batteryInstances?: Record<number, Omit<BatteryInstanceData, 'updatedAt'>>;
  vfrHud?: VfrHudData;
  wind?: WindData;
  flight?: FlightState;
  rcChannels?: RcChannelsData;
  radioStatus?: RadioStatusData;
  vibration?: VibrationData;
  escTelemetry?: EscTelemetryData;
  servoOutput?: ServoOutputData;
  sensorHealth?: SensorHealth;
  navController?: NavControllerData;
  guidedTarget?: GuidedTargetData;
  vtolState?: number;
  /** Source vehicle key, tagged by the main process for per-vehicle routing. */
  __vehicleKey?: string;
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
  /**
   * Choose which battery monitor drives the primary `battery` slot (#126).
   * null restores the SYS_STATUS default (battery 1). Persisted.
   */
  setPrimaryBattery: (id: number | null) => void;
  reset: () => void;
}

const PRIMARY_BATTERY_KEY = 'ardudeck.primaryBatteryId';

function loadPrimaryBatteryId(): number | null {
  try {
    const raw = localStorage.getItem(PRIMARY_BATTERY_KEY);
    if (raw === null) return null;
    const n = Number(raw);
    return Number.isInteger(n) && n >= 0 ? n : null;
  } catch {
    return null;
  }
}

const initialState: TelemetryState = {
  lastHeartbeat: 0,
  lastAttitude: 0,
  lastPosition: 0,
  lastGps: 0,
  lastGps2: 0,
  lastBattery: 0,
  lastVfrHud: 0,
  lastRcChannels: 0,
  lastVibration: 0,
  lastEscTelemetry: 0,
  lastServoOutput: 0,

  attitude: { roll: 0, pitch: 0, yaw: 0, rollSpeed: 0, pitchSpeed: 0, yawSpeed: 0 },
  position: { lat: 0, lon: 0, alt: 0, relativeAlt: 0, vx: 0, vy: 0, vz: 0 },
  gps: { fixType: 0, satellites: 0, hdop: 99, vdop: 99, lat: 0, lon: 0, alt: 0 },
  gps2: null,
  battery: { voltage: 0, current: 0, remaining: 0 },
  batteries: {},
  primaryBatteryId: loadPrimaryBatteryId(),
  vfrHud: { airspeed: 0, groundspeed: 0, heading: 0, throttle: 0, alt: 0, climb: 0 },
  wind: { direction: 0, speed: 0, speedZ: 0 },
  flight: { mode: 'Unknown', modeNum: 0, armed: false, isFlying: false },
  rcChannels: { channels: [], chancount: 0, rssi: 0 },
  radioStatus: null,
  vibration: null,
  escTelemetry: null,
  servoOutput: null,
  sensorHealth: null,
  navController: null,
  guidedTarget: null,
  vtolState: null,
};

export const useTelemetryStore = create<TelemetryStore>((set, get) => ({
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
    if (batch.gps2) {
      updates.gps2 = batch.gps2;
      updates.lastGps2 = now;
    }
    if (batch.batteryInstances) {
      const merged: Record<number, BatteryInstanceData> = { ...get().batteries };
      for (const inst of Object.values(batch.batteryInstances)) {
        merged[inst.id] = { ...inst, updatedAt: now };
      }
      updates.batteries = merged;
    }
    // Primary battery slot (#126): with no selection, SYS_STATUS (battery 1)
    // drives it as always. With a selected monitor, that monitor's
    // BATTERY_STATUS drives it instead, so every consumer (panel, gauges,
    // HUD, announcer) follows the selection without knowing about it.
    const primaryId = get().primaryBatteryId;
    if (batch.battery && primaryId === null) {
      updates.battery = batch.battery;
      updates.lastBattery = now;
    } else if (primaryId !== null) {
      const inst = batch.batteryInstances?.[primaryId];
      if (inst) {
        updates.battery = { ...inst };
        updates.lastBattery = now;
      } else if (primaryId === 0 && batch.battery) {
        // Monitor 1 selected but no BATTERY_STATUS this batch, SYS_STATUS
        // reports the same battery, keep freshness from it.
        updates.battery = batch.battery;
        updates.lastBattery = now;
      }
    }
    if (batch.vfrHud) {
      updates.vfrHud = batch.vfrHud;
      updates.lastVfrHud = now;
    }
    if (batch.wind) {
      updates.wind = batch.wind;
    }
    if (batch.flight) {
      updates.flight = batch.flight;
      updates.lastHeartbeat = now;
    }
    if (batch.rcChannels) {
      updates.rcChannels = batch.rcChannels;
      updates.lastRcChannels = now;
    }
    if (batch.radioStatus) {
      updates.radioStatus = batch.radioStatus;
    }
    if (batch.vibration) {
      updates.vibration = batch.vibration;
      updates.lastVibration = now;
    }
    if (batch.escTelemetry) {
      updates.escTelemetry = batch.escTelemetry;
      updates.lastEscTelemetry = now;
    }
    if (batch.servoOutput) {
      updates.servoOutput = batch.servoOutput;
      updates.lastServoOutput = now;
    }
    if (batch.sensorHealth) {
      updates.sensorHealth = batch.sensorHealth;
    }
    if (batch.navController) {
      updates.navController = batch.navController;
    }
    if (batch.guidedTarget) {
      updates.guidedTarget = batch.guidedTarget;
    }
    if (batch.vtolState !== undefined) {
      updates.vtolState = batch.vtolState as TelemetryState['vtolState'];
    }

    set(updates);
  },

  setPrimaryBattery: (id) => {
    try {
      if (id === null) localStorage.removeItem(PRIMARY_BATTERY_KEY);
      else localStorage.setItem(PRIMARY_BATTERY_KEY, String(id));
    } catch { /* storage unavailable, selection still applies this session */ }
    set((state) => {
      const inst = id !== null ? state.batteries[id] : undefined;
      return {
        primaryBatteryId: id,
        // Apply immediately from the last-seen instance so the primary
        // display doesn't wait for the next telemetry batch.
        ...(inst ? { battery: { ...inst }, lastBattery: Date.now() } : {}),
      };
    });
  },

  // Re-read the persisted battery selection: initialState captured it at
  // module load and the user may have changed it since.
  reset: () => set({ ...initialState, primaryBatteryId: loadPrimaryBatteryId() }),
}));
