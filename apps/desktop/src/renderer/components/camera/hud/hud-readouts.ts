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

export const HUD_READOUTS: HudReadoutMeta[] = [
  { id: 'voltage', label: 'VOLTS', description: 'Battery voltage', category: 'Power' },
  { id: 'current', label: 'AMPS', description: 'Current draw', category: 'Power' },
  { id: 'power', label: 'PWR', description: 'Power (W)', category: 'Power' },
  { id: 'battPercent', label: 'BATT', description: 'Battery remaining', category: 'Power' },
  { id: 'altitude', label: 'ALT', description: 'Altitude', category: 'Flight' },
  { id: 'vario', label: 'VS', description: 'Vertical speed', category: 'Flight' },
  { id: 'throttle', label: 'THR', description: 'Throttle', category: 'Flight' },
  { id: 'groundspeed', label: 'GS', description: 'Ground speed', category: 'Speed' },
  { id: 'airspeed', label: 'AS', description: 'Airspeed', category: 'Speed' },
  { id: 'heading', label: 'HDG', description: 'Heading', category: 'Navigation' },
  { id: 'distHome', label: 'HOME', description: 'Distance to home', category: 'Navigation' },
  { id: 'gpsSats', label: 'SATS', description: 'GPS satellites', category: 'Navigation' },
  { id: 'hdop', label: 'HDOP', description: 'GPS HDOP', category: 'Navigation' },
  { id: 'lat', label: 'LAT', description: 'Latitude', category: 'Navigation' },
  { id: 'lon', label: 'LON', description: 'Longitude', category: 'Navigation' },
  { id: 'windSpeed', label: 'WIND', description: 'Wind speed', category: 'Environment' },
  { id: 'mode', label: 'MODE', description: 'Flight mode', category: 'Status' },
  { id: 'vtolState', label: 'VTOL', description: 'Hover, wingborne, or transitioning', category: 'Status' },
  { id: 'gforce', label: 'G', description: 'G-force', category: 'Status' },
  { id: 'steer', label: 'STEER', description: 'Steering output (ground vehicles)', category: 'Status' },
  { id: 'tilt', label: 'TILT', description: 'Roll/pitch tilt (rollover awareness)', category: 'Status' },
  { id: 'wpDist', label: 'WP', description: 'Distance to active waypoint', category: 'Navigation' },
  { id: 'xtrack', label: 'XTK', description: 'Crosstrack error', category: 'Navigation' },
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
