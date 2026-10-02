/**
 * Flight-mode metadata: grouping + safety preconditions for the Flight Control
 * panel's mode picker and annunciator.
 *
 * The raw mode name tables (COPTER_MODES etc. in telemetry-types) map number ->
 * label. This adds the two things the UI needs on top of that:
 *   - a coarse GROUP so ~27 modes scan as a handful of labelled sections
 *   - PRECONDITION flags so a mode that can't work right now is greyed with a
 *     reason instead of silently failing when the FC rejects it.
 *
 * Flags:
 *   gps    - needs a position estimate (GPS / EKF). Greyed until 3D fix.
 *   fly    - only meaningful once the vehicle is armed and moving (airborne for
 *            air vehicles, driving for ground). Greyed on the ground.
 *   commit - hard to undo / safety-relevant (RTL, Land, Auto...). The picker
 *            asks for one confirm before sending, so a mis-click can't fire it.
 */

import { encodePx4CustomMode, getVehicleClass, type ArduPilotVehicleClass } from './telemetry-types';
import { t } from './i18n/index.js';

export type ModeGroup = 'manual' | 'assisted' | 'auto' | 'return' | 'tuning';

export interface FlightModeMeta {
  modeNum: number;
  name: string;
  group: ModeGroup;
  gps?: boolean;
  fly?: boolean;
  commit?: boolean;
}

export function modeGroupLabel(group: ModeGroup): string {
  return t(`shared:flightModeMeta.group.${group}`);
}

export const GROUP_ORDER: readonly ModeGroup[] = ['manual', 'assisted', 'auto', 'return', 'tuning'];

const m = (
  modeNum: number,
  name: string,
  group: ModeGroup,
  flags: Omit<FlightModeMeta, 'modeNum' | 'name' | 'group'> = {},
): FlightModeMeta => ({ modeNum, name, group, ...flags });

const COPTER: FlightModeMeta[] = [
  m(0, 'Stabilize', 'manual'),
  m(1, 'Acro', 'manual'),
  m(13, 'Sport', 'manual'),
  m(11, 'Drift', 'manual'),
  m(14, 'Flip', 'manual', { fly: true }),
  m(2, 'AltHold', 'assisted'),
  m(5, 'Loiter', 'assisted', { gps: true }),
  m(16, 'PosHold', 'assisted', { gps: true }),
  m(22, 'FlowHold', 'assisted', { gps: true }),
  m(17, 'Brake', 'assisted', { gps: true, fly: true }),
  m(3, 'Auto', 'auto', { gps: true, fly: true, commit: true }),
  m(4, 'Guided', 'auto', { gps: true, fly: true, commit: true }),
  m(20, 'Guided_NoGPS', 'auto', { fly: true }),
  m(7, 'Circle', 'auto', { gps: true, fly: true }),
  m(23, 'Follow', 'auto', { gps: true, fly: true }),
  m(24, 'ZigZag', 'auto', { gps: true, fly: true }),
  m(18, 'Throw', 'auto', { gps: true }),
  m(6, 'RTL', 'return', { gps: true, fly: true, commit: true }),
  m(21, 'Smart RTL', 'return', { gps: true, fly: true, commit: true }), // i18n-exempt
  m(27, 'Auto RTL', 'return', { gps: true, fly: true, commit: true }), // i18n-exempt
  m(9, 'Land', 'return', { fly: true, commit: true }),
  m(19, 'Avoid ADSB', 'return', { gps: true, fly: true }), // i18n-exempt
  m(15, 'AutoTune', 'tuning', { fly: true }),
  m(25, 'SystemID', 'tuning'),
  m(26, 'Autorotate', 'tuning', { fly: true }),
];

