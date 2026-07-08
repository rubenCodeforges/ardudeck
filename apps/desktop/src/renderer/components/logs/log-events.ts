// Decodes ArduPilot dataflash ERR / EV / MSG / MODE / CMD records into a
// human-readable, severity-graded event timeline. Pure (no DOM/store imports)
// so it is unit-testable and shareable between the events panel and the chart.

import { COPTER_MODE_NAMES, PLANE_MODE_NAMES, ROVER_MODE_NAMES } from '@ardudeck/dataflash-parser';

export const COPTER_MODES = COPTER_MODE_NAMES;

/**
 * Mode number -> name, using the log's vehicle type to pick the right table.
 * The same number means different modes per vehicle (10 = plane/rover AUTO,
 * 11 = copter DRIFT but plane/rover RTL), so defaulting to the copter table
 * mislabels plane and rover logs.
 */
export function getModeName(modeNum: number, vehicleType?: string): string {
  const map = vehicleType === 'plane' ? PLANE_MODE_NAMES
    : vehicleType === 'rover' ? ROVER_MODE_NAMES
    : COPTER_MODE_NAMES;
  return map[modeNum] ?? `MODE_${modeNum}`;
}

export const MODE_COLORS: Record<string, string> = {
  STABILIZE: '#6b7280', ALT_HOLD: '#3b82f6', LOITER: '#10b981', AUTO: '#8b5cf6',
  RTL: '#f59e0b', LAND: '#ef4444', GUIDED: '#ec4899', POSHOLD: '#06b6d4',
  ACRO: '#f97316', CIRCLE: '#84cc16', BRAKE: '#6366f1', SMART_RTL: '#fbbf24',
  MANUAL: '#6b7280', CRUISE: '#06b6d4', FBWA: '#3b82f6', FBWB: '#0ea5e9',
  STEERING: '#3b82f6', HOLD: '#6366f1', TAKEOFF: '#84cc16', QLOITER: '#10b981',
};

/** ArduPilot LogErrorSubsystem ids (AP_Logger). */
const ERR_SUBSYSTEMS: Record<number, string> = {
  1: 'Main', 2: 'Radio', 3: 'Compass', 4: 'Optical flow',
  5: 'Radio failsafe', 6: 'Battery failsafe', 8: 'GCS failsafe',
  9: 'Fence failsafe', 10: 'Flight mode', 11: 'GPS', 12: 'Crash check',
  13: 'Flip', 15: 'Parachute', 16: 'EKF check', 17: 'EKF failsafe',
  18: 'Baro', 19: 'CPU load', 20: 'ADSB failsafe', 21: 'Terrain',
  22: 'Navigation', 23: 'Terrain failsafe', 24: 'EKF primary',
  25: 'Thrust loss check', 26: 'Sensor failsafe', 27: 'Leak failsafe',
  28: 'Pilot input', 29: 'Vibration failsafe', 30: 'Internal error',
  31: 'Dead-reckoning failsafe',
};

/** Per-subsystem error-code meanings; generic fallbacks below. */
const ERR_CODES_BY_SUBSYS: Record<number, Record<number, string>> = {
  2: { 2: 'late frame' },
  11: { 2: 'GPS glitch', 0: 'glitch cleared' },
  12: { 1: 'CRASH DETECTED', 2: 'loss of control' },
  16: { 2: 'bad variance', 0: 'variance cleared' },
  18: { 2: 'baro glitch', 0: 'glitch cleared' },
  25: { 1: 'THRUST LOSS' },
};

const ERR_CODES_GENERIC: Record<number, string> = {
  0: 'resolved',
  1: 'triggered',
  4: 'unhealthy',
};

/** ArduPilot LogEvent ids (AP_Logger LogEvent enum). */
const EV_NAMES: Record<number, string> = {
  10: 'Armed', 11: 'Disarmed', 15: 'Auto armed',
  17: 'Land complete (maybe)', 18: 'Land complete', 19: 'Lost GPS',
  21: 'Flip start', 22: 'Flip end', 25: 'Home set',
  26: 'Simple mode on', 27: 'Simple mode off', 28: 'Not landed',
  29: 'Super simple mode on',
  30: 'AutoTune initialised', 31: 'AutoTune off', 32: 'AutoTune restart',
  33: 'AutoTune success', 34: 'AutoTune failed', 35: 'AutoTune reached limit',
  36: 'AutoTune pilot testing', 37: 'AutoTune gains saved',
  38: 'Trim saved', 39: 'Waypoint saved',
  41: 'Fence enabled', 42: 'Fence disabled',
  43: 'Acro trainer off', 44: 'Acro trainer leveling', 45: 'Acro trainer limited',
  46: 'Gripper grab', 47: 'Gripper release',
  49: 'Parachute disabled', 50: 'Parachute enabled', 51: 'PARACHUTE RELEASED',
  52: 'Landing gear deployed', 53: 'Landing gear retracted',
  54: 'MOTORS EMERGENCY STOPPED', 55: 'Motors emergency stop cleared',
  56: 'Motors interlock disabled', 57: 'Motors interlock enabled',
  58: 'Rotor runup complete', 59: 'ROTOR SPEED BELOW CRITICAL',
  60: 'EKF altitude reset', 61: 'Land cancelled by pilot', 62: 'EKF yaw reset',
  63: 'ADSB avoidance enabled', 64: 'ADSB avoidance disabled',
  65: 'Proximity avoidance enabled', 66: 'Proximity avoidance disabled',
  67: 'GPS primary changed',
  71: 'ZigZag point A stored', 72: 'ZigZag point B stored',
  73: 'Land repositioning active', 74: 'Standby enabled', 75: 'Standby disabled',
};

