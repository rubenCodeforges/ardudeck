import { create } from 'zustand';
import { subscribeWithSelector } from 'zustand/middleware';
import type { TelemetrySpeed } from '../../shared/ipc-channels.js';

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
  batteryChemistry?: 'lipo' | 'lihv' | 'lion' | 'life';  // Battery chemistry type (default: lipo)
  batteryDischarge?: number;  // C rating (optional, for advanced users)

  // === COPTER-SPECIFIC ===
  frameSize?: number;         // mm diagonal (127=5", 178=7", 254=10", 320, 450, etc.)
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
export type MissionFirmware = 'ardupilot' | 'inav';

export interface MissionDefaults {
  safeAltitudeBuffer: number;     // meters above terrain for collision warning
  defaultWaypointAltitude: number; // meters - default altitude for new waypoints
  defaultTakeoffAltitude: number;  // meters - default takeoff altitude
  advancedMissionLabels: boolean;  // false = friendly labels ("Fly here"), true = standard ("WP")
  missionFirmware: MissionFirmware; // Which firmware's commands to show when disconnected
  showSegmentColors: boolean;      // Color-coded path segments on map (camera, ROI, speed, etc.)
}

/**
 * Display unit preferences for large vehicle support
 * 'small' = mm, g, mAh (default - racing/freestyle quads)
 * 'large' = m, kg, Ah (large aircraft, industrial drones)
 */
export type DisplayUnits = 'small' | 'large';

/**
 * Connection memory - remembers last used connection settings
 */
export interface ConnectionMemory {
  lastSerialPort?: string;
  lastBaudRate?: number;
  lastTcpHost?: string;
  lastTcpPort?: number;
  lastUdpPort?: number;
  lastConnectionType?: 'serial' | 'tcp' | 'udp';
}

/**
 * Default SITL type for quick-start button
 */
export type DefaultSitlType = 'inav' | 'ardupilot';

/**
 * App-level settings store
 */
interface SettingsStore {
  // Persistence state
  _isInitialized: boolean;
  _isSaving: boolean;

  // Non-persisted: SITL switch flag (set when SITL starts, cleared when ConnectionPanel reads it)
  pendingSitlSwitch: boolean;
  setPendingSitlSwitch: (value: boolean) => void;

  // Mission defaults
  missionDefaults: MissionDefaults;

  // Vehicle profiles
  vehicles: VehicleProfile[];
  activeVehicleId: string | null;

  // Flight stats
  flightStats: FlightStats;

  // Connection memory
  connectionMemory: ConnectionMemory;

  // SITL preferences
  defaultSitlType: DefaultSitlType;

  // Telemetry stream rate
  telemetrySpeed: TelemetrySpeed;

  // Display units
  displayUnits: DisplayUnits;
  setDisplayUnits: (units: DisplayUnits) => void;

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
  addVehicle: (vehicle: Omit<VehicleProfile, 'id'>) => string;  // Returns the new vehicle's ID
  updateVehicle: (id: string, updates: Partial<VehicleProfile>) => void;
  removeVehicle: (id: string) => void;
  setActiveVehicle: (id: string | null) => void;

  // Actions - Flight stats
  updateFlightStats: (updates: Partial<FlightStats>) => void;
  incrementMissionCount: () => void;
  addFlightTime: (seconds: number, distanceMeters: number) => void;

  // Actions - Connection memory
  updateConnectionMemory: (updates: Partial<ConnectionMemory>) => void;

  // Actions - SITL preferences
  setDefaultSitlType: (type: DefaultSitlType) => void;

  // Actions - Telemetry
  setTelemetrySpeed: (speed: TelemetrySpeed) => void;

  // Reset
  resetToDefaults: () => void;
}

// Default values
const DEFAULT_MISSION_DEFAULTS: MissionDefaults = {
  safeAltitudeBuffer: 30,        // 30m above terrain
  defaultWaypointAltitude: 100,  // 100m default altitude
  defaultTakeoffAltitude: 50,    // 50m takeoff altitude
  advancedMissionLabels: false,  // Friendly labels by default
  missionFirmware: 'ardupilot',  // Default firmware for offline mission planning
  showSegmentColors: true,       // Color-coded path segments on by default
};