const PLANE: FlightModeMeta[] = [
  m(0, 'Manual', 'manual'),
  m(2, 'Stabilize', 'manual'),
  m(4, 'Acro', 'manual'),
  m(3, 'Training', 'manual'),
  m(5, 'FlyByWireA', 'assisted'),
  m(6, 'FlyByWireB', 'assisted'),
  m(7, 'Cruise', 'assisted', { gps: true }),
  m(1, 'Circle', 'assisted'),
  m(12, 'Loiter', 'assisted', { gps: true, fly: true }),
  m(24, 'Thermal', 'assisted', { gps: true, fly: true }),
  m(10, 'Auto', 'auto', { gps: true, fly: true, commit: true }),
  m(13, 'Takeoff', 'auto', { gps: true, fly: true, commit: true }),
  m(15, 'Guided', 'auto', { gps: true, fly: true, commit: true }),
  m(11, 'RTL', 'return', { gps: true, fly: true, commit: true }),
  m(14, 'Avoid ADSB', 'return', { gps: true, fly: true }), // i18n-exempt
  m(8, 'AutoTune', 'tuning', { fly: true }),
];

const VTOL: FlightModeMeta[] = [
  m(17, 'QStabilize', 'manual'),
  m(23, 'QAcro', 'manual'),
  m(0, 'Manual', 'manual'),
  m(2, 'Stabilize', 'manual'),
  m(4, 'Acro', 'manual'),
  m(18, 'QHover', 'assisted'),
  m(19, 'QLoiter', 'assisted', { gps: true }),
  m(5, 'FlyByWireA', 'assisted'),
  m(6, 'FlyByWireB', 'assisted'),
  m(7, 'Cruise', 'assisted', { gps: true }),
  m(12, 'Loiter', 'assisted', { gps: true, fly: true }),
  m(10, 'Auto', 'auto', { gps: true, fly: true, commit: true }),
  m(13, 'Takeoff', 'auto', { gps: true, fly: true, commit: true }),
  m(15, 'Guided', 'auto', { gps: true, fly: true, commit: true }),
  m(11, 'RTL', 'return', { gps: true, fly: true, commit: true }),
  m(21, 'QRTL', 'return', { gps: true, fly: true, commit: true }),
  m(20, 'QLand', 'return', { fly: true, commit: true }),
  m(25, 'Loiter to QLand', 'return', { gps: true, fly: true, commit: true }), // i18n-exempt
  m(8, 'AutoTune', 'tuning', { fly: true }),
  m(22, 'QAutotune', 'tuning', { gps: true, fly: true }),
];

const ROVER: FlightModeMeta[] = [
  m(0, 'Manual', 'manual'),
  m(1, 'Acro', 'manual'),
  m(3, 'Steering', 'manual'),
  m(7, 'Simple', 'assisted', { gps: true }),
  m(4, 'Hold', 'assisted'),
  m(5, 'Loiter', 'assisted', { gps: true }),
  m(6, 'Follow', 'auto', { gps: true }),
  m(9, 'Circle', 'auto', { gps: true }),
  m(8, 'Dock', 'auto', { gps: true, commit: true }),
  m(10, 'Auto', 'auto', { gps: true, commit: true }),
  m(15, 'Guided', 'auto', { gps: true, commit: true }),
  m(11, 'RTL', 'return', { gps: true, commit: true }),
  m(12, 'Smart RTL', 'return', { gps: true, commit: true }), // i18n-exempt
];

const SUB: FlightModeMeta[] = [
  m(0, 'Stabilize', 'manual'),
  m(1, 'Acro', 'manual'),
  m(19, 'Manual', 'manual'),
  m(2, 'AltHold', 'assisted'),
  m(16, 'PosHold', 'assisted', { gps: true }),
  m(21, 'SurfTrak', 'assisted'),
  m(3, 'Auto', 'auto', { gps: true, commit: true }),
  m(4, 'Guided', 'auto', { gps: true, commit: true }),
  m(7, 'Circle', 'auto', { gps: true }),
  m(9, 'Surface', 'return', { commit: true }),
  m(20, 'MotorDetect', 'tuning'),
];

export const FLIGHT_MODES: Record<ArduPilotVehicleClass, FlightModeMeta[]> = {
  copter: COPTER,
  plane: PLANE,
  vtol: VTOL,
  rover: ROVER,
  sub: SUB,
};

