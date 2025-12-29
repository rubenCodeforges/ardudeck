import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';

/**
 * Vehicle type for visualization
 */
export type VehicleType = 'copter' | 'plane' | 'vtol' | 'rover' | 'boat' | 'sub';

/**
 * Vehicle profile for performance calculations
 * Uses user-friendly inputs that pilots actually know
 */
export interface VehicleProfile {
  id: string;
  name: string;
  type: VehicleType;

  // Common physical
  weight: number;             // grams (AUW - all up weight with battery)

  // Battery - common to all
  batteryCells: number;       // Cell count (3S=3, 4S=4, 6S=6, etc.)
  batteryCapacity: number;    // mAh
  batteryDischarge?: number;  // C rating (optional, for advanced users)

  // === COPTER-SPECIFIC ===
  frameSize?: number;         // inches (5, 7, 10, etc.)
  motorCount?: number;        // 3=tri, 4=quad, 6=hex, 8=octo
  motorKv?: number;           // Motor KV rating
  propSize?: string;          // e.g., "5x4.5", "10x4.7"
  escRating?: number;         // ESC amps per motor

  // === PLANE-SPECIFIC ===
  wingspan?: number;          // mm
  wingArea?: number;          // cm² (for wing loading calc)
  stallSpeed?: number;        // m/s (user can enter if known)

  // === VTOL-SPECIFIC ===
  // Uses both copter (frameSize, motorCount) and plane (wingspan) fields
  vtolMotorCount?: number;    // Number of vertical lift motors
  transitionSpeed?: number;   // m/s - speed for VTOL transition

  // === ROVER-SPECIFIC ===
  wheelbase?: number;         // mm - distance between axles
  wheelDiameter?: number;     // mm
  driveType?: 'differential' | 'ackermann' | 'skid';  // Steering type
  maxSpeed?: number;          // m/s (user-entered, used for estimates)

  // === BOAT-SPECIFIC ===
  hullLength?: number;        // mm
  hullType?: 'displacement' | 'planing' | 'catamaran' | 'pontoon';
  propellerType?: 'prop' | 'jet' | 'paddle';
  displacement?: number;      // grams (water displaced, ~= buoyancy)

  // === SUB-SPECIFIC ===
  maxDepth?: number;          // meters - rated depth
  thrusterCount?: number;     // Number of thrusters
  buoyancy?: 'positive' | 'neutral' | 'negative';

  // Notes
  notes?: string;

  // Computed/cached (calculated from above)
  _cruiseSpeed?: number;      // m/s - calculated
  _maxSpeed?: number;         // m/s - calculated
  _avgPowerDraw?: number;     // Watts - calculated
}

/**
 * Flight statistics (persisted)
 */
export interface FlightStats {
  totalFlightTimeSeconds: number;
  totalDistanceMeters: number;
  totalMissions: number;
  lastFlightDate: string | null;
  lastConnectionDate: string | null;
}

/**
 * Mission planning defaults
 */
export interface MissionDefaults {
  safeAltitudeBuffer: number;     // meters above terrain for collision warning
  defaultWaypointAltitude: number; // meters - default altitude for new waypoints
  defaultTakeoffAltitude: number;  // meters - default takeoff altitude
}

/**
 * App-level settings store
 */
interface SettingsStore {
  // Persistence state
  _isInitialized: boolean;
  _isSaving: boolean;

  // Mission defaults
  missionDefaults: MissionDefaults;

  // Vehicle profiles
  vehicles: VehicleProfile[];
  activeVehicleId: string | null;

  // Flight stats
  flightStats: FlightStats;

  // Computed
  getActiveVehicle: () => VehicleProfile | null;
  getCruiseSpeed: () => number;
  getEstimatedFlightTime: () => number;  // seconds
  getEstimatedRange: () => number;       // meters

  // Persistence actions
  loadSettings: () => Promise<void>;
  _saveSettings: () => Promise<void>;

  // Actions - Mission defaults
  updateMissionDefaults: (updates: Partial<MissionDefaults>) => void;

  // Actions - Vehicles
  addVehicle: (vehicle: Omit<VehicleProfile, 'id'>) => void;
  updateVehicle: (id: string, updates: Partial<VehicleProfile>) => void;
  removeVehicle: (id: string) => void;
  setActiveVehicle: (id: string | null) => void;

  // Actions - Flight stats
  updateFlightStats: (updates: Partial<FlightStats>) => void;
  incrementMissionCount: () => void;
  addFlightTime: (seconds: number, distanceMeters: number) => void;

  // Reset
  resetToDefaults: () => void;
}

