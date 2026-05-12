/**
 * Telemetry data types for vehicle state
 */

import type { VibrationData, EscTelemetryData, ServoOutputData } from './motor-test-types';
export type { VibrationData, EscTelemetryData, EscMotorTelemetry, ServoOutputData } from './motor-test-types';

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
  cellCount?: number;    // number of cells detected
  cellVoltage?: number;  // average voltage per cell
  mahDrawn?: number;     // milliamp-hours consumed
}

export interface VfrHudData {
  airspeed: number;    // m/s
  groundspeed: number; // m/s
  heading: number;     // degrees 0-360
  throttle: number;    // percent 0-100
  alt: number;         // meters
  climb: number;       // m/s
}

export interface WindData {
  direction: number;   // degrees - where wind is coming FROM (0=north, 90=east)
  speed: number;       // m/s ground plane
  speedZ: number;      // m/s vertical
}

export interface FlightState {
  mode: string;
  modeNum: number;
  armed: boolean;
  isFlying: boolean;
  /** Reasons why arming is disabled (from MSP_STATUS_EX) */
  armingDisabledReasons?: string[];
  /** Active sensors bitmask from MSP_STATUS (bit0=ACC, bit1=BARO, bit2=MAG, bit3=GPS, bit4=SONAR, bit5=GYRO) */
  activeSensors?: number;
}

export interface RcChannelsData {
  channels: number[];   // up to 18 channels, raw PWM values (800-2200)
  chancount: number;    // number of active channels
  rssi: number;         // 0-255
}

/** MAVLink SYS_STATUS sensor health bitmasks */
export interface SensorHealth {
  present: number;   // bitmask of sensors present on the vehicle
  enabled: number;   // bitmask of sensors enabled
  health: number;    // bitmask of sensors reporting healthy
}

/** MAV_SYS_STATUS_SENSOR bit positions */
export const SENSOR_BITS = {
  GYRO: 0x01,
  ACCEL: 0x02,
  MAG: 0x04,
  BARO: 0x08,
  GPS: 0x20,
} as const;

export interface TelemetryState {
  // Last update timestamps
  lastHeartbeat: number;
  lastAttitude: number;
  lastPosition: number;
  lastGps: number;
  lastBattery: number;
  lastVfrHud: number;
  lastRcChannels: number;
  lastVibration: number;
  lastEscTelemetry: number;
  lastServoOutput: number;

