/**
 * Elevation API utility using Open-Meteo's free elevation service
 * https://open-meteo.com/en/docs/elevation-api
 *
 * - Free, no API key required
 * - Uses Copernicus DEM (90m resolution)
 * - Worldwide coverage
 */

const OPEN_METEO_ELEVATION_URL = 'https://api.open-meteo.com/v1/elevation';

// Cache for elevation data to avoid redundant API calls
const elevationCache = new Map<string, number>();

function getCacheKey(lat: number, lon: number): string {
  // Round to 4 decimal places (~11m precision) for caching
  return `${lat.toFixed(4)},${lon.toFixed(4)}`;
}

/**
 * Fetch elevation for a single point
 */
export async function getElevation(lat: number, lon: number): Promise<number | null> {
  const cacheKey = getCacheKey(lat, lon);
  if (elevationCache.has(cacheKey)) {
    return elevationCache.get(cacheKey)!;
  }

  try {
    const response = await fetch(
      `${OPEN_METEO_ELEVATION_URL}?latitude=${lat}&longitude=${lon}`
    );

    if (!response.ok) {
      console.warn('Elevation API error:', response.status);
      return null;
    }

    const data = await response.json();
    const elevation = data.elevation?.[0] ?? null;

    if (elevation !== null) {
      elevationCache.set(cacheKey, elevation);
    }

    return elevation;
  } catch (error) {
    console.warn('Failed to fetch elevation:', error);
    return null;
  }
}

/**
 * Fetch elevation for multiple points (batched)
 * Open-Meteo supports up to 100 coordinates per request
 */
export async function getElevations(
  points: Array<{ lat: number; lon: number }>
): Promise<Array<number | null>> {
  if (points.length === 0) return [];

  // Check cache first
  const results: Array<number | null> = new Array(points.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedPoints: Array<{ lat: number; lon: number }> = [];

  points.forEach((point, index) => {
    const cacheKey = getCacheKey(point.lat, point.lon);
    if (elevationCache.has(cacheKey)) {
      results[index] = elevationCache.get(cacheKey)!;
    } else {
      uncachedIndices.push(index);
      uncachedPoints.push(point);
    }
  });

  // Fetch uncached points in batches of 100
  const BATCH_SIZE = 100;
  for (let i = 0; i < uncachedPoints.length; i += BATCH_SIZE) {
    const batch = uncachedPoints.slice(i, i + BATCH_SIZE);
    const batchIndices = uncachedIndices.slice(i, i + BATCH_SIZE);

    const lats = batch.map(p => p.lat).join(',');
    const lons = batch.map(p => p.lon).join(',');

    try {
      const response = await fetch(
        `${OPEN_METEO_ELEVATION_URL}?latitude=${lats}&longitude=${lons}`
      );

      if (!response.ok) {
        console.warn('Elevation API error:', response.status);
        continue;
      }

      const data = await response.json();
      const elevations: number[] = data.elevation ?? [];

      elevations.forEach((elevation, j) => {
        const originalIndex = batchIndices[j];
        const point = batch[j];

        if (elevation !== null && elevation !== undefined) {
          results[originalIndex] = elevation;
          elevationCache.set(getCacheKey(point.lat, point.lon), elevation);
        }
      });
    } catch (error) {
      console.warn('Failed to fetch elevations batch:', error);
    }
  }

  return results;
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
    const segmentDist = haversineDistance(start.lat, start.lon, end.lat, end.lon);
    segments.push({ start, end, distance: segmentDist });
    totalDistance += segmentDist;
  }

  if (totalDistance === 0) {
    return [{ ...waypoints[0], distance: 0 }];
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
  const lastSegment = segments[segments.length - 1];
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
}
