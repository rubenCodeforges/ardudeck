import { create } from 'zustand';
import type { OverlayId, AirspaceData, RainViewerMeta } from '../../shared/overlay-types';

interface OverlayStore {
  // Toggle state
  activeOverlays: Set<OverlayId>;
  toggleOverlay: (id: OverlayId) => void;

  // Radar
  radarMeta: RainViewerMeta | null;
  fetchRadarMeta: () => Promise<void>;

  // Airspace zones
  airspaceData: AirspaceData[];
  fetchAirspaceData: (lat: number, lon: number, zoom: number) => Promise<void>;

  // API key state
  openaipKeyMissing: boolean;
  showApiKeyDialog: boolean;
  setShowApiKeyDialog: (show: boolean) => void;
  checkApiKey: () => Promise<boolean>;

  // Throttling state (airspace fetching)
  _lastFetchPos: { lat: number; lon: number; zoom: number } | null;
  _lastFetchTime: number;
}

const MIN_FETCH_INTERVAL = 30_000; // 30s
const MIN_POSITION_DELTA_KM = 10;
const MIN_ZOOM_DELTA = 1.5;

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export const useOverlayStore = create<OverlayStore>((set, get) => ({
  activeOverlays: new Set(),
  radarMeta: null,
  airspaceData: [],
  openaipKeyMissing: false,
  showApiKeyDialog: false,
  _lastFetchPos: null,
  _lastFetchTime: 0,

  toggleOverlay: (id) => {
    const state = get();
    const current = new Set(state.activeOverlays);
    if (current.has(id)) {
      current.delete(id);
    } else {
      // If enabling an OpenAIP-dependent overlay, check for API key first
      if ((id === 'openaip' || id === 'airspace') && state.openaipKeyMissing) {
        set({ showApiKeyDialog: true });
        return;
      }
      current.add(id);
    }
    set({ activeOverlays: current });
  },

  setShowApiKeyDialog: (show) => set({ showApiKeyDialog: show }),

  checkApiKey: async () => {
    const result = await window.electronAPI.getApiKey('openaip');
    const missing = !result?.hasKey;
    set({ openaipKeyMissing: missing });
    return !missing;
  },

  fetchRadarMeta: async () => {
    try {
      const meta = await window.electronAPI.getRadarMeta();
      if (meta) set({ radarMeta: meta as RainViewerMeta });
    } catch {
      // Ignore — keep stale meta
    }
  },

  fetchAirspaceData: async (lat, lon, zoom) => {
    const state = get();
    if (!state.activeOverlays.has('airspace')) return;

    const now = Date.now();
    if (now - state._lastFetchTime < MIN_FETCH_INTERVAL) return;

    if (state._lastFetchPos) {
      const dist = haversineKm(lat, lon, state._lastFetchPos.lat, state._lastFetchPos.lon);
      const zoomDelta = Math.abs(zoom - state._lastFetchPos.zoom);
      if (dist < MIN_POSITION_DELTA_KM && zoomDelta < MIN_ZOOM_DELTA) return;
    }

    set({ _lastFetchPos: { lat, lon, zoom }, _lastFetchTime: now });

    try {
      const result = await window.electronAPI.getAirspace({ lat, lon, zoom });
      const res = result as { error?: string; data: AirspaceData[] };
      if (res.error === 'no-key') {
        set({ openaipKeyMissing: true, showApiKeyDialog: true });
        return;
      }
      set({ airspaceData: res.data });
    } catch {
      // Ignore — keep stale data
    }
  },
}));
