import { create } from 'zustand';
import { CARTO_KEY_SERVICE } from '../../shared/map-layers';

interface MapKeysState {
  carto: boolean;
  refresh: () => Promise<void>;
}

export const useMapKeysStore = create<MapKeysState>((set) => ({
  carto: false,
  refresh: async () => {
    const r = await window.electronAPI?.getApiKey?.(CARTO_KEY_SERVICE);
    set({ carto: !!r?.hasKey });
  },
}));

void useMapKeysStore.getState().refresh();
