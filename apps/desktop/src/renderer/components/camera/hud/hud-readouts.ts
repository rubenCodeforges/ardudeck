/**
 * HUD readouts - the freely-placeable telemetry fields that turn the HUD into a
 * composable overlay (the RubyFPV-style "put any value anywhere" experience).
 *
 * Each readout is a small label + value pair the user drops onto the HUD canvas
 * and drags where they want. This module is pure data + one pure formatter so
 * it can be unit-tested and shared by the designer preview and the live video
 * overlay. Rendering (SVG, positioning, drag) lives in FighterHud; the catalog
 * and value formatting live here.
 */

import type { UnitProfile } from './hud-config';
import { vtolStateLabel, type VtolState } from '../../../../shared/telemetry-types';
import { t } from '../../../../shared/i18n/index.js';

export type HudReadoutId =
  | 'voltage'
  | 'current'
  | 'power'
  | 'battPercent'
  | 'altitude'
  | 'vario'
  | 'throttle'
  | 'groundspeed'
  | 'airspeed'
  | 'heading'
  | 'distHome'
  | 'gpsSats'
  | 'hdop'
  | 'lat'
  | 'lon'
  | 'windSpeed'
  | 'mode'
  | 'gforce'
  | 'steer'
  | 'tilt'
  | 'wpDist'
  | 'xtrack'
  | 'vtolState';

export type HudReadoutCategory = 'Power' | 'Flight' | 'Speed' | 'Navigation' | 'Environment' | 'Status';

export interface HudReadoutMeta {
  id: HudReadoutId;
  /** Short on-HUD tag, e.g. "VOLTS". */
  label: string;
  /** Human description for the picker, e.g. "Battery voltage". */
  description: string;
  category: HudReadoutCategory;
}

/**
 * The telemetry fields a readout can draw. A structural subset of
 * FighterHudValues so this module stays free of any rendering import.
 */
export interface ReadoutSource {
  batteryVoltage: number;
  batteryPercent: number;
  current?: number;
  altitude: number;
  vario: number;
  throttle: number;
  groundspeed: number;
  airspeed: number;
  heading: number;
  /** Null = home unknown: the readout shows a dash. */
  distance: number | null;
  gpsSats?: number;
  hdop?: number;
  lat?: number;
  lon?: number;
  windSpeed?: number;
  mode: string;
  gForce?: number;
  /** Steering output, -100 (full left) .. +100 (full right). Ground vehicles. */
  steer?: number;
  /** Vehicle attitude for the tilt readout (rollover awareness on slopes). */
  roll?: number;
  pitch?: number;
  /** Autopilot nav solution (NAV_CONTROLLER_OUTPUT) - only while navigating. */
  wpDistance?: number;
  xtrackError?: number;
  /** MAV_VTOL_STATE. Absent on anything that is not a VTOL. */
  vtolState?: VtolState | null;
}

function readout(id: HudReadoutId, label: string, descriptionKey: string, category: HudReadoutCategory): HudReadoutMeta {
  return { id, label, category, get description() { return t(descriptionKey); } };
}

export const HUD_READOUTS: HudReadoutMeta[] = [
  readout('voltage', 'VOLTS', 'camera:hudReadouts.voltage', 'Power'),
  readout('current', 'AMPS', 'camera:hudReadouts.current', 'Power'),
  readout('power', 'PWR', 'camera:hudReadouts.power', 'Power'),
  readout('battPercent', 'BATT', 'camera:hudReadouts.battPercent', 'Power'),
  readout('altitude', 'ALT', 'camera:hudReadouts.altitude', 'Flight'),
  readout('vario', 'VS', 'camera:hudReadouts.vario', 'Flight'),
  readout('throttle', 'THR', 'camera:hudReadouts.throttle', 'Flight'),
  readout('groundspeed', 'GS', 'camera:hudReadouts.groundspeed', 'Speed'),
  readout('airspeed', 'AS', 'camera:hudReadouts.airspeed', 'Speed'),
  readout('heading', 'HDG', 'camera:hudReadouts.heading', 'Navigation'),
  readout('distHome', 'HOME', 'camera:hudReadouts.distHome', 'Navigation'),
  readout('gpsSats', 'SATS', 'camera:hudReadouts.gpsSats', 'Navigation'),
  readout('hdop', 'HDOP', 'camera:hudReadouts.hdop', 'Navigation'),
  readout('lat', 'LAT', 'camera:hudReadouts.lat', 'Navigation'),
  readout('lon', 'LON', 'camera:hudReadouts.lon', 'Navigation'),
  readout('windSpeed', 'WIND', 'camera:hudReadouts.windSpeed', 'Environment'),
  readout('mode', 'MODE', 'camera:hudReadouts.mode', 'Status'),
  readout('vtolState', 'VTOL', 'camera:hudReadouts.vtolState', 'Status'),
  readout('gforce', 'G', 'camera:hudReadouts.gforce', 'Status'),
  readout('steer', 'STEER', 'camera:hudReadouts.steer', 'Status'),
  readout('tilt', 'TILT', 'camera:hudReadouts.tilt', 'Status'),
  readout('wpDist', 'WP', 'camera:hudReadouts.wpDist', 'Navigation'),
  readout('xtrack', 'XTK', 'camera:hudReadouts.xtrack', 'Navigation'),
];

