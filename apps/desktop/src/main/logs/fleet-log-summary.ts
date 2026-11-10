/**
 * Pure extraction of a compact FlightSummary from a parsed dataflash log.
 * No electron-store / no IPC, so it is unit-testable. The persistence + IPC
 * layer (fleet-log-history.ts) builds on this.
 */
import type { FlightSummary, FlightHealthFlag, FlightHealthStatus } from '../../shared/fleet-log-types.js';

/** Minimal shape we read out of the parser's DataFlashLog (Maps). */
export interface LogLike {
  metadata: { vehicleType: string; firmwareVersion: string; boardType: string };
  timeRange: { startUs: number; endUs: number };
  messages: Map<string, Array<{ fields: Record<string, number | string> }>>;
}

export interface HealthLike {
  id: string;
  name: string;
  status: FlightHealthStatus;
  summary: string;
}

/** Message types the summary reads as rows; a columnar parse must keep these. */
export const SUMMARY_LOG_TYPES: ReadonlySet<string> = new Set(['PARM', 'GPS', 'BAT', 'VIBE']);

const EARTH_R = 6371000;

function haversine(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return EARTH_R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}

/** SYSID_THISMAV from the PARM stream, if present. */
function findSysid(messages: LogLike['messages']): number | null {
  const parm = messages.get('PARM');
  if (!parm) return null;
  for (const m of parm) {
    if (m.fields['Name'] === 'SYSID_THISMAV') {
      const v = num(m.fields['Value']);
      if (v !== undefined) return Math.round(v);
    }
  }
  return null;
}

const GPS_EPOCH_S = 315964800; // 1980-01-06 in unix seconds
const GPS_LEAP_S = 18;          // GPS-UTC offset (valid since 2017)

/** Derive flight start epoch-ms from the first GPS week/ms, else null. */
function gpsStartMs(messages: LogLike['messages']): number | null {
  const gps = messages.get('GPS');
  if (!gps) return null;
  for (const m of gps) {
    const wk = num(m.fields['GWk']);
    const ms = num(m.fields['GMS']);
    if (wk !== undefined && ms !== undefined && wk > 0) {
      return (GPS_EPOCH_S + wk * 604800 + ms / 1000 - GPS_LEAP_S) * 1000;
    }
  }
  return null;
}

export interface ExtractInput {
  log: LogLike;
  health: HealthLike[];
  path: string;
  fileName: string;
  /** File mtime epoch-ms, used when the log has no GPS time. */
  fileMtimeMs: number;
  /** Injected id + fallback timestamp so the function stays deterministic in tests. */
  flightId: string;
}

export function extractFlightSummary(input: ExtractInput): FlightSummary {
  const { log, health, path, fileName, fileMtimeMs, flightId } = input;
  const messages = log.messages;
  const sysid = findSysid(messages);
  const boardType = log.metadata.boardType || 'unknown';
  const vehicleType = log.metadata.vehicleType || 'unknown';
  const vehicleKey = `${boardType}#${sysid ?? '?'}`;
  const vehicleLabel = sysid !== null ? `${vehicleType} sys${sysid} (${boardType})` : `${vehicleType} (${boardType})`;

  // GPS-derived stats.
  let maxAltM = 0;
  let maxSpd = 0;
  let distanceM = 0;
  let lastLat: number | undefined;
  let lastLon: number | undefined;
  const gps = messages.get('GPS');
  if (gps) {
    for (const m of gps) {
      const alt = num(m.fields['Alt']);
      const spd = num(m.fields['Spd']);
      const lat = num(m.fields['Lat']);
      const lon = num(m.fields['Lng']);
      if (alt !== undefined && alt > maxAltM) maxAltM = alt;
      if (spd !== undefined && spd > maxSpd) maxSpd = spd;
      if (lat !== undefined && lon !== undefined && lat !== 0 && lon !== 0) {
        if (lastLat !== undefined && lastLon !== undefined) {
          distanceM += haversine(lastLat, lastLon, lat, lon);
        }
        lastLat = lat;
        lastLon = lon;
      }
    }
  }

  // Battery stats.
  let batteryMah = 0;
  let minBatteryV = Infinity;
  const bat = messages.get('BAT');
  if (bat) {
    for (const m of bat) {
      const v = num(m.fields['Volt']);
      const used = num(m.fields['CurrTot']);
      if (v !== undefined && v > 0 && v < minBatteryV) minBatteryV = v;
      if (used !== undefined && used > batteryMah) batteryMah = used;
    }
  }
  if (minBatteryV === Infinity) minBatteryV = 0;

  // Peak vibration.
  let maxVibe = 0;
  const vibe = messages.get('VIBE');
  if (vibe) {
    for (const m of vibe) {
      const mag = Math.max(
        Math.abs(num(m.fields['VibeX']) ?? 0),
        Math.abs(num(m.fields['VibeY']) ?? 0),
        Math.abs(num(m.fields['VibeZ']) ?? 0),
      );
      if (mag > maxVibe) maxVibe = mag;
    }
  }

  const durationSec = Math.max(0, (log.timeRange.endUs - log.timeRange.startUs) / 1e6);
  const startedAt = gpsStartMs(messages) ?? fileMtimeMs;

  const healthFlags: FlightHealthFlag[] = health.map((h) => ({
    id: h.id,
    name: h.name,
    status: h.status,
    summary: h.summary,
  }));

  return {
    flightId,
    vehicleKey,
    vehicleLabel,
    boardType,
    vehicleType,
    firmwareVersion: log.metadata.firmwareVersion || '',
    sysid,
    fileName,
    path,
    startedAt,
    durationSec: Math.round(durationSec),
    maxAltM: Math.round(maxAltM * 10) / 10,
    maxGroundSpeedMps: Math.round(maxSpd * 10) / 10,
    distanceM: Math.round(distanceM),
    batteryMah: Math.round(batteryMah),
    minBatteryV: Math.round(minBatteryV * 100) / 100,
    maxVibe: Math.round(maxVibe * 10) / 10,
    health: healthFlags,
  };
}
