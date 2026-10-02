/**
 * State for the pre-flight weather briefing panel. Resolves WHERE to query
 * (vehicle position, then home, then the map center, unless the operator has
 * picked a plan-ahead location) and drives the Open-Meteo fetch plus the
 * space-weather (Kp) fetch and the offline WMM field computation, exposing
 * loading / error / no-position states for the view.
 *
 * Self-contained so the whole weather feature lifts into a cargo module later:
 * it only reads from the shared telemetry / mission / map stores, nothing here
 * depends on the panel.
 */
import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import { getCurrentWeather, type WeatherSummary } from '../utils/weather-api';
import {
  getGeomagneticActivity, type GeomagneticActivity,
} from '../utils/geomag-activity-api';
import {
  computeGeomagneticField, isWithinModelValidity, type GeomagneticField,
} from '../utils/wmm';
import { hasValidCoordinates } from '../../shared/mission-types';
import { useTelemetryStore } from './telemetry-store';
import { useMissionStore } from './mission-store';
import { useConnectionStore } from './connection-store';
import { useActiveVehicleStore } from './active-vehicle-store';
import { useEditModeStore } from './edit-mode-store';
import { useSettingsStore } from './settings-store';

export type WeatherLocationSource = 'vehicle' | 'home' | 'map' | 'override';

export interface ResolvedWeatherLocation {
  lat: number;
  lon: number;
  source: WeatherLocationSource;
  /** Display name for a picked (override) location. */
  name?: string;
}

/** A plan-ahead location the operator picked, overriding the automatic chain. */
export interface WeatherLocationOverride {
  lat: number;
  lon: number;
  name: string;
}

interface WeatherStore {
  weather: WeatherSummary | null;
  loading: boolean;
  /** Set when a fetch failed or returned nothing. null while healthy. */
  error: string | null;
  /** Where the current data was queried. null means no position was resolvable. */
  location: ResolvedWeatherLocation | null;
  /** epoch ms of the last completed refresh attempt (success or failure). */
  lastFetchMs: number | null;

  /** Space-weather snapshot (current Kp + forecast peak). null while degraded. */
  geomag: GeomagneticActivity | null;
  /** True when the Kp fetch failed, so the view can show a muted unavailable state. */
  geomagUnavailable: boolean;
  /** Offline WMM field at the briefing site. Recomputed whenever the site moves. */
  geomagField: GeomagneticField | null;
  /** False when the briefing date sits outside the WMM validity window. */
  geomagModelValid: boolean;

  /** Plan-ahead override; when set both fetches use it in place of the auto chain. */
  override: WeatherLocationOverride | null;
  setLocationOverride: (override: WeatherLocationOverride) => void;
  clearLocationOverride: () => void;

  refresh: () => Promise<void>;
  reset: () => void;
}

/**
 * Vehicle position, then home, then the last map center. Mirrors the map's own
 * default-center precedence (session viewport, then the persisted one) so the
 * briefing queries the same place the operator is looking at when offline.
 */
export function resolveWeatherLocation(): ResolvedWeatherLocation | null {
  const conn = useConnectionStore.getState().connectionState;
  const hasFleet = Object.keys(useActiveVehicleStore.getState().knownVehicles).length > 0;
  const pos = useTelemetryStore.getState().position;
  if ((conn.isConnected || hasFleet) && pos && hasValidCoordinates(pos.lat, pos.lon)) {
    return { lat: pos.lat, lon: pos.lon, source: 'vehicle' };
  }

  const home = useMissionStore.getState().homePosition;
  if (home && hasValidCoordinates(home.lat, home.lon)) {
    return { lat: home.lat, lon: home.lon, source: 'home' };
  }

  const viewport = useEditModeStore.getState().mapViewport;
  if (viewport) {
    // MapViewport.center is [lng, lat].
    const [lng, lat] = viewport.center;
    if (hasValidCoordinates(lat, lng)) return { lat, lon: lng, source: 'map' };
  }
  const persisted = useSettingsStore.getState().missionMapViewport;
  if (persisted && hasValidCoordinates(persisted.lat, persisted.lng)) {
    return { lat: persisted.lat, lon: persisted.lng, source: 'map' };
  }

  return null;
}

/** A picked override wins over the automatic chain when present. */
function resolveActiveLocation(override: WeatherLocationOverride | null): ResolvedWeatherLocation | null {
  if (override && hasValidCoordinates(override.lat, override.lon)) {
    return { lat: override.lat, lon: override.lon, source: 'override', name: override.name };
  }
  return resolveWeatherLocation();
}

// Guards against a slow response from a superseded refresh overwriting a newer
// one (e.g. the auto-refresh timer firing while a manual refresh is in flight).
let refreshToken = 0;

export const useWeatherStore = create<WeatherStore>((set, get) => ({
  weather: null,
  loading: false,
  error: null,
  location: null,
  lastFetchMs: null,

  geomag: null,
  geomagUnavailable: false,
  geomagField: null,
  geomagModelValid: true,

  override: null,

  setLocationOverride: (override) => {
    set({ override });
    void get().refresh();
  },

  clearLocationOverride: () => {
    set({ override: null });
    void get().refresh();
  },

  refresh: async () => {
    const location = resolveActiveLocation(get().override);
    if (!location) {
      set({
        location: null, weather: null, error: null, loading: false,
        geomag: null, geomagUnavailable: false, geomagField: null, geomagModelValid: true,
      });
      return;
    }

    const token = ++refreshToken;
    set({ loading: true, location });

    // Kp is planetary (location independent); the WMM field is site specific and
    // pure/offline, so it is computed here from the resolved site with the call-
    // time date, never a module-scope one.
    const now = new Date();
    const geomagModelValid = isWithinModelValidity(now);
    const geomagField = computeGeomagneticField(location.lat, location.lon, now);

    const [summary, activity] = await Promise.all([
      getCurrentWeather(location.lat, location.lon),
      getGeomagneticActivity(now),
    ]);
    if (token !== refreshToken) return;

    set({
      weather: summary,
      error: summary ? null : t('stores:weatherStore.unavailable'),
      loading: false,
      lastFetchMs: Date.now(),
      geomag: activity,
      geomagUnavailable: activity === null,
      geomagField,
      geomagModelValid,
    });
  },

  reset: () => {
    refreshToken++;
    set({
      weather: null, loading: false, error: null, location: null, lastFetchMs: null,
      geomag: null, geomagUnavailable: false, geomagField: null, geomagModelValid: true,
      override: null,
    });
  },
}));