export const READOUT_IDS: readonly HudReadoutId[] = HUD_READOUTS.map((r) => r.id);

const READOUT_LABEL: Record<HudReadoutId, string> = HUD_READOUTS.reduce(
  (acc, r) => { acc[r.id] = r.label; return acc; },
  {} as Record<HudReadoutId, string>,
);

/** Number missing/NaN guard - readouts show a dash rather than "NaN". */
function num(n: number | undefined): number | null {
  return n == null || !Number.isFinite(n) ? null : n;
}

function pad3(deg: number): string {
  const d = ((Math.round(deg) % 360) + 360) % 360;
  return String(d).padStart(3, '0');
}

/**
 * Format one readout to a `{ label, value }` pair. Pure: the value string
 * already carries its unit (from the UnitProfile), so the renderer just draws
 * the two strings. Missing optional data renders as `--` (never NaN).
 */
export function formatReadout(id: HudReadoutId, v: ReadoutSource, u: UnitProfile): { label: string; value: string } {
  const label = READOUT_LABEL[id];
  const dash = { label, value: '--' };
  switch (id) {
    case 'voltage':
      return { label, value: `${v.batteryVoltage.toFixed(1)} V` };
    case 'current': {
      const a = num(v.current);
      return a == null ? dash : { label, value: `${a.toFixed(1)} A` };
    }
    case 'power': {
      const a = num(v.current);
      return a == null ? dash : { label, value: `${Math.round(v.batteryVoltage * a)} W` };
    }
    case 'battPercent':
      return { label, value: `${Math.round(v.batteryPercent)}%` };
    case 'altitude':
      return { label, value: `${Math.round(u.dist(v.altitude))} ${u.distUnit}` };
    case 'vario':
      return { label, value: `${u.dist(v.vario).toFixed(1)} ${u.distUnit}/s` };
    case 'throttle':
      return { label, value: `${Math.round(v.throttle)}%` };
    case 'groundspeed':
      return { label, value: `${Math.round(u.speed(v.groundspeed))} ${u.speedUnit}` };
    case 'airspeed':
      return { label, value: `${Math.round(u.speed(v.airspeed))} ${u.speedUnit}` };
    case 'heading':
      return { label, value: `${pad3(v.heading)}°` };
    case 'vtolState': {
      // Only a VTOL reports this, so on anything else the cell stays a dash
      // rather than claiming the airframe is a fixed wing.
      const s = vtolStateLabel(v.vtolState);
      return s == null ? dash : { label, value: s };
    }
    case 'distHome':
      return v.distance == null ? dash : { label, value: `${Math.round(u.dist(v.distance))} ${u.distUnit}` };
    case 'gpsSats': {
      const s = num(v.gpsSats);
      return s == null ? dash : { label, value: `${Math.round(s)}` };
    }
    case 'hdop': {
      const h = num(v.hdop);
      return h == null ? dash : { label, value: h.toFixed(2) };
    }
    case 'lat': {
      const l = num(v.lat);
      return l == null ? dash : { label, value: l.toFixed(6) };
    }
    case 'lon': {
      const l = num(v.lon);
      return l == null ? dash : { label, value: l.toFixed(6) };
    }
    case 'windSpeed': {
      const s = num(v.windSpeed);
      return s == null ? dash : { label, value: `${Math.round(u.speed(s))} ${u.speedUnit}` };
    }
    case 'mode':
      return { label, value: v.mode || '--' };
    case 'gforce': {
      const g = num(v.gForce);
      return g == null ? { label, value: '-- G' } : { label, value: `${g.toFixed(1)} G` };
    }
    case 'steer': {
      const s = num(v.steer);
      if (s == null) return dash;
      const mag = Math.round(Math.min(100, Math.abs(s)));
      return { label, value: mag < 1 ? 'CTR' : `${s < 0 ? 'L' : 'R'} ${mag}%` };
    }
    case 'tilt': {
      const r = num(v.roll);
      const p = num(v.pitch);
      if (r == null || p == null) return dash;
      return { label, value: `R${Math.round(r)}° P${Math.round(p)}°` };
    }
    case 'wpDist': {
      const d = num(v.wpDistance);
      return d == null ? dash : { label, value: `${Math.round(u.dist(d))} ${u.distUnit}` };
    }
    case 'xtrack': {
      const x = num(v.xtrackError);
      if (x == null) return dash;
      const mag = u.dist(Math.abs(x));
      return { label, value: `${x < 0 ? 'L' : 'R'} ${mag < 10 ? mag.toFixed(1) : Math.round(mag)} ${u.distUnit}` };
    }
  }
}