// Default values
const DEFAULT_MISSION_DEFAULTS: MissionDefaults = {
  safeAltitudeBuffer: 30,        // 30m above terrain
  defaultWaypointAltitude: 100,  // 100m default altitude
  defaultTakeoffAltitude: 50,    // 50m takeoff altitude
};

const DEFAULT_VEHICLE: VehicleProfile = {
  id: 'default',
  name: 'My Vehicle',
  type: 'copter',
  frameSize: 5,          // 5" quad
  weight: 600,           // 600g AUW
  batteryCells: 4,       // 4S
  batteryCapacity: 1500, // 1500 mAh
};

/**
 * Get nominal voltage from cell count
 */
function getCellVoltage(cells: number): number {
  return cells * 3.7; // LiPo nominal voltage
}

/**
 * Estimate cruise speed based on vehicle type and properties
 */
function estimateCruiseSpeed(vehicle: VehicleProfile): number {
  // If user provided max speed, use 70% for cruise estimate
  if (vehicle.maxSpeed) {
    return vehicle.maxSpeed * 0.7;
  }

  switch (vehicle.type) {
    case 'copter': {
      // Larger frames = faster cruise, but diminishing returns
      // Motor count affects efficiency (more motors = slightly slower cruise for same size)
      const frameSize = vehicle.frameSize || 5;
      const motorFactor = vehicle.motorCount ? (4 / vehicle.motorCount) * 0.9 + 0.1 : 1;
      return (8 + frameSize * 0.8) * motorFactor; // 5" quad = ~12 m/s
    }
    case 'plane': {
      // Wing loading affects cruise speed: heavier per area = faster
      // Stall speed if known is best indicator
      if (vehicle.stallSpeed) {
        return vehicle.stallSpeed * 1.5; // Cruise at 1.5x stall
      }
      const wingspan = vehicle.wingspan || 1200;
      const wingArea = vehicle.wingArea || (wingspan * wingspan * 0.15); // Rough AR=6 estimate
      const wingLoading = vehicle.weight / (wingArea / 10000); // g/dm²
      return 10 + Math.sqrt(wingLoading) * 0.8; // Higher loading = faster
    }
    case 'vtol': {
      // VTOL in forward flight similar to plane
      // Transition speed is a good reference if known
      if (vehicle.transitionSpeed) {
        return vehicle.transitionSpeed * 1.2;
      }
      const wingspan = vehicle.wingspan || 1500;
      return 12 + (wingspan / 200);
    }
    case 'rover': {
      // Wheel size affects max practical speed
      const wheelDiameter = vehicle.wheelDiameter || 100;
      return 2 + (wheelDiameter / 50); // 100mm wheels = ~4 m/s
    }
    case 'boat': {
      // Hull type significantly affects speed
      const hullLength = vehicle.hullLength || 600;
      const hullSpeedKnots = 1.34 * Math.sqrt(hullLength / 304.8); // Hull speed formula
      let multiplier = 1.0;
      if (vehicle.hullType === 'planing') multiplier = 2.0;
      if (vehicle.hullType === 'catamaran') multiplier = 1.3;
      return hullSpeedKnots * 0.514 * multiplier; // Convert knots to m/s
    }
    case 'sub': {
      // Thrusters affect speed capability
      const thrusterCount = vehicle.thrusterCount || 4;
      return 0.5 + (thrusterCount * 0.2);
    }
    default:
      return 10;
  }
}

/**
 * Estimate power draw based on vehicle type and properties
 */
