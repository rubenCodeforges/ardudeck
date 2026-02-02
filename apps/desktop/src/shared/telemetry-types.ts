/**
 * Telemetry data types for vehicle state
 */

export interface AttitudeData {
  roll: number;      // degrees
  pitch: number;     // degrees
  yaw: number;       // degrees (heading)
  rollSpeed: number; // deg/s
  pitchSpeed: number;
  yawSpeed: number;
}

export interface PositionData {
  lat: number;       // degrees
  lon: number;       // degrees
  alt: number;       // meters MSL
  relativeAlt: number; // meters above home
  vx: number;        // m/s north
  vy: number;        // m/s east
  vz: number;        // m/s down
}

export interface GpsData {
  fixType: number;   // 0=no fix, 1=no fix, 2=2D, 3=3D, 4=DGPS, 5=RTK float, 6=RTK fixed
  satellites: number;
  hdop: number;      // horizontal dilution of precision (lower is better)
  lat: number;       // degrees
  lon: number;       // degrees
  alt: number;       // meters MSL
}

export interface BatteryData {
  voltage: number;   // volts
  current: number;   // amps
  remaining: number; // percent 0-100
}

export interface VfrHudData {
  airspeed: number;    // m/s
  groundspeed: number; // m/s
  heading: number;     // degrees 0-360
  throttle: number;    // percent 0-100
  alt: number;         // meters
  climb: number;       // m/s
}

export interface FlightState {
  mode: string;
  modeNum: number;
  armed: boolean;
  isFlying: boolean;
  /** Reasons why arming is disabled (from MSP_STATUS_EX) */
  armingDisabledReasons?: string[];
  /** Active sensors bitmask from MSP_STATUS (bit0=ACC, bit1=BARO, bit2=MAG, bit3=GPS) */
  activeSensors?: number;
}

export interface TelemetryState {
  // Last update timestamps
  lastHeartbeat: number;
  lastAttitude: number;
  lastPosition: number;
  lastGps: number;
  lastBattery: number;
  lastVfrHud: number;

  // Data
  attitude: AttitudeData;
  position: PositionData;
  gps: GpsData;
  battery: BatteryData;
  vfrHud: VfrHudData;
  flight: FlightState;
}

// Flight modes for ArduPilot Copter
export const COPTER_MODES: Record<number, string> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  5: 'Loiter',
  6: 'RTL',
  7: 'Circle',
  9: 'Land',
  11: 'Drift',
  13: 'Sport',
  14: 'Flip',
  15: 'AutoTune',
  16: 'PosHold',
  17: 'Brake',
  18: 'Throw',
  19: 'Avoid_ADSB',
  20: 'Guided_NoGPS',
  21: 'Smart_RTL',
  22: 'FlowHold',
  23: 'Follow',
  24: 'ZigZag',
  25: 'SystemID',
  26: 'Heli_Autorotate',
  27: 'Auto RTL',
};

// Flight modes for ArduPilot Plane
export const PLANE_MODES: Record<number, string> = {
  0: 'Manual',
  1: 'Circle',
  2: 'Stabilize',
  3: 'Training',
  4: 'Acro',
  5: 'FlyByWireA',
  6: 'FlyByWireB',
  7: 'Cruise',
  8: 'AutoTune',
  10: 'Auto',
  11: 'RTL',
  12: 'Loiter',
  13: 'Takeoff',
  14: 'Avoid_ADSB',
  15: 'Guided',
  17: 'QStabilize',
  18: 'QHover',
  19: 'QLoiter',
  20: 'QLand',
  21: 'QRTL',
  22: 'QAutotune',
  23: 'QAcro',
  24: 'Thermal',
  25: 'Loiter to QLand',
};

// GPS fix type names
export const GPS_FIX_TYPES: Record<number, string> = {
  0: 'No GPS',
  1: 'No Fix',
  2: '2D Fix',
  3: '3D Fix',
  4: 'DGPS',
  5: 'RTK Float',
  6: 'RTK Fixed',
};
