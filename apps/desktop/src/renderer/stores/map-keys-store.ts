import { create } from 'zustand';
import { CARTO_KEY_SERVICE, TIANDITU_KEY_SERVICE } from '../../shared/map-layers';

interface MapKeysState {
  carto: boolean;
  tianditu: boolean;
  refresh: () => Promise<void>;
}

export const useMapKeysStore = create<MapKeysState>((set) => ({
  carto: false,
  tianditu: false,
  refresh: async () => {
    const [carto, tianditu] = await Promise.all([
      window.electronAPI?.getApiKey?.(CARTO_KEY_SERVICE),
      window.electronAPI?.getApiKey?.(TIANDITU_KEY_SERVICE),
    ]);
    set({ carto: !!carto?.hasKey, tianditu: !!tianditu?.hasKey });
  },
}));

void useMapKeysStore.getState().refresh();
