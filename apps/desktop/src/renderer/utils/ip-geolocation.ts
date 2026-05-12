/**
 * IP Geolocation Utility
 *
 * Provides fallback location detection using IP-based geolocation.
 * Used when GPS is not available (disabled on FC, no fix, not connected).
 *
 * Electron CSP allows https: for connect-src but not arbitrary http: (see main/index.ts).
 * We therefore use HTTPS-only IP lookup endpoints (no API keys on free tier).
 *
 * Falls back in order:
 * 1. ipwho.is (HTTPS)
 * 2. geojs.io (HTTPS)
 * 3. Browser geolocation API
 * 4. Default location (0, 0)
 */

import { useState, useEffect } from 'react';

export interface GeoLocation {
  lat: number;
  lon: number;
  source: 'ip' | 'browser' | 'default';
  accuracy?: number; // meters (browser only)
}

// Cache the result to avoid repeated API calls
let cachedLocation: GeoLocation | null = null;
let cacheTimestamp = 0;
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

// In-flight promise to prevent duplicate requests
let pendingRequest: Promise<GeoLocation> | null = null;

/**
 * Get user's approximate location via IP geolocation
 * Results are cached for 30 minutes
 */
export async function getIpLocation(): Promise<GeoLocation> {
  // Return cached if fresh
  if (cachedLocation && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedLocation;
  }

  // Return pending request if one is in flight
  if (pendingRequest) {
    return pendingRequest;
  }

  // Start new request
  pendingRequest = fetchLocation();

  try {
    const result = await pendingRequest;
    cachedLocation = result;
    cacheTimestamp = Date.now();
    return result;
  } finally {
    pendingRequest = null;
  }
}

/**
 * Get cached location synchronously (may return null if not yet fetched)
 */
export function getCachedLocation(): GeoLocation | null {
  if (cachedLocation && Date.now() - cacheTimestamp < CACHE_DURATION) {
    return cachedLocation;
  }
  return null;
}

/**
 * Clear the location cache
 */
export function clearLocationCache(): void {
  cachedLocation = null;
  cacheTimestamp = 0;
}

async function fetchLocation(): Promise<GeoLocation> {
  const timeout = { signal: AbortSignal.timeout(5000) };

  // 1) ipwho.is — HTTPS, CORS-friendly for browser/Electron renderer
  try {
    const response = await fetch('https://ipwho.is/', timeout);
    if (response.ok) {
      const data = (await response.json()) as {
        success?: boolean;
        latitude?: number;
        longitude?: number;
      };
      if (data.success && typeof data.latitude === 'number' && typeof data.longitude === 'number') {
        return { lat: data.latitude, lon: data.longitude, source: 'ip' };
      }
    }
  } catch {
    /* try next provider */
  }

  // 2) geojs.io — HTTPS fallback
  try {
    const response = await fetch('https://get.geojs.io/v1/ip/geo.json', timeout);
    if (response.ok) {
      const data = (await response.json()) as {
        latitude?: string;
        longitude?: string;
      };
      const lat = data.latitude != null ? Number.parseFloat(data.latitude) : NaN;
      const lon = data.longitude != null ? Number.parseFloat(data.longitude) : NaN;
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat, lon, source: 'ip' };
      }
    }
  } catch {
    /* try next provider */
  }

  // Fallback: try browser geolocation
  try {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Geolocation not supported'));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        timeout: 5000,
        maximumAge: 600000, // Accept cached position up to 10 minutes old
      });
    });

    return {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      source: 'browser',
      accuracy: position.coords.accuracy,
    };
  } catch {
    /* fall through to default */
  }

  // Final fallback: return default (0, 0 - null island)
  return {
    lat: 0,
    lon: 0,
    source: 'default',
  };
}

/**
 * React hook for IP geolocation
 * Returns [location, isLoading]
 */
export function useIpLocation(): [GeoLocation | null, boolean] {
  const [location, setLocation] = useState<GeoLocation | null>(getCachedLocation());
  const [isLoading, setIsLoading] = useState(!cachedLocation);

  useEffect(() => {
    // If we already have a cached location, don't refetch
    if (cachedLocation && Date.now() - cacheTimestamp < CACHE_DURATION) {
      setLocation(cachedLocation);
      setIsLoading(false);
      return;
    }

    let mounted = true;

    getIpLocation().then((loc) => {
      if (mounted) {
        setLocation(loc);
        setIsLoading(false);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return [location, isLoading];
}
