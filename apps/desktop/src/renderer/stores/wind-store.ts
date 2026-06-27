/**
 * wind-store — data + settings for the animated wind overlay.
 *
 * Holds the fetched WindField (a stack of forecast-hour frames), the selected
 * altitude and forecast-hour index, and the particle speed multiplier. The
 * Leaflet overlay component drives fetchForBounds() on activation and on map
 * move; the animator reads the current frame via the store.
 */

import { create } from 'zustand';
import type { WindBBox, WindField, WindAltitude } from '../../shared/wind-types';
import { nextUnit, windUnitFromPreference, type WindUnit } from '../components/map/wind/wind-field';
import { useSettingsStore } from './settings-store';

interface WindStore {
  field: WindField | null;
  loading: boolean;
  error: string | null;
  altitudeM: WindAltitude;
  frameIndex: number;
  /** Particle speed multiplier (visual only). */
  speedScale: number;
  /** Display unit for wind speed readouts. */
  units: WindUnit;
  /** Most recent bounds requested, so an altitude change can refetch. */
  lastBounds: WindBBox | null;
  /** Clicked point whose wind rose is shown, or null. */
  probe: { lat: number; lng: number } | null;
  _token: number;

  fetchForBounds: (bounds: WindBBox) => Promise<void>;
  setAltitude: (altitudeM: WindAltitude) => void;
  setFrameIndex: (i: number) => void;
  setSpeedScale: (s: number) => void;
  setProbe: (p: { lat: number; lng: number } | null) => void;
  cycleUnits: () => void;
  clear: () => void;
}

/** Expand bounds around their centre so the field covers the view + a margin
 *  (particles reach the screen edges and small pans stay inside the field). */
function padBounds(b: WindBBox, frac: number): WindBBox {
  const dLat = (b.north - b.south) * frac;
  const dLng = (b.east - b.west) * frac;
  return { south: b.south - dLat, north: b.north + dLat, west: b.west - dLng, east: b.east + dLng };
}

export const useWindStore = create<WindStore>((set, get) => ({
  field: null,
  loading: false,
  error: null,
  altitudeM: 120,
  frameIndex: 0,
  speedScale: 1,
  units: windUnitFromPreference(useSettingsStore.getState().unitPreferences.windSpeed),
  lastBounds: null,
  probe: null,
  _token: 0,

  fetchForBounds: async (rawBounds) => {
    const bounds = padBounds(rawBounds, 0.3);
    const token = get()._token + 1;
    set({ _token: token, loading: true, error: null, lastBounds: bounds });
    // [wind] temporary diagnostics — remove once verified working
    console.info('[wind] fetch start', { bounds, altitudeM: get().altitudeM });
    try {
      const field = await window.electronAPI.getWindField({ bbox: bounds, altitudeM: get().altitudeM });
      if (get()._token !== token) return; // a newer request superseded this one
      if (!field) {
        console.warn('[wind] no field returned (fetch ok but empty)');
        set({ loading: false, error: 'Wind data unavailable' });
        return;
      }
      console.info('[wind] field loaded', { hours: field.frames.length, speedMax: field.speedMax, grid: `${field.width}x${field.height}` });
      const frameIndex = Math.min(get().frameIndex, field.frames.length - 1);
      set({ field, loading: false, error: null, frameIndex: Math.max(0, frameIndex) });
    } catch (err) {
      if (get()._token !== token) return;
      console.warn('[wind] fetch error', err);
      set({ loading: false, error: 'Wind fetch failed' });
    }
  },

  setAltitude: (altitudeM) => {
    set({ altitudeM });
    const b = get().lastBounds;
    if (b) void get().fetchForBounds(b);
  },

  setFrameIndex: (i) => {
    const field = get().field;
    if (!field) return;
    set({ frameIndex: Math.max(0, Math.min(i, field.frames.length - 1)) });
  },

  setSpeedScale: (s) => set({ speedScale: Math.max(0.2, Math.min(4, s)) }),

  setProbe: (p) => set({ probe: p }),

  cycleUnits: () => set((s) => ({ units: nextUnit(s.units) })),

  clear: () => set({ field: null, error: null, loading: false, probe: null }),
}));
