/**
 * wind-field — pure sampling + color helpers for the animated wind overlay.
 *
 * No DOM, no map library: bilinear interpolation of a WindField frame and a
 * Windy-style speed colormap. Kept separate from the canvas animator so the
 * numeric behaviour is unit-testable.
 */

import type { WindField, WindFrame } from '../../../../shared/wind-types';
import type { WindSpeedUnit } from '../../../../shared/user-units.js';

export interface UV {
  u: number;
  v: number;
}

/**
 * Bilinearly sample a frame's u/v (m/s) at a geographic point. Returns null
 * outside the field bbox. Grid is row-major, row 0 = south, col 0 = west.
 */
export function sampleWind(field: WindField, frame: WindFrame, lat: number, lng: number): UV | null {
  const { bbox, width, height } = field;
  if (lat < bbox.south || lat > bbox.north || lng < bbox.west || lng > bbox.east) return null;

  const fx = ((lng - bbox.west) / (bbox.east - bbox.west)) * (width - 1);
  const fy = ((lat - bbox.south) / (bbox.north - bbox.south)) * (height - 1);

  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(x0 + 1, width - 1);
  const y1 = Math.min(y0 + 1, height - 1);
  const tx = fx - x0;
  const ty = fy - y0;

  const idx = (x: number, y: number): number => y * width + x;
  const i00 = idx(x0, y0);
  const i10 = idx(x1, y0);
  const i01 = idx(x0, y1);
  const i11 = idx(x1, y1);

  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const u = lerp(
    lerp(frame.u[i00] ?? 0, frame.u[i10] ?? 0, tx),
    lerp(frame.u[i01] ?? 0, frame.u[i11] ?? 0, tx),
    ty,
  );
  const v = lerp(
    lerp(frame.v[i00] ?? 0, frame.v[i10] ?? 0, tx),
    lerp(frame.v[i01] ?? 0, frame.v[i11] ?? 0, tx),
    ty,
  );
  return { u, v };
}

/** Stops for the speed colormap (m/s -> RGB), Windy-ish blue->green->red. */
const COLOR_STOPS: Array<{ s: number; c: [number, number, number] }> = [
  { s: 0, c: [60, 120, 200] },
  { s: 5, c: [80, 190, 170] },
  { s: 10, c: [180, 220, 120] },
  { s: 15, c: [240, 200, 90] },
  { s: 20, c: [240, 120, 70] },
  { s: 28, c: [210, 60, 80] },
];

/** Map a wind speed (m/s) to an `rgb(...)` string for particle strokes/legend. */
export function windColor(speedMs: number): string {
  const stops = COLOR_STOPS;
  if (speedMs <= stops[0]!.s) return rgb(stops[0]!.c);
  const last = stops[stops.length - 1]!;
  if (speedMs >= last.s) return rgb(last.c);
  for (let i = 1; i < stops.length; i++) {
    const a = stops[i - 1]!;
    const b = stops[i]!;
    if (speedMs <= b.s) {
      const t = (speedMs - a.s) / (b.s - a.s);
      return rgb([
        Math.round(a.c[0] + (b.c[0] - a.c[0]) * t),
        Math.round(a.c[1] + (b.c[1] - a.c[1]) * t),
        Math.round(a.c[2] + (b.c[2] - a.c[2]) * t),
      ]);
    }
  }
  return rgb(last.c);
}

function rgb(c: [number, number, number]): string {
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}

export const WIND_LEGEND_STOPS = COLOR_STOPS.map((s) => s.s);

// ---------------------------------------------------------------------------
// Units (cycle m/s -> kt -> mph -> km/h)
// ---------------------------------------------------------------------------

export type WindUnit = 'ms' | 'kt' | 'mph' | 'kmh';
export const WIND_UNITS: WindUnit[] = ['ms', 'kt', 'mph', 'kmh'];
const UNIT_FACTOR: Record<WindUnit, number> = { ms: 1, kt: 1.94384, mph: 2.23694, kmh: 3.6 };
const UNIT_LABEL: Record<WindUnit, string> = { ms: 'm/s', kt: 'kt', mph: 'mph', kmh: 'km/h' };

