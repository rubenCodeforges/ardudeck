/**
 * Remote ID provider — ingests broadcast drone Remote ID from a local receiver
 * or gateway that exposes the decoded messages as JSON over HTTP.
 *
 * There is no single hosted Remote ID feed (it is a local-broadcast standard:
 * FAA RID / ASTM F3411 / EU Direct Remote ID), so this is a poll provider
 * pointed at a receiver on the operator's network. Two JSON layouts are
 * understood: our own normalised array ('ardudeck') and the field layout an
 * OpenDroneID receiver emits ('opendroneid'). Everything maps to the unified
 * TrafficContact with source 'remoteid' and category 'uav'.
 */
import type { TrafficContact, ViewportBbox } from '../../shared/traffic-types.js';
import type { RemoteIdShape } from '../../shared/traffic-types.js';
import { PollProvider, type PollSpec } from './poll-provider.js';

export interface RemoteIdConfig {
  enabled: boolean;
  url: string;
  shape: RemoteIdShape;
  pollMs: number;
}

function num(v: unknown): number | undefined {
  const n = typeof v === 'string' ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : undefined;
}

/** Pull the first finite number out of a record by trying several key spellings. */
function pick(obj: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    if (k in obj) {
      const n = num(obj[k]);
      if (n !== undefined) return n;
    }
  }
  return undefined;
}

function pickStr(obj: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === 'string' && v.length > 0) return v;
  }
  return undefined;
}

/** Normalise one record from either layout into a TrafficContact. */
function toContact(raw: unknown, shape: RemoteIdShape, nowMs: number): TrafficContact | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;

  // OpenDroneID receivers nest position under a Location/Vector message and the
  // serial under Basic ID; flatten both layouts to a single record to read from.
  let flat: Record<string, unknown> = r;
  if (shape === 'opendroneid') {
    const loc = (r['Location/Vector Message'] ?? r['location'] ?? r['Location']) as Record<string, unknown> | undefined;
    const basic = (r['Basic ID Message'] ?? r['basicId'] ?? r['BasicID']) as Record<string, unknown> | undefined; // i18n-exempt
    flat = { ...r, ...(loc ?? {}), ...(basic ?? {}) };
  }

  const lat = pick(flat, ['lat', 'latitude', 'Latitude']);
  const lon = pick(flat, ['lon', 'lng', 'longitude', 'Longitude']);
  if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;

  const uasId = pickStr(flat, ['id', 'uasId', 'UAS ID', 'uas_id', 'serial', 'BasicID', 'Basic ID']); // i18n-exempt
  // Geodetic altitude (MSL) preferred; some receivers only have height-above-takeoff.
  const altMeters = pick(flat, ['alt', 'altMeters', 'AltitudeGeo', 'geodetic_altitude', 'Geodetic Altitude', 'altitude']); // i18n-exempt
  const opLat = pick(flat, ['operatorLat', 'OperatorLatitude', 'operator_lat', 'pilotLat']);
  const opLon = pick(flat, ['operatorLon', 'OperatorLongitude', 'operator_lon', 'pilotLon']);

  const id = uasId ?? `rid-${lat.toFixed(5)},${lon.toFixed(5)}`;
  return {
    id,
    source: 'remoteid',
    category: 'uav',
    lat,
    lon,
    ...(uasId ? { uasId } : {}),
    ...(altMeters !== undefined ? { altMeters } : {}),
    ...(pick(flat, ['speed', 'groundSpeed', 'SpeedHorizontal', 'speedMps']) !== undefined
      ? { groundSpeedMps: pick(flat, ['speed', 'groundSpeed', 'SpeedHorizontal', 'speedMps']) }
      : {}),
    ...(pick(flat, ['track', 'heading', 'Direction', 'course']) !== undefined
      ? { trackDeg: pick(flat, ['track', 'heading', 'Direction', 'course']) }
      : {}),
    ...(opLat !== undefined ? { operatorLat: opLat } : {}),
    ...(opLon !== undefined ? { operatorLon: opLon } : {}),
    lastSeen: nowMs,
  };
}

/** Pull the contact array out of common envelope shapes ({contacts:[]}, {aircraft:[]}, []). */
function extractArray(json: unknown): unknown[] {
  if (Array.isArray(json)) return json;
  if (json && typeof json === 'object') {
    const o = json as Record<string, unknown>;
    for (const key of ['contacts', 'remoteid', 'remoteId', 'aircraft', 'drones', 'messages', 'data']) {
      if (Array.isArray(o[key])) return o[key] as unknown[];
    }
  }
  return [];
}

/** Parse a Remote ID receiver JSON payload into normalized contacts. */
export function parseRemoteId(json: unknown, shape: RemoteIdShape, nowMs: number): TrafficContact[] {
  return extractArray(json)
    .map((raw) => toContact(raw, shape, nowMs))
    .filter((c): c is TrafficContact => c !== null);
}

export function createRemoteIdProvider(cfg: RemoteIdConfig): PollProvider {
  const spec: PollSpec = {
    id: 'remoteid',
    source: 'remoteid',
    pollMs: cfg.pollMs > 0 ? cfg.pollMs : 1000,
    buildRequest: (_v: ViewportBbox) => (cfg.url ? { url: cfg.url } : null),
    parse: (json, nowMs) => parseRemoteId(json, cfg.shape, nowMs),
  };
  return new PollProvider(spec);
}
