// Decodes ArduPilot dataflash ERR / EV / MSG / MODE / CMD records into a
// human-readable, severity-graded event timeline. Pure (no DOM/store imports)
// so it is unit-testable and shareable between the events panel and the chart.

import { COPTER_MODE_NAMES, PLANE_MODE_NAMES, ROVER_MODE_NAMES } from '@ardudeck/dataflash-parser';
import { logRows, type LogColumns } from '../../utils/log-columns';
import { t } from '../../../shared/i18n/index.js';

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
  1: 'logs:logEvents.subsys.1', 2: 'logs:logEvents.subsys.2', 3: 'logs:logEvents.subsys.3', 4: 'logs:logEvents.subsys.4',
  5: 'logs:logEvents.subsys.5', 6: 'logs:logEvents.subsys.6', 8: 'logs:logEvents.subsys.8',
  9: 'logs:logEvents.subsys.9', 10: 'logs:logEvents.subsys.10', 11: 'logs:logEvents.subsys.11', 12: 'logs:logEvents.subsys.12',
  13: 'logs:logEvents.subsys.13', 15: 'logs:logEvents.subsys.15', 16: 'logs:logEvents.subsys.16', 17: 'logs:logEvents.subsys.17',
  18: 'logs:logEvents.subsys.18', 19: 'logs:logEvents.subsys.19', 20: 'logs:logEvents.subsys.20', 21: 'logs:logEvents.subsys.21',
  22: 'logs:logEvents.subsys.22', 23: 'logs:logEvents.subsys.23', 24: 'logs:logEvents.subsys.24',
  25: 'logs:logEvents.subsys.25', 26: 'logs:logEvents.subsys.26', 27: 'logs:logEvents.subsys.27',
  28: 'logs:logEvents.subsys.28', 29: 'logs:logEvents.subsys.29', 30: 'logs:logEvents.subsys.30',
  31: 'logs:logEvents.subsys.31',
};

/** Per-subsystem error-code meanings; generic fallbacks below. */
const ERR_CODES_BY_SUBSYS: Record<number, Record<number, string>> = {
  2: { 2: 'logs:logEvents.subsysCode.2.2' },
  11: { 2: 'logs:logEvents.subsysCode.11.2', 0: 'logs:logEvents.subsysCode.11.0' },
  12: { 1: 'logs:logEvents.subsysCode.12.1', 2: 'logs:logEvents.subsysCode.12.2' },
  16: { 2: 'logs:logEvents.subsysCode.16.2', 0: 'logs:logEvents.subsysCode.16.0' },
  18: { 2: 'logs:logEvents.subsysCode.18.2', 0: 'logs:logEvents.subsysCode.18.0' },
  25: { 1: 'logs:logEvents.subsysCode.25.1' },
};

const ERR_CODES_GENERIC: Record<number, string> = {
  0: 'logs:logEvents.errCode.0',
  1: 'logs:logEvents.errCode.1',
  4: 'logs:logEvents.errCode.4',
};