function estimatePowerDraw(vehicle: VehicleProfile): number {
  const weight = vehicle.weight || 1000;

  switch (vehicle.type) {
    case 'copter': {
      // Base: 150-200W per kg at cruise
      // More motors = slightly more efficient (redundancy)
      // Larger props = more efficient
      const motorCount = vehicle.motorCount || 4;
      const frameSize = vehicle.frameSize || 5;
      const baseWattsPerKg = 200 - (motorCount - 4) * 5 - (frameSize - 5) * 3;
      return (weight / 1000) * Math.max(140, baseWattsPerKg);
    }
    case 'plane': {
      // Wing loading affects efficiency
      // Lower loading = more efficient glide
      const wingArea = vehicle.wingArea;
      if (wingArea) {
        const wingLoading = weight / (wingArea / 10000);
        return (weight / 1000) * (50 + wingLoading * 0.3);
      }
      return (weight / 1000) * 65;
    }
    case 'vtol': {
      // VTOL has hover inefficiency but forward flight efficiency
      // Assume 50% hover, 50% forward flight average
      const hoverPower = (weight / 1000) * 180;
      const forwardPower = (weight / 1000) * 65;
      return (hoverPower + forwardPower) / 2;
    }
    case 'rover': {
      // Drive type affects efficiency
      let efficiency = 1.0;
      if (vehicle.driveType === 'skid') efficiency = 1.3; // Less efficient
      if (vehicle.driveType === 'ackermann') efficiency = 0.9; // More efficient
      return (weight / 1000) * 30 * efficiency;
    }
    case 'boat': {
      // Hull type significantly affects power
      let hullEfficiency = 1.0;
      if (vehicle.hullType === 'planing') hullEfficiency = 2.5; // Much more power needed
      if (vehicle.hullType === 'catamaran') hullEfficiency = 0.8;
      if (vehicle.hullType === 'pontoon') hullEfficiency = 1.2;
      // Propulsion type matters too
      let propEfficiency = 1.0;
      if (vehicle.propellerType === 'jet') propEfficiency = 1.5;
      if (vehicle.propellerType === 'paddle') propEfficiency = 1.3;
      return (weight / 1000) * 40 * hullEfficiency * propEfficiency;
    }
    case 'sub': {
      // Depth doesn't affect power much, but thruster count does
      const thrusterCount = vehicle.thrusterCount || 4;
      return (weight / 1000) * (35 + thrusterCount * 5);
    }
    default:
      return 150;
  }
}

const DEFAULT_FLIGHT_STATS: FlightStats = {
  totalFlightTimeSeconds: 0,
  totalDistanceMeters: 0,
  totalMissions: 0,
  lastFlightDate: null,
  lastConnectionDate: null,
};

