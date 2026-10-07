/**
 * Telemetry data types for vehicle state
 */

import type { VibrationData, EscTelemetryData, ServoOutputData } from './motor-test-types';
import { t } from './i18n/index.js';
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
  vdop: number;      // vertical dilution of precision (lower is better)
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

/**
 * One battery monitor instance from BATTERY_STATUS (#126: multi-battery
 * systems, e.g. flight pack + MPPT solar input, report one message per
 * configured monitor).
 */
export interface BatteryInstanceData extends BatteryData {
  /** BATTERY_STATUS.id, 0-based monitor index (BATTx params are 1-based). */
  id: number;
  /** degC (omitted when the monitor doesn't report temperature) */
  temperature?: number;
  /** Estimated seconds of charge left (omitted when unknown) */
  timeRemaining?: number;
  /** Renderer-side receive timestamp for per-instance staleness */
  updatedAt: number;
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

/** DISTANCE_SENSOR (132): one rangefinder or one proximity sector. Distances in metres. */
export interface DistanceSensorData {
  distance: number;
  min: number;
  max: number;
  /** MAV_SENSOR_ORIENTATION: 25 down, 24 up, 0-7 yaw sectors 45 degrees apart from the nose. */
  orientation: number;
  /** 1-100, or null when the sensor does not report quality. */
  quality: number | null;
  receivedAt: number;
}

/** MAV_SENSOR_ORIENTATION of a downward rangefinder. */
export const ORIENTATION_DOWN = 25;
export const ORIENTATION_UP = 24;

/** EKF_STATUS_REPORT (193): normalised innovation ratios, where 1 is the rejection limit. */
export interface EkfStatusData {
  velocity: number;
  posHoriz: number;
  posVert: number;
  compass: number;
  terrain: number;
  /** EKF_STATUS_FLAGS bitmask. */
  flags: number;
}

/** NAV_CONTROLLER_OUTPUT (62) - the autopilot's live navigation solution. */
export interface NavControllerData {
  navBearing: number;    // degrees - bearing the nav controller is steering toward
  targetBearing: number; // degrees - bearing to the active waypoint/target
  wpDist: number;        // meters - distance to the active waypoint
  xtrackError: number;   // meters - crosstrack error (signed, + right of track)
  altError: number;      // meters
  aspdError: number;     // m/s
}

/**
 * POSITION_TARGET_GLOBAL_INT (87) - the autopilot's own broadcast of its active
 * guided destination. Authoritative across every GCS on the link: a goto
 * commanded by any GCS shows up here with no app-to-app sync. ArduPilot stops
 * broadcasting once the target clears, so consumers age-gate on receivedAt.
 */
export interface GuidedTargetData {
  lat: number;       // degrees
  lon: number;       // degrees
  alt: number;       // meters, reference depends on frame
  typeMask: number;  // POSITION_TARGET_TYPEMASK; position invalid when (typeMask & 0x3) != 0
  frame: number;     // MAV_FRAME of alt
  receivedAt: number; // ms epoch at decode
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

/** RADIO_STATUS (109) from a telemetry modem (SiK, RFD900, ELRS gateway) */
export interface RadioStatusData {
  rssi: number;      // local receive RSSI, device-scaled 0-254 (255 = unknown)
  remRssi: number;   // remote receive RSSI, same scale
  txbuf: number;     // free tx buffer %, 0-100
  noise: number;     // local background noise
  remNoise: number;  // remote background noise
  rxErrors: number;  // receive error count
  fixed: number;     // errors corrected by FEC
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
  lastGps2: number;
  lastBattery: number;
  lastVfrHud: number;
  lastRcChannels: number;
  lastVibration: number;
  lastEscTelemetry: number;
  lastServoOutput: number;
  lastWind: number;
  lastEkf: number;

  // Data
  attitude: AttitudeData;
  position: PositionData;
  gps: GpsData;
  /** Second GPS receiver (GPS2_RAW). null until a GPS2_RAW message is received. */
  gps2: GpsData | null;
  battery: BatteryData;
  /** All battery monitors seen this session, keyed by BATTERY_STATUS id. */
  batteries: Record<number, BatteryInstanceData>;
  /**
   * Which monitor drives the primary `battery` slot every consumer reads
   * (panel, map gauge, HUD, announcer). null = SYS_STATUS default (battery 1).
   */
  primaryBatteryId: number | null;
  vfrHud: VfrHudData;
  wind: WindData;
  flight: FlightState;
  rcChannels: RcChannelsData;
  radioStatus: RadioStatusData | null;
  vibration: VibrationData | null;
  escTelemetry: EscTelemetryData | null;
  servoOutput: ServoOutputData | null;
  sensorHealth: SensorHealth | null;
  /** null until the vehicle is navigating (NAV_CONTROLLER_OUTPUT received). */
  navController: NavControllerData | null;
  /** null until the vehicle broadcasts a guided target; age-gate on receivedAt. */
  guidedTarget: GuidedTargetData | null;
  /** MAV_VTOL_STATE from EXTENDED_SYS_STATE. null on non-VTOL or before first report. */
  vtolState: VtolState | null;
  /** Downward rangefinder; null until one reports. */
  rangefinder: DistanceSensorData | null;
  /** Proximity sectors by MAV_SENSOR_ORIENTATION (0-7 around, 24 up); stale ones age out by receivedAt. */
  proximity: Record<number, DistanceSensorData>;
  ekf: EkfStatusData | null;
  /** When the vehicle armed this session, for the flight timer; null while disarmed. */
  armedAt: number | null;
}

/** MAV_VTOL_STATE. A quadplane's mode name never says it is mid-transition. */
export enum VtolState {
  Undefined = 0,
  TransitionToFixedWing = 1,
  TransitionToMulticopter = 2,
  Multicopter = 3,
  FixedWing = 4,
}

/** True while the airframe is between hover and wingborne flight. */
export function isTransitioning(state: VtolState | null | undefined): boolean {
  return state === VtolState.TransitionToFixedWing || state === VtolState.TransitionToMulticopter;
}

/** Short label for a HUD or annunciator cell. */
export function vtolStateLabel(state: VtolState | null | undefined): string | null {
  switch (state) {
    case VtolState.Multicopter: return 'HOVER';
    case VtolState.FixedWing: return 'WING';
    case VtolState.TransitionToFixedWing: return 'TO WING';
    case VtolState.TransitionToMulticopter: return 'TO HOVER';
    default: return null;
  }
}

export {
  COPTER_MODES,
  PLANE_MODES,
  ROVER_MODES,
  SUB_MODES,
  PX4_MAIN_MODES,
  getPx4ModeName,
  encodePx4CustomMode,
  PX4_FLIGHT_MODES,
} from '@ardudeck/vehicle-core';

// GPS fix type names
export const GPS_FIX_TYPES: Record<number, string> = {
  0: 'No GPS', // i18n-exempt
  1: 'No Fix', // i18n-exempt
  2: '2D Fix',
  3: '3D Fix',
  4: 'DGPS',
  5: 'RTK Float',
  6: 'RTK Fixed',
};

const GPS_FIX_TYPE_KEYS: Record<number, string> = {
  0: 'shared:telemetryTypes.gpsFix.noGps',
  1: 'shared:telemetryTypes.gpsFix.noFix',
};

export function gpsFixTypeName(fixType: number): string {
  const key = GPS_FIX_TYPE_KEYS[fixType];
  if (key) return t(key);
  return GPS_FIX_TYPES[fixType] ?? t('shared:telemetryTypes.gpsFix.noGps');
}

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
    disabledReasonKey?: string;
  };
}

