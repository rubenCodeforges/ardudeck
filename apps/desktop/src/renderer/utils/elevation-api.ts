/**
 * Ground elevation for any caller. Cargo DEMs and the app's terrain tiles answer first;
 * Open-Meteo's free elevation service (https://open-meteo.com/en/docs/elevation-api,
 * Copernicus DEM 90 m, no key) fills the rest, paused after a rate limit.
 */

import { demSourceAt } from '../stores/tile-source-store';
import { sourceElevation, terrainTileElevations } from './source-elevation';

const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';
const BATCH_SIZE = 100;

/** Open-Meteo's DEM is 90 m, so 200 samples keep full resolution up to an 18 km leg. */
export const MAX_SAMPLES_PER_LEG = 200;
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;
const WARN_INTERVAL_MS = 60_000;

// Tile and API answers only; cargo DEM points are read before the cache, so a source change cannot stale it.
const elevationCache = new Map<string, number>();
// One request per point across every caller: a second caller waits for the first one's answer.
const inflight = new Map<string, Promise<number | null>>();
let blockedUntil = 0;
let consecutiveLimits = 0;
const lastWarned = new Map<string, number>();

function getCacheKey(lat: number, lon: number): string {
  // Round to 4 decimal places (~11m precision) for caching
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

function warnThrottled(key: string, ...args: unknown[]): void {
  const now = Date.now();
  if (now - (lastWarned.get(key) ?? -Infinity) < WARN_INTERVAL_MS) return;
  lastWarned.set(key, now);
  console.warn(...args);
}

/** Retry-After in ms: delta seconds or an HTTP date; null when absent or unreadable. */
export function parseRetryAfter(value: string | null, now = Date.now()): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const at = Date.parse(value);
  return Number.isNaN(at) ? null : Math.max(0, at - now);
}

/** Whether the API is paused after a rate limit; callers get null heights meanwhile. */
export function isElevationApiBackingOff(): boolean {
  return Date.now() < blockedUntil;
}

function enterBackoff(retryAfter: string | null): void {
  // Batches already in flight when the limit hit land here too: one window, one warning.
  if (isElevationApiBackingOff()) return;
  const delay = Math.min(BACKOFF_MAX_MS, parseRetryAfter(retryAfter) ?? BACKOFF_BASE_MS * 2 ** consecutiveLimits);
  consecutiveLimits++;
  blockedUntil = Date.now() + delay;
  console.warn(`Elevation API rate limited, pausing requests for ${Math.round(delay / 1000)} s`); // i18n-exempt
}

async function fetchBatch(batch: Array<{ lat: number; lon: number }>): Promise<Array<number | null>> {
  const none = batch.map(() => null);
  if (isElevationApiBackingOff()) return none;
  const lats = batch.map(p => p.lat).join(',');
  const lons = batch.map(p => p.lon).join(',');
  try {
    const response = await fetch(`${OPEN_METEO_ELEVATION_URL}?latitude=${lats}&longitude=${lons}`);
    if (response.status === 429 || response.status === 503) {
      enterBackoff(response.headers.get('Retry-After'));
      return none;
    }
    if (!response.ok) {
      warnThrottled(`status:${response.status}`, 'Elevation API error:', response.status);
      return none;
    }
    consecutiveLimits = 0;
    const data = await response.json();
    const elevations: unknown[] = data.elevation ?? [];
    return batch.map((_, j) => (typeof elevations[j] === 'number' ? elevations[j] as number : null));
  } catch (error) {
    warnThrottled('network', 'Failed to fetch elevations batch:', error);
    return none;
  }
}

/**
 * Fetch elevation for a single point
 */
export async function getElevation(lat: number, lon: number): Promise<number | null> {
  const [h] = await getElevations([{ lat, lon }]);
  return h ?? null;
}

/**
 * Ground height (m MSL) per point, null where nothing answered. In order: a cargo DEM covering
 * the point, the cache, the app's terrain tiles, then Open-Meteo in batches of 100.
 */
