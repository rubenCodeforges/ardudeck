/**
 * IP Geolocation Utility
 *
 * Provides fallback location detection using IP-based geolocation.
 * Used when GPS is not available (disabled on FC, no fix, not connected).
 *
 * Falls back to:
 * 1. ip-api.com (free, no API key, 45 req/min)
 * 2. Browser geolocation API
 * 3. Default location (0, 0)
 */

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
  // Try IP-based geolocation first (more reliable, works without permission)
  try {
    const response = await fetch('http://ip-api.com/json/?fields=lat,lon,status', {
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    if (response.ok) {
      const data = await response.json();
      if (data.status === 'success' && data.lat && data.lon) {
        console.log('[ip-geolocation] Got location from IP:', data.lat, data.lon);
        return {
          lat: data.lat,
          lon: data.lon,
          source: 'ip',
        };
      }
    }
  } catch (err) {
    console.log('[ip-geolocation] IP lookup failed:', err);
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

    console.log('[ip-geolocation] Got location from browser:', position.coords.latitude, position.coords.longitude);
    return {
      lat: position.coords.latitude,
      lon: position.coords.longitude,
      source: 'browser',
      accuracy: position.coords.accuracy,
    };
  } catch (err) {
    console.log('[ip-geolocation] Browser geolocation failed:', err);
  }

  // Final fallback: return default (0, 0 - null island)
  console.log('[ip-geolocation] Using default location');
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
import { useState, useEffect } from 'react';

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
