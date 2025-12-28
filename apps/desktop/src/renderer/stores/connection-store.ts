import { create } from 'zustand';
import type { ConnectionState, ConnectOptions } from '../../shared/ipc-channels';

interface ConnectionStore {
  // State
  connectionState: ConnectionState;
  isConnecting: boolean;
  error: string | null;

  // Actions
  setConnectionState: (state: ConnectionState) => void;
  setError: (error: string | null) => void;
  connect: (options: ConnectOptions) => Promise<boolean>;
  disconnect: () => Promise<void>;
}

export const useConnectionStore = create<ConnectionStore>((set, get) => ({
  connectionState: {
    isConnected: false,
    packetsReceived: 0,
    packetsSent: 0,
  },
  isConnecting: false,
  error: null,

  setConnectionState: (state) => set({ connectionState: state }),
  setError: (error) => set({ error }),

  connect: async (options) => {
    set({ isConnecting: true, error: null });
    try {
      const success = await window.electronAPI.connect(options);
      if (!success) {
        set({ error: 'Connection failed' });
      }
      return success;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      set({ error: message });
      return false;
    } finally {
      set({ isConnecting: false });
    }
  },

  disconnect: async () => {
    await window.electronAPI.disconnect();
  },
}));