export function landDisabledReason(land: { disabledReason?: string; disabledReasonKey?: string }): string | undefined {
  return land.disabledReasonKey ? t(land.disabledReasonKey) : land.disabledReason;
}

export const VEHICLE_CAPABILITIES: Record<ArduPilotVehicleClass, VehicleCapabilities> = {
  copter: {
    stabilizeModeNum: 0,
    manualModeNum: null, // copter has no manual
    guidedModeNum: 4,
    rtlModeNum: 6,
    rtlAutoLands: true,
    takeoff: { supported: true, method: 'command' },
    land: { supported: true, modeNum: 9, label: 'Land' }, // i18n-exempt
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
      label: 'Land', // i18n-exempt
      disabledReason: 'Fixed-wing landing requires a mission with NAV_LAND waypoint (or AUTOLAND mode + DO_LAND_START)', // i18n-exempt
      disabledReasonKey: 'shared:telemetryTypes.planeLandDisabled',
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
      label: 'QLand', // i18n-exempt
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
      label: 'Hold', // i18n-exempt
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
      label: 'Surface', // i18n-exempt
    },
  },
};

// Commonly used modes per vehicle class for the Flight Control panel
export const ARDUPILOT_COMMON_MODES: Record<ArduPilotVehicleClass, { name: string; modeNum: number }[]> = {
  copter: [
    { name: 'Stabilize', modeNum: 0 },
    { name: 'AltHold', modeNum: 2 },
    { name: 'Loiter', modeNum: 5 },
    { name: 'PosHold', modeNum: 16 },
    { name: 'Auto', modeNum: 3 },
    { name: 'Guided', modeNum: 4 },
    { name: 'RTL', modeNum: 6 },
    { name: 'Land', modeNum: 9 },
  ],
  plane: [
    { name: 'Manual', modeNum: 0 },
    { name: 'Stabilize', modeNum: 2 },
    { name: 'FlyByWireA', modeNum: 5 },
    { name: 'Loiter', modeNum: 12 },
    { name: 'Auto', modeNum: 10 },
    { name: 'Guided', modeNum: 15 },
    { name: 'RTL', modeNum: 11 },
    { name: 'Circle', modeNum: 1 },
  ],
  // VTOL: lead with Q-modes (priority for hover/takeoff/land), keep MANUAL +
  // FBWA + AUTO/GUIDED for forward-flight, and surface RTL/QRTL last. MANUAL
  // is the always-works escape hatch — without it, a tailsitter pilot has no
  // way out of a Q-mode the FCU is rejecting (e.g. when Q_ENABLE didn't
  // apply yet or pre-arm is blocking everything).
  vtol: [
    { name: 'QStabilize', modeNum: 17 },
    { name: 'QHover',     modeNum: 18 },
    { name: 'QLoiter',    modeNum: 19 },
    { name: 'QLand',      modeNum: 20 },
    { name: 'QRTL',       modeNum: 21 },
    { name: 'Manual',     modeNum: 0  },
    { name: 'FBWA',       modeNum: 5  },
    { name: 'Auto',       modeNum: 10 },
    { name: 'Guided',     modeNum: 15 },
  ],
  rover: [
    { name: 'Manual', modeNum: 0 },
    { name: 'Hold', modeNum: 4 },
    { name: 'Loiter', modeNum: 5 },
    { name: 'Auto', modeNum: 10 },
    { name: 'Guided', modeNum: 15 },
    { name: 'RTL', modeNum: 11 },
  ],
  sub: [
    { name: 'Stabilize', modeNum: 0 },
    { name: 'AltHold', modeNum: 2 },
    { name: 'PosHold', modeNum: 16 },
    { name: 'Auto', modeNum: 3 },
    { name: 'Guided', modeNum: 4 },
    { name: 'Surface', modeNum: 9 },
  ],
};
