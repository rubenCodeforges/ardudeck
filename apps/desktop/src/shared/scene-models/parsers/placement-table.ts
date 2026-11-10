import type { SceneAltitudeMode } from '@ardudeck/module-sdk';
import { t } from '../../i18n/index.js';
import type { PlacementRow } from './types';

type Field = 'file' | 'name' | 'lat' | 'lng' | 'alt' | 'altAgl' | 'mode' | 'yaw' | 'pitch' | 'roll' | 'scale';

const ALIASES: Record<string, Field> = {
  file: 'file', filename: 'file', path: 'file', model: 'file', href: 'file', src: 'file',
  name: 'name', label: 'name', title: 'name',
  lat: 'lat', latitude: 'lat',
  lng: 'lng', lon: 'lng', long: 'lng', longitude: 'lng',
  altmsl: 'alt', alt: 'alt', altitude: 'alt', amsl: 'alt', elevation: 'alt', elev: 'alt',
  altagl: 'altAgl', agl: 'altAgl',
  altitudemode: 'mode', altmode: 'mode', mode: 'mode',
  yawdeg: 'yaw', yaw: 'yaw', heading: 'yaw', headingdeg: 'yaw', hdg: 'yaw',
  pitchdeg: 'pitch', pitch: 'pitch',
  rolldeg: 'roll', roll: 'roll',
  scale: 'scale',
};

const MODES: Record<string, SceneAltitudeMode> = {
  amsl: 'amsl', msl: 'amsl', asl: 'amsl', absolute: 'amsl',
  agl: 'agl', relative: 'agl', relativetoground: 'agl', relativetoseafloor: 'agl',
  clamp: 'clamp', ground: 'clamp', clamptoground: 'clamp', clamptoseafloor: 'clamp',
};

const keyOf = (k: string): string => k.toLowerCase().replace(/[^a-z0-9]/g, '');

function fieldsOf(rec: Record<string, unknown>): Partial<Record<Field, unknown>> {
  const out: Partial<Record<Field, unknown>> = {};
  for (const [k, v] of Object.entries(rec)) {
    const f = ALIASES[keyOf(k)];
    if (f && out[f] === undefined && v !== null && v !== '') out[f] = v;
  }
  return out;
}

/** undefined when absent, NaN when present but not a finite number. */
function num(v: unknown): number | undefined {
  if (v === undefined) return undefined;
  if (typeof v === 'number') return Number.isFinite(v) ? v : NaN;
  if (typeof v !== 'string') return NaN;
  let s = v.trim();
  if (!s) return undefined;
  if (/^[-+]?\d+,\d+$/.test(s)) s = s.replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

type RowResult = { row: PlacementRow } | { problem: string };

function toRow(rec: Record<string, unknown>): RowResult {
  const f = fieldsOf(rec);
  const file = typeof f.file === 'string' ? f.file.trim() : '';
  if (!file) return { problem: t('shared:userModelParsers.missingFile') };
  const lat = num(f.lat), lng = num(f.lng);
  if (lat === undefined || lng === undefined || Number.isNaN(lat) || Number.isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return { problem: t('shared:userModelParsers.badLatLng') };
  }
  const numbers: Partial<Record<Field, number | undefined>> = {};
  for (const k of ['alt', 'altAgl', 'yaw', 'pitch', 'roll', 'scale'] as const) {
    const n = num(f[k]);
    if (Number.isNaN(n)) return { problem: t('shared:userModelParsers.badNumber', { field: k }) };
    numbers[k] = n;
  }
  if (numbers.scale !== undefined && numbers.scale <= 0) return { problem: t('shared:userModelParsers.badNumber', { field: 'scale' }) };

  const given = typeof f.mode === 'string' ? MODES[keyOf(f.mode)] : undefined;
  const alt = numbers.alt ?? numbers.altAgl;
  let altitudeMode: SceneAltitudeMode;
  if (given === 'agl' || given === 'clamp') altitudeMode = given;
  else if (given === 'amsl') altitudeMode = alt === undefined ? 'clamp' : 'amsl';
  else if (numbers.alt !== undefined) altitudeMode = 'amsl';
  else if (numbers.altAgl !== undefined) altitudeMode = 'agl';
  else altitudeMode = 'clamp';

  const name = typeof f.name === 'string' && f.name.trim() ? f.name.trim() : undefined;
  return {
    row: {
      file,
      ...(name ? { name } : {}),
      placement: {
        lat, lng,
        alt: alt ?? 0,
        altitudeMode,
        yawDeg: numbers.yaw ?? 0,
        pitchDeg: numbers.pitch ?? 0,
        rollDeg: numbers.roll ?? 0,
        scale: numbers.scale ?? 1,
      },
    },
  };
}

function splitCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const firstLine = src.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  row.push(cell);
  rows.push(row);
  return rows.filter((r) => r.some((v) => v.trim() !== ''));
}