  // Data
  attitude: AttitudeData;
  position: PositionData;
  gps: GpsData;
  battery: BatteryData;
  vfrHud: VfrHudData;
  wind: WindData;
  flight: FlightState;
  rcChannels: RcChannelsData;
  vibration: VibrationData | null;
  escTelemetry: EscTelemetryData | null;
  servoOutput: ServoOutputData | null;
  sensorHealth: SensorHealth | null;
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

// Flight modes for ArduPilot Rover (also used by Boat)
export const ROVER_MODES: Record<number, string> = {
  0: 'Manual',
  1: 'Acro',
  3: 'Steering',
  4: 'Hold',
  5: 'Loiter',
  6: 'Follow',
  7: 'Simple',
  8: 'Dock',
  9: 'Circle',
  10: 'Auto',
  11: 'RTL',
  12: 'Smart RTL',
  15: 'Guided',
  16: 'Initializing',
};

// Flight modes for ArduPilot Sub
export const SUB_MODES: Record<number, string> = {
  0: 'Stabilize',
  1: 'Acro',
  2: 'AltHold',
  3: 'Auto',
  4: 'Guided',
  7: 'Circle',
  9: 'Surface',
  16: 'PosHold',
  19: 'Manual',
  20: 'MotorDetect',
  21: 'SurfTrak',
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

// ArduPilot vehicle class derived from MAV_TYPE. VTOL is split from plane
// because the destructive commands (takeoff, land, RTL) take a different
// path: plane uses TAKEOFF mode + ground roll, VTOL must use Q-modes /
// NAV_VTOL_TAKEOFF or it will physically crash a tail-standing aircraft.
export type ArduPilotVehicleClass = 'copter' | 'plane' | 'vtol' | 'rover' | 'sub';

/**
 * Optional hints used to upgrade the inferred class beyond what raw MAV_TYPE
 * reports. ArduPlane reports MAV_TYPE=1 (FIXED_WING) on first heartbeat after
 * a wipe even when Q_ENABLE is set; the FCU only re-evaluates type after a
 * reboot. So MAV_TYPE alone is unsafe for gating the takeoff command — a
 * tailsitter pilot would get the fixed-wing TAKEOFF path and tumble.
 */
export interface VehicleClassHints {
  /** Current value of `Q_ENABLE` from the parameter cache, when known. */
  qEnable?: number;
  /** Running SITL frame string when an ArduPilot SITL session is active. */
  sitlFrame?: string;
}

/** Frame strings that imply the vehicle takes off/lands as a VTOL/quadplane. */
const VTOL_SITL_FRAMES: ReadonlySet<string> = new Set([
  'plane-tailsitter',
  'quadplane',
  'quadplane-tilt',
  'quadplane-tilthvec',
  'quadplane-tilttri',
  'quadplane-tilttrivec',
  'quadplane-tri',
  'quadplane-cl84',
  'quadplane-ice',
  'quadplane-can',
  'quadplane-copter_tailsitter',
  'firefly',
]);

export function getVehicleClass(
  mavType: number | undefined,
  hints: VehicleClassHints = {},
): ArduPilotVehicleClass {
  // Strongest VTOL signal: a running SITL frame we know is VTOL. We picked
  // it ourselves so it cannot be wrong.
  if (hints.sitlFrame && VTOL_SITL_FRAMES.has(hints.sitlFrame)) return 'vtol';
  // Q_ENABLE > 0 means the FCU is actively running quadplane code paths,
  // regardless of whether MAV_TYPE has caught up. Trust it over MAV_TYPE.
  if (hints.qEnable !== undefined && hints.qEnable > 0) return 'vtol';
  if (mavType === undefined) return 'copter';
  // VTOL family: dual-rotor, quadrotor, tiltrotor, fixedrotor, tailsitter,
  // tiltwing, reserved. These run ArduPlane firmware but with quad lift.
  if (mavType >= 19 && mavType <= 25) return 'vtol';
  // Pure fixed wing
  if (mavType === 1) return 'plane';
  // Ground rover and boat
  if (mavType === 10 || mavType === 11) return 'rover';
  // Submarine
  if (mavType === 12) return 'sub';
  // Quad, hex, octa, tri, heli, etc.
  return 'copter';
}

/** Convenience: true when the running vehicle uses VTOL/Q-modes for takeoff/land. */
export function isVtolClass(c: ArduPilotVehicleClass): boolean {
  return c === 'vtol';
}

// Per-vehicle capability matrix. Single source of truth for what UI actions
// are available and what mode numbers back them. Add new fields here rather
// than scattering `if (vehicleClass === 'plane')` across the codebase.
export interface VehicleCapabilities {
  /** Stabilization mode number (used as a safe mode to switch to before arming). */
  stabilizeModeNum: number;
  /** Manual mode number (pure passthrough for plane / rover). */
  manualModeNum: number | null;
  /** Guided mode number. */
  guidedModeNum: number;
  /** RTL mode number. */
  rtlModeNum: number;
  /** Does RTL automatically land at home, or just loiter? Plane loiters until landing approach configured. */
  rtlAutoLands: boolean;
  takeoff: {
    supported: boolean;
    /** 'command' = arm+guided+NAV_TAKEOFF (copter / VTOL). 'mode' = switch
     *  to dedicated TAKEOFF mode (plane). */
    method: 'command' | 'mode';
    /** For 'command' method: which MAV_CMD to send.
     *  22 = NAV_TAKEOFF (copter), 84 = NAV_VTOL_TAKEOFF (VTOL/tailsitter).
     *  Defaults to 22 when omitted. */
    commandId?: number;
    /** For 'mode' method: which mode to switch to. */
    modeNum?: number;
    /** For 'mode' method: which param to set with target altitude. */
    altParam?: string;
  };
  land: {
    supported: boolean;
    /** null = no direct land mode, needs approach planning. Number = switch to this mode. */
    modeNum: number | null;
    /** Human-readable label used on the button. */
    label: string;
    /** If false, button should be disabled with a note. */
    disabledReason?: string;
  };
}

export const VEHICLE_CAPABILITIES: Record<ArduPilotVehicleClass, VehicleCapabilities> = {
  copter: {
    stabilizeModeNum: 0,
    manualModeNum: null, // copter has no manual
    guidedModeNum: 4,
    rtlModeNum: 6,
    rtlAutoLands: true,
    takeoff: { supported: true, method: 'command' },
    land: { supported: true, modeNum: 9, label: 'Land' },
  },
  plane: {
    stabilizeModeNum: 2,
    manualModeNum: 0,
    guidedModeNum: 15,
    rtlModeNum: 11,
    rtlAutoLands: false, // plane loiters at home unless RTL_AUTOLAND + DO_LAND_START configured
    takeoff: { supported: true, method: 'mode', modeNum: 13, altParam: 'TKOFF_ALT' },
    // Plane has no one-shot land — needs a NAV_LAND waypoint / landing approach.
    land: {
      supported: false,
      modeNum: null,
      label: 'Land',
      disabledReason: 'Fixed-wing landing requires a mission with NAV_LAND waypoint (or AUTOLAND mode + DO_LAND_START)',
    },
  },
  vtol: {
    // VTOL/quadplane/tailsitter: ArduPlane firmware, but takeoff/land happen
    // in Q-modes. Sending plain plane TAKEOFF (mode 13) to a tail-standing
    // aircraft pitches it forward into the ground.
    stabilizeModeNum: 17, // QSTABILIZE
    manualModeNum: 0,     // MANUAL still works for forward-flight tuning
    guidedModeNum: 15,    // shared with plane; the FCU routes to Q-Guided when in VTOL mode
    rtlModeNum: 21,       // QRTL — flies back, lands vertically at home
    rtlAutoLands: true,
    // GUIDED + MAV_CMD_NAV_VTOL_TAKEOFF: vehicle hovers up to alt, holds
    // position. Subsequent forward transition is the pilot's call.
    takeoff: { supported: true, method: 'command', commandId: 84 },
    land: {
      supported: true,
      modeNum: 20, // QLAND — vertical descent, auto-disarm at touchdown
      label: 'QLand',
    },
  },
  rover: {
    stabilizeModeNum: 0,
    manualModeNum: 0,
    guidedModeNum: 15,
    rtlModeNum: 11,
    rtlAutoLands: false,
    takeoff: { supported: false, method: 'command' },
    land: {
      supported: true,
      modeNum: 4, // HOLD
      label: 'Hold',
    },
  },
  sub: {
    stabilizeModeNum: 0,
    manualModeNum: null,
    guidedModeNum: 4,
    rtlModeNum: 6, // copter-family mode numbers
    rtlAutoLands: false,
    takeoff: { supported: false, method: 'command' },
    land: {
      supported: true,
      modeNum: 9, // Surface
      label: 'Surface',
    },
  },
};