/** ArduPilot LogEvent ids (AP_Logger LogEvent enum). */
const EV_NAMES: Record<number, string> = {
  10: 'logs:logEvents.ev.10', 11: 'logs:logEvents.ev.11', 15: 'logs:logEvents.ev.15',
  17: 'logs:logEvents.ev.17', 18: 'logs:logEvents.ev.18', 19: 'logs:logEvents.ev.19',
  21: 'logs:logEvents.ev.21', 22: 'logs:logEvents.ev.22', 25: 'logs:logEvents.ev.25',
  26: 'logs:logEvents.ev.26', 27: 'logs:logEvents.ev.27', 28: 'logs:logEvents.ev.28',
  29: 'logs:logEvents.ev.29',
  30: 'logs:logEvents.ev.30', 31: 'logs:logEvents.ev.31', 32: 'logs:logEvents.ev.32',
  33: 'logs:logEvents.ev.33', 34: 'logs:logEvents.ev.34', 35: 'logs:logEvents.ev.35',
  36: 'logs:logEvents.ev.36', 37: 'logs:logEvents.ev.37',
  38: 'logs:logEvents.ev.38', 39: 'logs:logEvents.ev.39',
  41: 'logs:logEvents.ev.41', 42: 'logs:logEvents.ev.42',
  43: 'logs:logEvents.ev.43', 44: 'logs:logEvents.ev.44', 45: 'logs:logEvents.ev.45',
  46: 'logs:logEvents.ev.46', 47: 'logs:logEvents.ev.47',
  49: 'logs:logEvents.ev.49', 50: 'logs:logEvents.ev.50', 51: 'logs:logEvents.ev.51',
  52: 'logs:logEvents.ev.52', 53: 'logs:logEvents.ev.53',
  54: 'logs:logEvents.ev.54', 55: 'logs:logEvents.ev.55',
  56: 'logs:logEvents.ev.56', 57: 'logs:logEvents.ev.57',
  58: 'logs:logEvents.ev.58', 59: 'logs:logEvents.ev.59',
  60: 'logs:logEvents.ev.60', 61: 'logs:logEvents.ev.61', 62: 'logs:logEvents.ev.62',
  63: 'logs:logEvents.ev.63', 64: 'logs:logEvents.ev.64',
  65: 'logs:logEvents.ev.65', 66: 'logs:logEvents.ev.66',
  67: 'logs:logEvents.ev.67',
  71: 'logs:logEvents.ev.71', 72: 'logs:logEvents.ev.72',
  73: 'logs:logEvents.ev.73', 74: 'logs:logEvents.ev.74', 75: 'logs:logEvents.ev.75',
};