export async function getElevations(
  points: Array<{ lat: number; lon: number }>
): Promise<Array<number | null>> {
  if (points.length === 0) return [];

  const results: Array<number | null> = new Array(points.length).fill(null);

  // Points inside a module DEM footprint read that DEM; the rest go to the cache and the API.
  await Promise.all(points.map(async (p, i) => {
    const source = demSourceAt(p.lat, p.lon);
    if (!source) return;
    const h = await sourceElevation(source, p.lat, p.lon);
    if (h !== null) results[i] = h;
  }));

  const open: number[] = [];
  points.forEach((point, index) => {
    if (results[index] !== null) return;
    const cached = elevationCache.get(getCacheKey(point.lat, point.lon));
    if (cached !== undefined) results[index] = cached;
    else open.push(index);
  });
  if (open.length === 0) return results;

  const fromTiles = await terrainTileElevations(open.map(i => points[i]!));
  const remaining: number[] = [];
  open.forEach((index, k) => {
    const h = fromTiles[k];
    if (h === null || h === undefined) {
      remaining.push(index);
      return;
    }
    results[index] = h;
    elevationCache.set(getCacheKey(points[index]!.lat, points[index]!.lon), h);
  });
  if (remaining.length === 0) return results;

  // Join requests already on their way, and send each new point once.
  const waits = new Map<string, Promise<number | null>>();
  const toFetch = new Map<string, { key: string; lat: number; lon: number }>();
  for (const index of remaining) {
    const p = points[index]!;
    const key = getCacheKey(p.lat, p.lon);
    const pending = inflight.get(key);
    if (pending) waits.set(key, pending);
    else if (!toFetch.has(key)) toFetch.set(key, { key, lat: p.lat, lon: p.lon });
  }
  const queue = [...toFetch.values()];

  // Batches go one after another, so a rate limit stops the rest of the chain.
  let chain: Promise<unknown> = Promise.resolve();
  for (let i = 0; i < queue.length; i += BATCH_SIZE) {
    const batch = queue.slice(i, i + BATCH_SIZE);
    const answer = chain.then(() => fetchBatch(batch));
    chain = answer;
    batch.forEach((p, j) => {
      const one = answer.then((heights) => {
        const h = heights[j] ?? null;
        if (h !== null) elevationCache.set(p.key, h);
        return h;
      });
      inflight.set(p.key, one);
      waits.set(p.key, one);
      void one.finally(() => {
        if (inflight.get(p.key) === one) inflight.delete(p.key);
      });
    });
  }

  const settled = new Map<string, number | null>();
  await Promise.all([...waits].map(async ([key, wait]) => settled.set(key, await wait)));
  for (const index of remaining) {
    results[index] = settled.get(getCacheKey(points[index]!.lat, points[index]!.lon)) ?? null;
  }
  return results;
}

/**
 * Evenly spaced points from a to b, both ends included, about spacingMeters apart but never
 * more than maxSamples: a 1,000 km leg costs two requests, not two thousand. Raise maxSamples
 * only when the points are known to read a local DEM.
 */
export function sampleLeg(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number },
  spacingMeters: number,
  { minSamples = 1, maxSamples = MAX_SAMPLES_PER_LEG }: { minSamples?: number; maxSamples?: number } = {},
): Array<{ lat: number; lon: number }> {
  const dist = haversineDistance(a.lat, a.lon, b.lat, b.lon);
  const wanted = Math.ceil(dist / Math.max(1, spacingMeters));
  const count = Math.max(1, Math.min(maxSamples - 1, Math.max(minSamples, wanted)));
  const out: Array<{ lat: number; lon: number }> = [];
  for (let i = 0; i <= count; i++) {
    const t = i / count;
    out.push({ lat: a.lat + (b.lat - a.lat) * t, lon: a.lon + (b.lon - a.lon) * t });
  }
  return out;
}

/**
 * Interpolate points along a path for terrain sampling
 * Returns evenly spaced points along the mission path
 */
export function interpolatePathPoints(
  waypoints: Array<{ lat: number; lon: number }>,
  numSamples: number = 50
): Array<{ lat: number; lon: number; distance: number }> {
  if (waypoints.length < 2) {
    return waypoints.map(wp => ({ ...wp, distance: 0 }));
  }

  // Calculate total distance and segment distances
  const segments: Array<{ start: typeof waypoints[0]; end: typeof waypoints[0]; distance: number }> = [];
  let totalDistance = 0;

  for (let i = 0; i < waypoints.length - 1; i++) {
    const start = waypoints[i];
    const end = waypoints[i + 1];
    const segmentDist = haversineDistance(start!.lat, start!.lon, end!.lat, end!.lon);
    segments.push({ start: start!, end: end!, distance: segmentDist });
    totalDistance += segmentDist;
  }

  if (totalDistance === 0) {
    return [{ ...waypoints[0]!, distance: 0 }];
  }

  // Generate evenly spaced sample points
  const points: Array<{ lat: number; lon: number; distance: number }> = [];
  const sampleInterval = totalDistance / (numSamples - 1);

  for (let i = 0; i < numSamples; i++) {
    const targetDistance = i * sampleInterval;
    const point = getPointAtDistance(segments, targetDistance);
    points.push({ ...point, distance: targetDistance });
  }

  return points;
}

/**
 * Get a point at a specific distance along the path
 */
function getPointAtDistance(
  segments: Array<{ start: { lat: number; lon: number }; end: { lat: number; lon: number }; distance: number }>,
  targetDistance: number
): { lat: number; lon: number } {
  let accumulatedDistance = 0;

  for (const segment of segments) {
    if (accumulatedDistance + segment.distance >= targetDistance) {
      // Point is in this segment
      const segmentProgress = segment.distance > 0
        ? (targetDistance - accumulatedDistance) / segment.distance
        : 0;

      return {
        lat: segment.start.lat + (segment.end.lat - segment.start.lat) * segmentProgress,
        lon: segment.start.lon + (segment.end.lon - segment.start.lon) * segmentProgress,
      };
    }
    accumulatedDistance += segment.distance;
  }

  // Return last point if beyond path
  const lastSegment = segments[segments.length - 1]!;
  return { lat: lastSegment.end.lat, lon: lastSegment.end.lon };
}

/**
 * Haversine distance between two coordinates (meters)
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Clear the elevation cache
 */
export function clearElevationCache(): void {
  elevationCache.clear();
  inflight.clear();
  blockedUntil = 0;
  consecutiveLimits = 0;
  lastWarned.clear();
}