// PX4 has one mode vocabulary across vehicle types. modeNum here is the
// ENCODED custom_mode ((main<<16)|(sub<<24)) — the same value HEARTBEAT echoes
// back in flight.modeNum and the same value the DO_SET_MODE path unpacks, so
// the picker plugs into the existing selection flow unchanged.
const px4 = (main: number, sub: number, name: string, group: ModeGroup, flags: Omit<FlightModeMeta, 'modeNum' | 'name' | 'group'> = {}) =>
  m(encodePx4CustomMode(main, sub), name, group, flags);

export const PX4_FLIGHT_MODES: FlightModeMeta[] = [
  px4(1, 0, 'Manual', 'manual'),
  px4(7, 0, 'Stabilized', 'manual'),
  px4(5, 0, 'Acro', 'manual', { commit: true }),
  px4(2, 0, 'Altitude', 'assisted'),
  px4(3, 0, 'Position', 'assisted', { gps: true }),
  px4(4, 3, 'Hold', 'auto', { gps: true }),
  px4(4, 4, 'Mission', 'auto', { gps: true, commit: true }),
  px4(4, 2, 'Takeoff', 'auto', { gps: true, commit: true }),
  px4(6, 0, 'Offboard', 'auto', { commit: true }),
  px4(4, 5, 'Return', 'return', { gps: true, commit: true }),
  px4(4, 6, 'Land', 'return', { commit: true }),
];

export function modeMetaFor(
  vehicleClass: ArduPilotVehicleClass,
  modeNum: number | undefined,
  firmware?: string,
): FlightModeMeta | undefined {
  if (modeNum === undefined) return undefined;
  const table = firmware === 'px4' ? PX4_FLIGHT_MODES : FLIGHT_MODES[vehicleClass];
  return table.find((mm) => mm.modeNum === modeNum);
}

const PILOT_THROTTLE_GROUPS: ReadonlySet<ModeGroup> = new Set(['manual', 'assisted', 'tuning']);

/**
 * True for multirotor modes where the PILOT commands throttle (Stabilize,
 * AltHold, Loiter, PosHold, AutoTune...). Switching into one of these from a
 * GCS-controlled hover with no transmitter hands throttle to an RC stick that's
 * sitting at idle, so the mode drops the aircraft (or, like AUTOTUNE, refuses to
 * init). Callers can use this to seed a hover RC override in SITL. Autonomous
 * modes (Auto/Guided/RTL/Land...) keep FC-controlled throttle, so they're false.
 */
export function isPilotThrottleMode(vehicleClass: ArduPilotVehicleClass, modeNum: number): boolean {
  if (vehicleClass !== 'copter') return false; // hover-hold only meaningful for multirotor
  const meta = modeMetaFor(vehicleClass, modeNum);
  return !!meta && PILOT_THROTTLE_GROUPS.has(meta.group);
}

export interface ModeGateContext {
  /** A usable position estimate is available (3D fix / EKF happy). */
  gpsOk: boolean;
  /** Vehicle is armed. `fly` modes are pointless / rejected while disarmed, but
   *  we intentionally do NOT require airborne - selecting Guided/Auto armed on
   *  the ground is the normal guided-takeoff / mission-start flow. */
  armed: boolean;
}

/** Why a mode can't be selected right now, or null if it can. */
export function modeBlockedReason(meta: FlightModeMeta, ctx: ModeGateContext): string | null {
  if (meta.gps && !ctx.gpsOk) return t('shared:flightModeMeta.needsGps');
  if (meta.fly && !ctx.armed) return t('shared:flightModeMeta.mustBeArmed');
  return null;
}