/** ArduPilot ModeReason enum: why the vehicle changed flight mode. */
const MODE_REASONS: Record<number, string> = {
  0: 'logs:logEvents.modeReason.0', 1: 'logs:logEvents.modeReason.1', 2: 'logs:logEvents.modeReason.2', 3: 'logs:logEvents.modeReason.3',
  4: 'logs:logEvents.modeReason.4', 5: 'logs:logEvents.modeReason.5', 6: 'logs:logEvents.modeReason.6', 7: 'logs:logEvents.modeReason.7',
  8: 'logs:logEvents.modeReason.8', 9: 'logs:logEvents.modeReason.9', 10: 'logs:logEvents.modeReason.10',
  11: 'logs:logEvents.modeReason.11', 12: 'logs:logEvents.modeReason.12', 13: 'logs:logEvents.modeReason.13',
  14: 'logs:logEvents.modeReason.14', 15: 'logs:logEvents.modeReason.15', 16: 'logs:logEvents.modeReason.16',
  17: 'logs:logEvents.modeReason.17', 18: 'logs:logEvents.modeReason.18', 19: 'logs:logEvents.modeReason.19', 20: 'logs:logEvents.modeReason.20',
  21: 'logs:logEvents.modeReason.21', 22: 'logs:logEvents.modeReason.22', 23: 'logs:logEvents.modeReason.23',
  24: 'logs:logEvents.modeReason.24', 25: 'logs:logEvents.modeReason.25',
  26: 'logs:logEvents.modeReason.26', 27: 'logs:logEvents.modeReason.27',
  28: 'logs:logEvents.modeReason.28', 29: 'logs:logEvents.modeReason.29',
  30: 'logs:logEvents.modeReason.30', 31: 'logs:logEvents.modeReason.31',
  32: 'logs:logEvents.modeReason.32', 33: 'logs:logEvents.modeReason.33', 34: 'logs:logEvents.modeReason.34',
  35: 'logs:logEvents.modeReason.35', 36: 'logs:logEvents.modeReason.36',
  37: 'logs:logEvents.modeReason.37', 38: 'logs:logEvents.modeReason.38',
  39: 'logs:logEvents.modeReason.39', 40: 'logs:logEvents.modeReason.40', 41: 'logs:logEvents.modeReason.41',
  42: 'logs:logEvents.modeReason.42', 43: 'logs:logEvents.modeReason.43', 44: 'logs:logEvents.modeReason.44',
  45: 'logs:logEvents.modeReason.45',
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

type LogMessages = Record<string, LogColumns>;

export function decodeErr(subsys: number, ecode: number, vehicleType?: string): { label: string; detail: string; severity: LogEventSeverity } {
  const labelKey = ERR_SUBSYSTEMS[subsys];
  const label = labelKey ? t(labelKey) : t('logs:logEvents.subsystemN', { n: subsys });
  let detail: string;
  if (subsys === 10) {
    // Flight mode subsystem: the code is the mode number that was refused.
    detail = t('logs:logEvents.cannotEnter', { mode: getModeName(ecode, vehicleType) });
  } else {
    const detailKey = ERR_CODES_BY_SUBSYS[subsys]?.[ecode] ?? ERR_CODES_GENERIC[ecode];
    detail = detailKey ? t(detailKey) : t('logs:logEvents.codeN', { n: ecode });
  }
  return { label, detail, severity: ecode === 0 ? 'info' : 'error' };
}

export function decodeEv(id: number): { label: string; severity: LogEventSeverity } {
  const labelKey = EV_NAMES[id];
  return { label: labelKey ? t(labelKey) : t('logs:logEvents.eventN', { n: id }), severity: EV_WARN_IDS.has(id) ? 'warn' : 'info' };
}

/**
 * Flattens ERR/EV/MSG/MODE/CMD records into one chronological event list.
 * MP buries these in separate raw tabs; here they are one severity-graded
 * timeline the user can filter and click to jump the charts to.
 */
export function extractLogEvents(log: { messages: LogMessages; metadata?: { vehicleType?: string } }): LogEventEntry[] {
  const out: LogEventEntry[] = [];
  const vehicleType = log.metadata?.vehicleType;

  for (const m of logRows(log, 'ERR')) {
    const subsys = typeof m.fields['Subsys'] === 'number' ? m.fields['Subsys'] : -1;
    const ecode = typeof m.fields['ECode'] === 'number' ? m.fields['ECode'] : -1;
    const d = decodeErr(subsys, ecode, vehicleType);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'ERR', severity: d.severity, label: d.label, detail: d.detail });
  }

  for (const m of logRows(log, 'EV')) {
    const id = typeof m.fields['Id'] === 'number' ? m.fields['Id'] : -1;
    const d = decodeEv(id);
    out.push({ timeS: m.timeUs / 1_000_000, kind: 'EV', severity: d.severity, label: d.label });
  }

  for (const m of logRows(log, 'MSG')) {
    const text = typeof m.fields['Message'] === 'string' ? m.fields['Message'] : '';
    if (!text) continue;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MSG',
      severity: MSG_WARN_RE.test(text) ? 'warn' : 'info',
      label: text,
    });
  }

  for (const m of logRows(log, 'MODE')) {
    const modeNum = (typeof m.fields['ModeNum'] === 'number' ? m.fields['ModeNum'] : m.fields['Mode']);
    const name = typeof modeNum === 'number' ? getModeName(modeNum, vehicleType) : String(m.fields['Mode'] ?? '?');
    const rsn = m.fields['Rsn'];
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'MODE',
      severity: 'info',
      label: t('logs:logEvents.modeLabel', { name }),
      detail: typeof rsn === 'number' ? t('logs:logEvents.reason', { reason: MODE_REASONS[rsn] ? t(MODE_REASONS[rsn]) : rsn }) : undefined,
    });
  }

  for (const m of logRows(log, 'CMD')) {
    const num = m.fields['CNum'];
    const name = typeof m.fields['CName'] === 'string' ? m.fields['CName'] : `cmd ${m.fields['CId'] ?? '?'}`;
    out.push({
      timeS: m.timeUs / 1_000_000,
      kind: 'CMD',
      severity: 'info',
      label: typeof num === 'number' ? t('logs:logEvents.wpLabel', { num, name }) : String(name),
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