export function convertSpeed(ms: number, unit: WindUnit): number {
  return ms * UNIT_FACTOR[unit];
}
export function unitLabel(unit: WindUnit): string {
  return UNIT_LABEL[unit];
}
export function nextUnit(unit: WindUnit): WindUnit {
  const i = WIND_UNITS.indexOf(unit);
  return WIND_UNITS[(i + 1) % WIND_UNITS.length]!;
}
export function windUnitFromPreference(unit: WindSpeedUnit): WindUnit {
  switch (unit) {
    case 'mps':
      return 'ms';
    case 'kph':
      return 'kmh';
    case 'mph':
      return 'mph';
    case 'kt':
      return 'kt';
  }
}
/** Format a m/s speed in the given unit (whole numbers except m/s to 0.1). */
export function formatWindSpeed(ms: number, unit: WindUnit): string {
  const v = convertSpeed(ms, unit);
  return `${unit === 'ms' ? v.toFixed(1) : Math.round(v)} ${UNIT_LABEL[unit]}`;
}

// ---------------------------------------------------------------------------
// Point probe: vector + wind rose (for click-a-location)
// ---------------------------------------------------------------------------

export interface WindVector {
  /** m/s. */
  speed: number;
  /** Meteorological direction the wind comes FROM, degrees clockwise from N. */
  dirFromDeg: number;
}

/** u (east) / v (north) m/s -> speed + meteorological "from" direction. */
export function windVectorFromUV(u: number, v: number): WindVector {
  const speed = Math.hypot(u, v);
  const bearingTo = (Math.atan2(u, v) * 180) / Math.PI; // direction wind blows TO
  const dirFromDeg = (((bearingTo + 180) % 360) + 360) % 360;
  return { speed, dirFromDeg };
}

const COMPASS_16 = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];

/** Nearest 16-point compass label for a bearing in degrees. */
export function compassPoint(dirDeg: number): string {
  const i = Math.round((((dirDeg % 360) + 360) % 360) / 22.5) % 16;
  return COMPASS_16[i] ?? 'N';
}

export interface RoseBin {
  /** Sector centre, degrees from N (the "from" direction). */
  dirDeg: number;
  /** Fraction of forecast hours blowing from this sector (0..1). */
  freq: number;
  /** Mean speed (m/s) for hours in this sector. */
  meanSpeed: number;
}

export interface WindRose {
  bins: RoseBin[];
  samples: number;
  maxFreq: number;
}

/**
 * Build a wind rose at a point over a frame window [startIdx, endIdx): how
 * often the wind blows from each of `sectors` directions, and the mean speed
 * per sector. Defaults to the whole forecast; pass a window so scrubbing the
 * timeline shifts which hours the rose reflects.
 */
export function computeWindRose(
  field: WindField,
  lat: number,
  lng: number,
  sectors = 16,
  startIdx = 0,
  endIdx = field.frames.length,
): WindRose | null {
  const size = 360 / sectors;
  const counts: number[] = new Array(sectors).fill(0);
  const speedSums: number[] = new Array(sectors).fill(0);
  let samples = 0;
  const frames = field.frames.slice(Math.max(0, startIdx), Math.min(field.frames.length, endIdx));
  for (const frame of frames) {
    const uv = sampleWind(field, frame, lat, lng);
    if (!uv) continue;
    const { speed, dirFromDeg } = windVectorFromUV(uv.u, uv.v);
    const idx = Math.floor((((dirFromDeg + size / 2) % 360) + 360) % 360 / size) % sectors;
    counts[idx] = (counts[idx] ?? 0) + 1;
    speedSums[idx] = (speedSums[idx] ?? 0) + speed;
    samples++;
  }
  if (samples === 0) return null;
  const bins: RoseBin[] = counts.map((c, i) => ({
    dirDeg: i * size,
    freq: c / samples,
    meanSpeed: c > 0 ? (speedSums[i] ?? 0) / c : 0,
  }));
  return { bins, samples, maxFreq: Math.max(...bins.map((b) => b.freq), 1e-6) };
}