const DEFAULT_VEHICLE: VehicleProfile = {
  id: 'default',
  name: 'My Vehicle',
  type: 'copter',
  frameSize: 127,        // 5" quad (127mm)
  weight: 600,           // 600g AUW
  batteryCells: 4,       // 4S
  batteryCapacity: 1500, // 1500 mAh
};

/**
 * Get nominal voltage from cell count
 */
const CHEMISTRY_NOMINAL: Record<string, number> = {
  lipo: 3.7, lihv: 3.8, lion: 3.6, life: 3.3,
};

function getCellVoltage(cells: number, chemistry?: string): number {
  return cells * (CHEMISTRY_NOMINAL[chemistry || 'lipo'] ?? 3.7);
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
      // If prop pitch is known, use it for a better speed estimate
      // Pitch speed (theoretical max) = pitch(in) × RPM / 1056
      // Cruise ≈ 40-50% of pitch speed
      const prop = parsePropSize(vehicle.propSize);
      if (prop && vehicle.motorKv) {
        const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
        const maxRPM = vehicle.motorKv * voltage;
        // Pitch speed in m/s = pitch(in) × RPM × 0.0254 / 60
        const pitchSpeed = prop.pitch * maxRPM * 0.0254 / 60;
        return Math.min(pitchSpeed * 0.45, 40); // Cruise at ~45% pitch speed, cap at 40 m/s
      }
      // Fallback: frame size heuristic
      const frameSizeInches = (vehicle.frameSize || 127) / 25.4;
      const motorFactor = vehicle.motorCount ? (4 / vehicle.motorCount) * 0.9 + 0.1 : 1;
      return (8 + frameSizeInches * 0.8) * motorFactor; // 5" quad = ~12 m/s
    }
    case 'plane': {
      if (vehicle.stallSpeed && vehicle.stallSpeed > 0) {
        return vehicle.stallSpeed * 1.5;
      }
      // Prop pitch speed is a hard physical ceiling — cruise is a fraction of it
      const prop = parsePropSize(vehicle.propSize);
      if (prop && vehicle.motorKv) {
        const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
        const maxRPM = vehicle.motorKv * voltage;
        const pitchSpeed = prop.pitch * maxRPM * 0.0254 / 60; // m/s
        // Planes are more aerodynamically efficient than copters — cruise at ~60% pitch speed
        return Math.min(pitchSpeed * 0.6, 80);
      }
      // Fallback: wing loading heuristic
      const wingspan = vehicle.wingspan || 1200;
      const wingArea = vehicle.wingArea || ((wingspan * wingspan * 0.15) / 100);
      if (wingArea <= 0 || vehicle.weight <= 0) return 15;
      const wingLoading = vehicle.weight / (wingArea / 100); // g/dm²
      if (!isFinite(wingLoading)) return 15;
      return 10 + Math.sqrt(wingLoading) * 0.8;
    }
    case 'vtol': {
      if (vehicle.transitionSpeed) {
        return vehicle.transitionSpeed * 1.2;
      }
      // Same physics — pitch speed limits forward flight
      const prop = parsePropSize(vehicle.propSize);
      if (prop && vehicle.motorKv) {
        const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
        const maxRPM = vehicle.motorKv * voltage;
        const pitchSpeed = prop.pitch * maxRPM * 0.0254 / 60;
        // VTOL forward flight: ~55% pitch speed (more drag than pure plane)
        return Math.min(pitchSpeed * 0.55, 60);
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
      // Hull speed formula — displacement hulls have a hard limit
      const hullLength = vehicle.hullLength || 600;
      const hullSpeedKnots = 1.34 * Math.sqrt(hullLength / 304.8);
      let multiplier = 1.0;
      if (vehicle.hullType === 'planing') multiplier = 2.0;
      if (vehicle.hullType === 'catamaran') multiplier = 1.3;
      const hullSpeedMs = hullSpeedKnots * 0.514 * multiplier;
      // For prop-driven boats, pitch speed is also a ceiling
      const prop = parsePropSize(vehicle.propSize);
      if (prop && vehicle.motorKv) {
        const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
        const maxRPM = vehicle.motorKv * voltage;
        const pitchSpeed = prop.pitch * maxRPM * 0.0254 / 60;
        // Water props are ~30% efficient; real limit is min of hull speed and pitch speed
        return Math.min(pitchSpeed * 0.3, hullSpeedMs);
      }
      return hullSpeedMs;
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
 * Parse prop size string "5x4.5" → { diameter, pitch } in inches
 */
function parsePropSize(propSize: string | undefined): { diameter: number; pitch: number } | null {
  if (!propSize) return null;
  const match = propSize.match(/^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)$/);
  if (!match?.[1] || !match[2]) return null;
  return { diameter: parseFloat(match[1]), pitch: parseFloat(match[2]) };
}

/**
 * Estimate power draw based on vehicle type and properties.
 * Uses advanced fields (motor KV, ESC rating, prop size) when available
 * for more accurate estimates; falls back to weight-based formulas.
 */
function estimatePowerDraw(vehicle: VehicleProfile): number {
  const weight = vehicle.weight || 1000;
  const weightKg = weight / 1000;
  const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
  const prop = parsePropSize(vehicle.propSize);

  switch (vehicle.type) {
    case 'copter': {
      const motorCount = vehicle.motorCount || 4;

      // Best: ESC rating known → max power × hover throttle fraction
      if (vehicle.escRating) {
        const maxPower = voltage * vehicle.escRating * motorCount;
        const gramsPerMotor = weight / motorCount;
        const hoverThrottle = Math.min(0.85, Math.max(0.3, 0.4 + (gramsPerMotor / 1500)));
        return maxPower * hoverThrottle;
      }

      // Frame size + motor count heuristic
      const frameSizeInches = (vehicle.frameSize || 127) / 25.4;
      let wattsPerKg = 200 - (motorCount - 4) * 5 - (frameSizeInches - 5) * 3;
      wattsPerKg = Math.max(140, wattsPerKg);

      if (prop) {
        // Known prop: scale efficiency by diameter (5" = baseline 1.0)
        const effFactor = Math.max(0.5, (prop.diameter / 5) ** 0.7);
        wattsPerKg /= effFactor;

        // KV + prop: penalize KV/prop mismatch
        if (vehicle.motorKv) {
          const cells = vehicle.batteryCells || 4;
          const optimalKv = 30000 / (prop.diameter * Math.sqrt(cells));
          const kvDeviation = Math.abs(vehicle.motorKv / optimalKv - 1);
          wattsPerKg *= (1 + kvDeviation * 0.15);
        }
      } else {
        // No prop data: assume average/suboptimal propulsion (+15% conservative)
        wattsPerKg *= 1.15;
      }

      return weightKg * wattsPerKg;
    }
    case 'plane': {
      // Best: ESC rating known → max power × cruise throttle fraction
      if (vehicle.escRating) {
        const maxPower = voltage * vehicle.escRating;
        let cruiseThrottle = 0.35;
        if (vehicle.wingArea && vehicle.wingArea > 0) {
          const wingLoading = weight / (vehicle.wingArea / 100);
          if (isFinite(wingLoading)) {
            cruiseThrottle = Math.min(0.6, 0.25 + wingLoading * 0.001);
          }
        }
        // With prop data we can refine; without, assume average efficiency
        if (!prop) cruiseThrottle *= 1.1;
        return maxPower * cruiseThrottle;
      }

      // Fallback: wing loading based estimate
      let basePower: number;
      if (vehicle.wingArea && vehicle.wingArea > 0) {
        const wingLoading = weight / (vehicle.wingArea / 100); // g/dm²
        basePower = isFinite(wingLoading)
          ? weightKg * (50 + wingLoading * 0.3)
          : weightKg * 65;
      } else {
        basePower = weightKg * 65;
      }

      if (prop) {
        // Known prop: larger diameter = better propulsive efficiency
        const effFactor = Math.max(0.5, (prop.diameter / 10) ** 0.5);
        basePower /= effFactor;
        // High pitch/diameter = speed-optimized, less efficient cruise
        const pitchRatio = prop.pitch / prop.diameter;
        if (pitchRatio > 0.6) {
          basePower *= (1 + (pitchRatio - 0.6) * 0.3);
        }
      } else {
        // No prop data: assume average propulsion efficiency (+20% conservative)
        basePower *= 1.2;
      }

      return basePower;
    }
    case 'vtol': {
      // VTOL: hover phase + forward flight phase
      const hoverMotors = vehicle.vtolMotorCount || 4;
      let hoverPower: number;
      if (vehicle.escRating) {
        const maxHoverPower = voltage * vehicle.escRating * hoverMotors;
        hoverPower = maxHoverPower * 0.55;
      } else {
        hoverPower = weightKg * (prop ? 170 : 195); // prop known = better estimate
      }
      const forwardPower = weightKg * (prop ? 60 : 72);
      // Typical mission: ~40% hover (takeoff/landing/loiter), 60% forward flight
      return hoverPower * 0.4 + forwardPower * 0.6;
    }
    case 'rover': {
      let efficiency = 1.0;
      if (vehicle.driveType === 'skid') efficiency = 1.3;
      if (vehicle.driveType === 'ackermann') efficiency = 0.9;
      // ESC-based if available
      if (vehicle.escRating) {
        return voltage * vehicle.escRating * 0.4 * efficiency;
      }
      return weightKg * 30 * efficiency;
    }
    case 'boat': {
      let hullEfficiency = 1.0;
      if (vehicle.hullType === 'planing') hullEfficiency = 2.5;
      if (vehicle.hullType === 'catamaran') hullEfficiency = 0.8;
      if (vehicle.hullType === 'pontoon') hullEfficiency = 1.2;
      let propEfficiency = 1.0;
      if (vehicle.propellerType === 'jet') propEfficiency = 1.5;
      if (vehicle.propellerType === 'paddle') propEfficiency = 1.3;
      if (vehicle.escRating) {
        return voltage * vehicle.escRating * 0.45 * hullEfficiency * propEfficiency;
      }
      return weightKg * 40 * hullEfficiency * propEfficiency;
    }
    case 'sub': {
      const thrusterCount = vehicle.thrusterCount || 4;
      if (vehicle.escRating) {
        return voltage * vehicle.escRating * thrusterCount * 0.35;
      }
      return weightKg * (35 + thrusterCount * 5);
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

const DEFAULT_CONNECTION_MEMORY: ConnectionMemory = {
  lastBaudRate: 115200,
  lastConnectionType: 'serial',
};

// Debounce timer for auto-save
let saveTimeout: ReturnType<typeof setTimeout> | null = null;

export const useSettingsStore = create<SettingsStore>()(
  subscribeWithSelector((set, get) => ({
  // Persistence state
  _isInitialized: false,
  _isSaving: false,

  // Non-persisted: SITL switch flag
  pendingSitlSwitch: false,
  setPendingSitlSwitch: (value: boolean) => set({ pendingSitlSwitch: value }),

  // Initial state (will be replaced by loadSettings)
  missionDefaults: { ...DEFAULT_MISSION_DEFAULTS },
  vehicles: [{ ...DEFAULT_VEHICLE }],
  activeVehicleId: 'default',
  flightStats: { ...DEFAULT_FLIGHT_STATS },
  connectionMemory: { ...DEFAULT_CONNECTION_MEMORY },
  defaultSitlType: 'inav',
  telemetrySpeed: 'normal' as TelemetrySpeed,
  displayUnits: 'small' as DisplayUnits,

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

    const voltage = getCellVoltage(vehicle.batteryCells || 4, vehicle.batteryChemistry);
    const powerDraw = vehicle._avgPowerDraw || estimatePowerDraw(vehicle);

    if (!powerDraw || powerDraw <= 0 || !isFinite(powerDraw)) return 20 * 60;

    // Energy in Wh = (mAh * V) / 1000
    const energyWh = (vehicle.batteryCapacity * voltage) / 1000;
    // Time in hours = Energy / Power, convert to seconds
    // Apply 80% usable capacity for safety
    const flightTimeSeconds = ((energyWh / powerDraw) * 0.8) * 3600;

    // Guard against NaN/Infinity from edge-case inputs
    if (!isFinite(flightTimeSeconds) || flightTimeSeconds < 0) return 20 * 60;
    // Cap at 24 hours - anything beyond is clearly an estimation error
    return Math.min(Math.round(flightTimeSeconds), 24 * 3600);
  },

  // Estimated range in meters
  getEstimatedRange: () => {
    const vehicle = get().getActiveVehicle();
    if (!vehicle) return 0;

    const flightTime = get().getEstimatedFlightTime();
    const cruiseSpeed = vehicle._cruiseSpeed || estimateCruiseSpeed(vehicle);

    if (!isFinite(cruiseSpeed) || cruiseSpeed < 0) return 0;
    const range = flightTime * cruiseSpeed;
    // Guard against NaN/Infinity, cap at 10000km
    if (!isFinite(range) || range < 0) return 0;
    return Math.min(Math.round(range), 10_000_000);
  },

  // Persistence actions
  loadSettings: async () => {
    try {
      const settings = await window.electronAPI?.getSettings();
      if (settings) {
        set({
          missionDefaults: { ...DEFAULT_MISSION_DEFAULTS, ...settings.missionDefaults },
          vehicles: settings.vehicles?.length ? settings.vehicles : [{ ...DEFAULT_VEHICLE }],
          activeVehicleId: settings.activeVehicleId || settings.vehicles?.[0]?.id || 'default',
          flightStats: settings.flightStats || { ...DEFAULT_FLIGHT_STATS },
          connectionMemory: settings.connectionMemory || { ...DEFAULT_CONNECTION_MEMORY },
          defaultSitlType: (settings as unknown as Record<string, unknown>).defaultSitlType as DefaultSitlType || 'inav',
          telemetrySpeed: ((settings as unknown as Record<string, unknown>).telemetrySpeed as TelemetrySpeed) || 'normal',
          displayUnits: ((settings as unknown as Record<string, unknown>).displayUnits as DisplayUnits) || 'small',
          _isInitialized: true,
        });
      } else {
        set({ _isInitialized: true });
      }
    } catch (error) {
      console.error('[Settings] Failed to load:', error);
      set({ _isInitialized: true });
    }
  },

  _saveSettings: async () => {
    const state = get();
    if (!state._isInitialized || state._isSaving) return;

    set({ _isSaving: true });
    try {
      const payload = {
        missionDefaults: state.missionDefaults,
        vehicles: state.vehicles,
        activeVehicleId: state.activeVehicleId,
        flightStats: state.flightStats,
        connectionMemory: state.connectionMemory,
        defaultSitlType: state.defaultSitlType,
        telemetrySpeed: state.telemetrySpeed,
        displayUnits: state.displayUnits,
      };
      await window.electronAPI?.saveSettings(payload);
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
    return id;  // Return the new vehicle's ID
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

  // Actions - Connection memory
  updateConnectionMemory: (updates) => {
    set((state) => ({
      connectionMemory: { ...state.connectionMemory, ...updates },
    }));
  },

  // Actions - SITL preferences
  setDefaultSitlType: (type) => {
    set({ defaultSitlType: type });
  },

  // Actions - Telemetry
  setTelemetrySpeed: (speed) => {
    set({ telemetrySpeed: speed });
  },

  setDisplayUnits: (units) => {
    set({ displayUnits: units });
  },

  // Reset
  resetToDefaults: () => {
    set({
      missionDefaults: { ...DEFAULT_MISSION_DEFAULTS },
      vehicles: [{ ...DEFAULT_VEHICLE }],
      activeVehicleId: 'default',
      flightStats: { ...DEFAULT_FLIGHT_STATS },
      connectionMemory: { ...DEFAULT_CONNECTION_MEMORY },
      defaultSitlType: 'inav',
      telemetrySpeed: 'normal',
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
    connectionMemory: state.connectionMemory,
    defaultSitlType: state.defaultSitlType,
    telemetrySpeed: state.telemetrySpeed,
    displayUnits: state.displayUnits,
  }),
  (curr, prev) => {
    // Only save if initialized and something changed
    if (useSettingsStore.getState()._isInitialized) {
      // Check if anything actually changed (shallow comparison)
      if (
        curr.missionDefaults !== prev.missionDefaults ||
        curr.vehicles !== prev.vehicles ||
        curr.activeVehicleId !== prev.activeVehicleId ||
        curr.flightStats !== prev.flightStats ||
        curr.connectionMemory !== prev.connectionMemory ||
        curr.defaultSitlType !== prev.defaultSitlType ||
        curr.telemetrySpeed !== prev.telemetrySpeed ||
        curr.displayUnits !== prev.displayUnits
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