// Debounce timer for auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set, get) => ({
  // Persistence state
  _isInitialized: false,
  _isSaving: false,

  // Initial state (will be replaced by loadSettings)
  missionDefaults: { ...DEFAULT_MISSION_DEFAULTS },
  vehicles: [{ ...DEFAULT_VEHICLE }],
  activeVehicleId: 'default',
  flightStats: { ...DEFAULT_FLIGHT_STATS },

  // Computed
  getActiveVehicle: () => {
    const { vehicles, activeVehicleId } = get();
    return vehicles.find(v => v.id === activeVehicleId) || null;
  },

  getCruiseSpeed: () => {
    const vehicle = get().getActiveVehicle();
    if (!vehicle) return 10;
    return vehicle._cruiseSpeed || estimateCruiseSpeed(vehicle);
  },

  // Estimated flight time in seconds based on battery and power draw
  getEstimatedFlightTime: () => {
    const vehicle = get().getActiveVehicle();
    if (!vehicle) return 20 * 60; // Default 20 minutes

    const voltage = getCellVoltage(vehicle.batteryCells || 4);
    const powerDraw = vehicle._avgPowerDraw || estimatePowerDraw(vehicle);

    if (powerDraw <= 0) return 20 * 60;

    // Energy in Wh = (mAh * V) / 1000
    const energyWh = (vehicle.batteryCapacity * voltage) / 1000;
    // Time in hours = Energy / Power, convert to seconds
    // Apply 80% usable capacity for safety
    const flightTimeSeconds = ((energyWh / powerDraw) * 0.8) * 3600;
    return Math.round(flightTimeSeconds);
  },

  // Estimated range in meters
  getEstimatedRange: () => {
    const vehicle = get().getActiveVehicle();
    if (!vehicle) return 0;

    const flightTime = get().getEstimatedFlightTime();
    const cruiseSpeed = vehicle._cruiseSpeed || estimateCruiseSpeed(vehicle);
    return Math.round(flightTime * cruiseSpeed);
  },

  // Persistence actions
  loadSettings: async () => {
    console.log('[Settings] loadSettings called, electronAPI available:', !!window.electronAPI);
    try {
      const settings = await window.electronAPI?.getSettings();
      console.log('[Settings] Raw settings from IPC:', settings);
      if (settings) {
        set({
          missionDefaults: settings.missionDefaults || { ...DEFAULT_MISSION_DEFAULTS },
          vehicles: settings.vehicles?.length ? settings.vehicles : [{ ...DEFAULT_VEHICLE }],
          activeVehicleId: settings.activeVehicleId || settings.vehicles?.[0]?.id || 'default',
          flightStats: settings.flightStats || { ...DEFAULT_FLIGHT_STATS },
          _isInitialized: true,
        });
        console.log('[Settings] Loaded from disk:', settings.vehicles?.length || 0, 'vehicles');
      } else {
        set({ _isInitialized: true });
        console.log('[Settings] No saved settings (null response), using defaults');
      }
    } catch (error) {
      console.error('[Settings] Failed to load:', error);
      set({ _isInitialized: true });
    }
  },

  _saveSettings: async () => {
    const state = get();
    console.log('[Settings] _saveSettings called, initialized:', state._isInitialized, 'saving:', state._isSaving);
    if (!state._isInitialized || state._isSaving) return;

    set({ _isSaving: true });
    try {
      const payload = {
        missionDefaults: state.missionDefaults,
        vehicles: state.vehicles,
        activeVehicleId: state.activeVehicleId,
        flightStats: state.flightStats,
      };
      console.log('[Settings] Saving payload:', payload.vehicles?.length, 'vehicles');
      await window.electronAPI?.saveSettings(payload);
      console.log('[Settings] Saved to disk successfully');
    } catch (error) {
      console.error('[Settings] Failed to save:', error);
    } finally {
      set({ _isSaving: false });
    }
  },

  // Actions - Mission defaults
  updateMissionDefaults: (updates) => {
    set((state) => ({
      missionDefaults: { ...state.missionDefaults, ...updates },
    }));
  },

  // Actions - Vehicles
  addVehicle: (vehicleData) => {
    const id = `vehicle-${Date.now()}`;
    const vehicle: VehicleProfile = {
      ...vehicleData,
      id,
      // Ensure required fields have defaults
      batteryCells: vehicleData.batteryCells || 4,
      batteryCapacity: vehicleData.batteryCapacity || 1500,
      weight: vehicleData.weight || 500,
    };
    set((state) => ({
      vehicles: [...state.vehicles, vehicle],
    }));
  },

  updateVehicle: (id, updates) => {
    set((state) => ({
      vehicles: state.vehicles.map(v =>
        v.id === id ? { ...v, ...updates } : v
      ),
    }));
  },

  removeVehicle: (id) => {
    set((state) => {
      // Don't remove if it's the only vehicle
      if (state.vehicles.length <= 1) return state;

      const newVehicles = state.vehicles.filter(v => v.id !== id);
      // If removing active vehicle, switch to first available
      const newActiveId = state.activeVehicleId === id
        ? newVehicles[0]?.id || null
        : state.activeVehicleId;

      return {
        vehicles: newVehicles,
        activeVehicleId: newActiveId,
      };
    });
  },

  setActiveVehicle: (id) => {
    set({ activeVehicleId: id });
  },

  // Actions - Flight stats
  updateFlightStats: (updates) => {
    set((state) => ({
      flightStats: { ...state.flightStats, ...updates },
    }));
  },

  incrementMissionCount: () => {
    set((state) => ({
      flightStats: {
        ...state.flightStats,
        totalMissions: state.flightStats.totalMissions + 1,
      },
    }));
  },

  addFlightTime: (seconds, distanceMeters) => {
    set((state) => ({
      flightStats: {
        ...state.flightStats,
        totalFlightTimeSeconds: state.flightStats.totalFlightTimeSeconds + seconds,
        totalDistanceMeters: state.flightStats.totalDistanceMeters + distanceMeters,
        lastFlightDate: new Date().toISOString(),
      },
    }));
  },

  // Reset
  resetToDefaults: () => {
    set({
      missionDefaults: { ...DEFAULT_MISSION_DEFAULTS },
      vehicles: [{ ...DEFAULT_VEHICLE }],
      activeVehicleId: 'default',
      flightStats: { ...DEFAULT_FLIGHT_STATS },
    });
  },
})));

// Debounced auto-save when relevant state changes
const debouncedSave = () => {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    useSettingsStore.getState()._saveSettings();
  }, 500); // 500ms debounce
};

// Subscribe to state changes and auto-save (skip internal state like _isInitialized)
useSettingsStore.subscribe(
  (state) => ({
    missionDefaults: state.missionDefaults,
    vehicles: state.vehicles,
    activeVehicleId: state.activeVehicleId,
    flightStats: state.flightStats,
  }),
  (curr, prev) => {
    // Only save if initialized and something changed
    if (useSettingsStore.getState()._isInitialized) {
      // Check if anything actually changed (shallow comparison)
      if (
        curr.missionDefaults !== prev.missionDefaults ||
        curr.vehicles !== prev.vehicles ||
        curr.activeVehicleId !== prev.activeVehicleId ||
        curr.flightStats !== prev.flightStats
      ) {
        debouncedSave();
      }
    }
  },
  { fireImmediately: false }
);

// Export a function to initialize settings (call from App.tsx)
export const initializeSettings = () => {
  if (typeof window !== 'undefined' && window.electronAPI && !useSettingsStore.getState()._isInitialized) {
    useSettingsStore.getState().loadSettings();
  }
};