function csvRecords(text: string): Array<Record<string, unknown>> {
  const [header, ...body] = splitCsv(text);
  if (!header) return [];
  const keys = header.map((h) => h.trim());
  return body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, (cells[i] ?? '').trim()])));
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text.replace(/^﻿/, ''));
  } catch (e) {
    throw new Error(t('shared:userModelParsers.invalidJson', { detail: (e as Error).message }));
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function jsonRecords(text: string): Array<Record<string, unknown>> {
  const doc = parseJson(text);
  const list = Array.isArray(doc) ? doc : isRecord(doc) && Array.isArray(doc.models) ? doc.models : null;
  if (!list) throw new Error(t('shared:userModelParsers.notModelList'));
  return list.map((e) => (isRecord(e) ? e : {}));
}

function geoJsonRecords(text: string): Array<Record<string, unknown>> {
  const doc = parseJson(text);
  const features = isRecord(doc) && doc.type === 'FeatureCollection' && Array.isArray(doc.features)
    ? doc.features
    : isRecord(doc) && doc.type === 'Feature' ? [doc] : null;
  if (!features) throw new Error(t('shared:userModelParsers.notFeatureCollection'));
  return features.map((feat) => {
    if (!isRecord(feat) || !isRecord(feat.geometry) || feat.geometry.type !== 'Point' || !Array.isArray(feat.geometry.coordinates)) return {};
    const props = isRecord(feat.properties) ? feat.properties : {};
    const [lng, lat, alt] = feat.geometry.coordinates as unknown[];
    const rec: Record<string, unknown> = { lat, lng };
    for (const [k, v] of Object.entries(props)) {
      const f = ALIASES[keyOf(k)];
      if (f !== 'lat' && f !== 'lng') rec[k] = v;
    }
    const hasAlt = Object.keys(props).some((k) => { const f = ALIASES[keyOf(k)]; return f === 'alt' || f === 'altAgl'; });
    if (!hasAlt && alt !== undefined) rec.altMsl = alt;
    return rec;
  });
}

/** models.json ([...] or { models }), a headed CSV, or a GeoJSON Point FeatureCollection; no altitude means 'clamp'. */
export function parsePlacementTable(text: string, kind: 'json' | 'csv' | 'geojson'): PlacementRow[] {
  const records = kind === 'csv' ? csvRecords(text) : kind === 'geojson' ? geoJsonRecords(text) : jsonRecords(text);
  if (records.length === 0) throw new Error(t('shared:userModelParsers.emptyTable'));
  const rows: PlacementRow[] = [];
  let firstProblem: { row: number; problem: string } | null = null;
  records.forEach((rec, i) => {
    const r = toRow(rec);
    if ('row' in r) rows.push(r.row);
    else firstProblem ??= { row: i + 1, problem: r.problem };
  });
  if (rows.length === 0 && firstProblem) {
    const p: { row: number; problem: string } = firstProblem;
    throw new Error(t('shared:userModelParsers.noValidRows', { row: p.row, problem: p.problem }));
  }
  return rows;
}