/** Event ids that deserve attention even though they are "events" not errors. */
const EV_WARN_IDS = new Set([19, 51, 54, 59, 60, 62]);

/** MSG text that indicates a problem rather than chatter. */
const MSG_WARN_RE = /prearm|pre-arm|failsafe|fail|error|crash|glitch|variance|unhealthy|leak|lost|timeout|emergency/i;

export type LogEventKind = 'ERR' | 'EV' | 'MSG' | 'MODE' | 'CMD';
export type LogEventSeverity = 'error' | 'warn' | 'info';

export interface LogEventEntry {
  timeS: number;
  kind: LogEventKind;
  severity: LogEventSeverity;
  label: string;
  detail?: string;
}

type LogMessages = Record<string, { type: string; timeUs: number; fields: Record<string, number | string> }[]>;

export function decodeErr(subsys: number, ecode: number, vehicleType?: string): { label: string; detail: string; severity: LogEventSeverity } {
  const label = ERR_SUBSYSTEMS[subsys] ?? `Subsystem ${subsys}`;
  let detail: string;
  if (subsys === 10) {
    // Flight mode subsystem: the code is the mode number that was refused.
    detail = `cannot enter ${getModeName(ecode, vehicleType)}`;
  } else {
    detail = ERR_CODES_BY_SUBSYS[subsys]?.[ecode] ?? ERR_CODES_GENERIC[ecode] ?? `code ${ecode}`;
  }
  return { label, detail, severity: ecode === 0 ? 'info' : 'error' };
}

export function decodeEv(id: number): { label: string; severity: LogEventSeverity } {
  return { label: EV_NAMES[id] ?? `Event ${id}`, severity: EV_WARN_IDS.has(id) ? 'warn' : 'info' };
}

/**
 * Flattens ERR/EV/MSG/MODE/CMD records into one chronological event list.
 * MP buries these in separate raw tabs; here they are one severity-graded
 * timeline the user can filter and click to jump the charts to.
 */
export function extractLogEvents(log: { messages: LogMessages; metadata?: { vehicleType?: string } }): LogEventEntry[] {
  const out: LogEventEntry[] = [];
  const vehicleType = log.metadata?.vehicleType;

  for (const m of log.messages['ERR'] ?? []) {
    const subsys = typeof m.fields['Subsys'] === 'number' ? m.fields['Subsys'] : -1;
    const ecode = typeof m.fields['ECode'] === 'number' ? m.fields['ECode'] : -1;
    const d = decodeErr(subsys, ecode, vehicleType);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'ERR', severity: d.severity, label: d.label, detail: d.detail });
  }

  for (const m of log.messages['EV'] ?? []) {
    const id = typeof m.fields['Id'] === 'number' ? m.fields['Id'] : -1;
    const d = decodeEv(id);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'EV', severity: d.severity, label: d.label });
  }

  for (const m of log.messages['MSG'] ?? []) {
    const text = typeof m.fields['Message'] === 'string' ? m.fields['Message'] : '';
    if (!text) continue;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MSG',
      severity: MSG_WARN_RE.test(text) ? 'warn' : 'info',
      label: text,
    });
  }

  for (const m of log.messages['MODE'] ?? []) {
    const modeNum = (typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']);
    const name = typeof modeNum === 'number' ? getModeName(modeNum, vehicleType) : String(m.fields['Mode'] ?? '?');
    const rsn = m.fields['Rsn'];
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MODE',
      severity: 'info',
      label: `Mode: ${name}`,
      detail: typeof rsn === 'number' ? `reason ${rsn}` : undefined,
    });
  }

  for (const m of log.messages['CMD'] ?? []) {
    const num = m.fields['CNum'];
    const name = typeof m.fields['CName'] === 'string' ? m.fields['CName'] : `cmd ${m.fields['CId'] ?? '?'}`;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'CMD',
      severity: 'info',
      label: typeof num === 'number' ? `WP ${num}: ${name}` : String(name),
    });
  }

  out.sort((a, b) => a.timeS - b.timeS);
  return out;
}

/** mm:ss.s for event timestamps (logs run minutes to hours). */
export function fmtEventTime(timeS: number): string {
  const mm = Math.floor(timeS / 60);
  const ss = timeS - mm * 60;
  return `${mm}:${ss < 10 ? '0' : ''}${ss.toFixed(1)}`;
}