// AUTO + pause mode numbers per vehicle class. Pause mode is whichever holds
// position cleanly without giving up the mission (BRAKE on copter, LOITER on
// plane, HOLD on rover, POSHOLD on sub); switching back to AUTO resumes.
// `abort` is the mode a mission Abort drops into: a return-to-launch for the
// vehicles that have one, and a clean position hold for Sub (ArduSub has no
// RTL). Shared by FlightControlPanel and the map flight-control instrument.
export const MISSION_MODES: Record<ArduPilotVehicleClass, { auto: number; pause: number; pauseLabel: string; abort: number; abortLabel: string }> = {
  copter: { auto: 3,  pause: 17, pauseLabel: 'Brake',   abort: 6,  abortLabel: 'RTL'     },
  plane:  { auto: 10, pause: 12, pauseLabel: 'Loiter',  abort: 11, abortLabel: 'RTL'     },
  // VTOL pause = QLOITER (19): vertical position hold without giving up the
  // mission. Q-modes auto-disarm-tolerant in a way fixed-wing LOITER isn't
  // for tailsitters. Abort = QRTL (21): a vertical return, safer than plane RTL.
  vtol:   { auto: 10, pause: 19, pauseLabel: 'QLoiter', abort: 21, abortLabel: 'QRTL'    },
  rover:  { auto: 10, pause: 4,  pauseLabel: 'Hold',    abort: 11, abortLabel: 'RTL'     },
  sub:    { auto: 3,  pause: 16, pauseLabel: 'PosHold', abort: 16, abortLabel: 'PosHold' },
};

/** One-line context under the annunciator: group + the notable preconditions. */
export function modeSubline(meta: FlightModeMeta | undefined): string {
  if (!meta) return '';
  const bits: string[] = [modeGroupLabel(meta.group)];
  bits.push(meta.gps ? t('shared:flightModeMeta.gps') : t('shared:flightModeMeta.noGps'));
  if (meta.fly) bits.push(t('shared:flightModeMeta.inFlight'));
  if (meta.commit) bits.push(t('shared:flightModeMeta.commit'));
  return bits.join(' · ');
}

/**
 * Flight modes a vehicle declared about itself, as the picker wants them.
 *
 * Without this a third firmware falls through to `FLIGHT_MODES[vehicleClass]`, so a boat
 * is offered ArduPilot's rover modes and pressing one sends a number that means something
 * different on the vehicle. That is worse than an empty picker.
 *
 * The group is a guess from the name, because the profile does not carry one: modes are
 * only grouped to keep a long list readable, and a wrong heading is cosmetic where a
 * wrong mode number is not. `AD_MODE_LOCAL_ONLY` modes are dropped entirely, since the
 * vehicle said the ground station may not command them.
 */
export function modesFromProfile(
  modes: ReadonlyArray<{ id: number; name: string; flags: number }>,
): FlightModeMeta[] {
  const AD_MODE_LOCAL_ONLY = 1 << 0;

  const guessGroup = (name: string): ModeGroup => {
    const n = name.toLowerCase();
    if (/return|rtl|home|land/.test(n)) return 'return';
    if (/manual|acro|stab/.test(n)) return 'manual';
    if (/auto|mission|guided|run|survey|nav/.test(n)) return 'auto';
    if (/tune/.test(n)) return 'tuning';
    return 'assisted';
  };

  return modes
    .filter((m) => (m.flags & AD_MODE_LOCAL_ONLY) === 0 && m.name.trim() !== '')
    .map((m) => ({ modeNum: m.id, name: m.name, group: guessGroup(m.name) }));
}

/**
 * The mode to select before starting a mission, or null when there is nothing safe to send.
 *
 * Mode numbers are a firmware family's private convention. ArduPilot and PX4 are known,
 * so their numbers come from the tables here. Any other firmware numbers its own modes
 * and has to say which one flies a mission; without that, sending an ArduPilot number
 * would command whatever that vehicle happens to number the same, which is how a boat
 * ends up being told to enter Rover's AUTO.
 *
 * `autopilot` is MAV_AUTOPILOT from the heartbeat. Anything that is neither PX4 nor
 * generic is treated as ArduPilot, which is what every vehicle got before this existed.
 */
export function missionAutoMode(
  autopilot: number,
  mavType: number,
  declaredMissionMode: number | null,
): number | null {
  if (autopilot === 12) return encodePx4CustomMode(4, 4); // PX4 AUTO_MISSION
  if (autopilot === 0) return declaredMissionMode;        // third-party: only what it declared
  return MISSION_MODES[getVehicleClass(mavType)].auto;
}
