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

import type { ArduPilotVehicleClass } from './telemetry-types';

export type ModeGroup = 'manual' | 'assisted' | 'auto' | 'return' | 'tuning';

export interface FlightModeMeta {
  modeNum: number;
  name: string;
  group: ModeGroup;
  gps?: boolean;
  fly?: boolean;
  commit?: boolean;
}

export const GROUP_LABEL: Record<ModeGroup, string> = {
  manual: 'Manual / Acro',
  assisted: 'Assisted',
  auto: 'Autonomous / Nav',
  return: 'Return & Land',
  tuning: 'Tuning',
};

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
  m(21, 'Smart RTL', 'return', { gps: true, fly: true, commit: true }),
  m(27, 'Auto RTL', 'return', { gps: true, fly: true, commit: true }),
  m(9, 'Land', 'return', { fly: true, commit: true }),
  m(19, 'Avoid ADSB', 'return', { gps: true, fly: true }),
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
  m(14, 'Avoid ADSB', 'return', { gps: true, fly: true }),
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
  m(25, 'Loiter to QLand', 'return', { gps: true, fly: true, commit: true }),
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
  m(12, 'Smart RTL', 'return', { gps: true, commit: true }),
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

export function modeMetaFor(
  vehicleClass: ArduPilotVehicleClass,
  modeNum: number | undefined,
): FlightModeMeta | undefined {
  if (modeNum === undefined) return undefined;
  return FLIGHT_MODES[vehicleClass].find((mm) => mm.modeNum === modeNum);
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
  if (meta.gps && !ctx.gpsOk) return 'Needs GPS / position lock';
  if (meta.fly && !ctx.armed) return 'Vehicle must be armed';
  return null;
}

/** One-line context under the annunciator: group + the notable preconditions. */
export function modeSubline(meta: FlightModeMeta | undefined): string {
  if (!meta) return '';
  const bits: string[] = [GROUP_LABEL[meta.group]];
  bits.push(meta.gps ? 'GPS' : 'no GPS needed');
  if (meta.fly) bits.push('in-flight');
  if (meta.commit) bits.push('commit');
  return bits.join(' · ');
}
