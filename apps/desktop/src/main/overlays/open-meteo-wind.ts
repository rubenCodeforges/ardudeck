/**
 * Open-Meteo wind source for the animated wind overlay.
 *
 * We deliberately use Open-Meteo (not raw GFS/HRRR GRIB) so there are no native
 * binaries (wgrib2/GDAL) to bundle, we get UAV-relevant altitudes (10/80/120/180 m)
 * directly, and the hourly forecast arrays come back in one request so the
 * renderer's time scrubber is free.
 *
 * The pure helpers (grid building, speed/direction -> u/v, response parsing) are
 * exported for unit testing; only fetchWindField touches the network.
 */

import type { WindBBox, WindField, WindFrame, WindFetchParams } from '../../shared/wind-types.js';

const API_URL = 'https://api.open-meteo.com/v1/forecast';
const FORECAST_DAYS = 3;
/** Max grid cells per axis — keeps the request small and the field render-cheap. */
const MAX_AXIS = 12;
const MIN_AXIS = 6;
/** Total cell cap so a fetch is a SINGLE request (avoids rate-limiting). */
const MAX_CELLS = 100;
/** Open-Meteo handles multi-location requests; chunk to keep URLs sane. */
const COORDS_PER_REQUEST = 100;
const CACHE_TTL_MS = 30 * 60 * 1000;

export interface GridSpec {
  width: number;
  height: number;
  lats: number[];
  lons: number[];
}

/**
 * Choose a grid resolution for a bbox: roughly square cells, capped so the
 * request stays small. Spacing finer than the model just interpolates — fine.
 */
export function buildGrid(bbox: WindBBox): GridSpec {
  const latSpan = Math.max(1e-6, bbox.north - bbox.south);
  const lonSpan = Math.max(1e-6, bbox.east - bbox.west);
  const aspect = lonSpan / latSpan;
  const base = 12;
  let width = Math.max(MIN_AXIS, Math.min(MAX_AXIS, Math.round(base * Math.sqrt(aspect))));
  let height = Math.max(MIN_AXIS, Math.min(MAX_AXIS, Math.round(base / Math.sqrt(aspect))));
  // Keep total cells within one request's worth so a fetch never gets chunked
  // (multiple chunks risk rate-limiting and partial/empty results).
  while (width * height > MAX_CELLS) {
    if (width >= height) width--;
    else height--;
  }

  const lats: number[] = [];
  const lons: number[] = [];
  for (let r = 0; r < height; r++) {
    lats.push(bbox.south + (r * latSpan) / (height - 1));
  }
  for (let c = 0; c < width; c++) {
    lons.push(bbox.west + (c * lonSpan) / (width - 1));
  }
  return { width, height, lats, lons };
}

/**
 * Meteorological wind (speed m/s + direction the wind comes FROM, deg from N)
 * to eastward/northward components. Wind from the north (dir 0) blows south,
 * so v is negative; from the east (dir 90) blows west, so u is negative.
 */
export function speedDirToUV(speedMs: number, dirDeg: number): { u: number; v: number } {
  const r = (dirDeg * Math.PI) / 180;
  return { u: -speedMs * Math.sin(r), v: -speedMs * Math.cos(r) };
}

interface OpenMeteoHourly {
  time?: string[];
  [key: string]: unknown;
}
interface OpenMeteoLocation {
  hourly?: OpenMeteoHourly;
}

/**
 * Turn the per-location hourly speed/direction arrays into stacked u/v frames.
 * `locations` must be in the same order as the flattened grid (row-major).
 */
export function parseWindResponse(
  locations: OpenMeteoLocation[],
  grid: GridSpec,
  altitudeM: number,
): { frames: WindFrame[]; speedMax: number } {
  const cells = grid.width * grid.height;
  const speedKey = `wind_speed_${altitudeM}m`;
  const dirKey = `wind_direction_${altitudeM}m`;

  // Hour count from the first location that has a time array.
  const times = locations.find((l) => Array.isArray(l.hourly?.time))?.hourly?.time ?? [];
  const hourCount = times.length;

  const frames: WindFrame[] = [];
  let speedMax = 0;

  for (let h = 0; h < hourCount; h++) {
    const u = new Array<number>(cells).fill(0);
    const v = new Array<number>(cells).fill(0);
    for (let i = 0; i < cells; i++) {
      const loc = locations[i];
      const speedArr = loc?.hourly?.[speedKey] as number[] | undefined;
      const dirArr = loc?.hourly?.[dirKey] as number[] | undefined;
      const speed = speedArr?.[h];
      const dir = dirArr?.[h];
      if (typeof speed === 'number' && typeof dir === 'number' && Number.isFinite(speed)) {
        const { u: cu, v: cv } = speedDirToUV(speed, dir);
        u[i] = cu;
        v[i] = cv;
        if (speed > speedMax) speedMax = speed;
      }
    }
    frames.push({ time: times[h] ?? `+${h}h`, u, v });
  }

  return { frames, speedMax };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

interface CacheEntry {
  key: string;
  field: WindField;
  at: number;
}
let cache: CacheEntry | null = null;

function roundBox(b: WindBBox): WindBBox {
  const r = (n: number): number => Math.round(n * 100) / 100; // 0.01 deg
  return { south: r(b.south), north: r(b.north), west: r(b.west), east: r(b.east) };
}

/** Expand a bbox around its centre to at least `minDeg` on each axis. A tight
 *  zoom would otherwise collapse to a degenerate (zero-span) grid. */
function ensureMinSpan(b: WindBBox, minDeg: number): WindBBox {
  const cLat = (b.south + b.north) / 2;
  const cLon = (b.west + b.east) / 2;
  const halfLat = Math.max((b.north - b.south) / 2, minDeg / 2);
  const halfLon = Math.max((b.east - b.west) / 2, minDeg / 2);
  return { south: cLat - halfLat, north: cLat + halfLat, west: cLon - halfLon, east: cLon + halfLon };
}

/** Fetch a regional wind field from Open-Meteo. Returns null on failure. */
export async function fetchWindField(params: WindFetchParams): Promise<WindField | null> {
  const bbox = ensureMinSpan(roundBox(params.bbox), 0.3);
  const altitudeM = params.altitudeM;
  const key = `${altitudeM}|${bbox.south},${bbox.west},${bbox.north},${bbox.east}`;
  const now = Date.now();
  if (cache && cache.key === key && now - cache.at < CACHE_TTL_MS) return cache.field;

  const grid = buildGrid(bbox);
  // Flatten row-major (south-up) into parallel lat/lon lists.
  const flatLat: number[] = [];
  const flatLon: number[] = [];
  for (let r = 0; r < grid.height; r++) {
    for (let c = 0; c < grid.width; c++) {
      flatLat.push(Number(grid.lats[r]!.toFixed(4)));
      flatLon.push(Number(grid.lons[c]!.toFixed(4)));
    }
  }

  const latChunks = chunk(flatLat, COORDS_PER_REQUEST);
  const lonChunks = chunk(flatLon, COORDS_PER_REQUEST);
  const hourly = `wind_speed_${altitudeM}m,wind_direction_${altitudeM}m`;

  try {
    const locations: OpenMeteoLocation[] = [];
    for (let i = 0; i < latChunks.length; i++) {
      const lat = latChunks[i]!.join(',');
      const lon = lonChunks[i]!.join(',');
      const url =
        `${API_URL}?latitude=${lat}&longitude=${lon}&hourly=${hourly}` +
        `&wind_speed_unit=ms&timezone=UTC&forecast_days=${FORECAST_DAYS}&cell_selection=nearest`;
      const res = await fetch(url);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Open-Meteo HTTP ${res.status} for ${latChunks[i]!.length} pts: ${body.slice(0, 200)}`); // i18n-exempt
      }
      const json = await res.json();
      // Open-Meteo returns an array for multi-location requests, an object for one.
      if (Array.isArray(json)) locations.push(...(json as OpenMeteoLocation[]));
      else locations.push(json as OpenMeteoLocation);
    }

    const { frames, speedMax } = parseWindResponse(locations, grid, altitudeM);
    if (frames.length === 0) {
      throw new Error(`Open-Meteo: no frames (locs=${locations.length}, firstHourlyKeys=${JSON.stringify(Object.keys(locations[0]?.hourly ?? {}))})`);
    }

    const field: WindField = {
      width: grid.width,
      height: grid.height,
      bbox,
      altitudeM,
      frames,
      speedMax: Math.max(speedMax, 1),
      modelLabel: `Open-Meteo · ${altitudeM} m`,
      fetchedAt: now,
    };
    cache = { key, field, at: now };
    return field;
  } catch (err) {
    // [wind] temporary: surface the real reason as a STRING (Error objects
    // serialize to {} across the IPC/log boundary, hiding the message).
    const detail = err instanceof Error ? (err.stack ?? err.message) : String(err);
    const cause = (err as { cause?: unknown })?.cause;
    console.error('[wind:main] fetchWindField failed', {
      bbox,
      altitudeM,
      grid: `${grid.width}x${grid.height}`,
      error: detail,
      cause: cause instanceof Error ? cause.message : cause ? String(cause) : undefined,
    });
    if (cache?.key === key) return cache.field;
    return null;
  }
}
