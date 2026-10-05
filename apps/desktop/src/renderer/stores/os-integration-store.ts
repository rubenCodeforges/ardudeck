import { create } from 'zustand';
import type { OsIntegrationInfo } from '../../shared/ardudeck-os-types';
import { useConnectionStore } from './connection-store';

interface OsIntegrationStore {
  info: OsIntegrationInfo;
  /** Probe once at startup; connects through the OS link when it already sees a vehicle. */
  init: () => Promise<void>;
}

let initStarted = false;

/**
 * ArduDeck OS integration state. Off ArduDeck OS the probe answers
 * `available: false` and nothing else happens.
 */
export const useOsIntegrationStore = create<OsIntegrationStore>((set) => ({
  info: { available: false },

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    const info = await window.electronAPI?.getOsIntegration?.().catch(() => null);
    if (!info) return;
    set({ info });
    if (!info.available || !info.vehicle) return;

    // The service already has the vehicle: open connected instead of on the
    // connect screen. Never override a connection the pilot already made.
    const conn = useConnectionStore.getState();
    if (conn.connectionState.isConnected || conn.isConnecting) return;
    await conn.connect({
      type: 'udp',
      udpMode: 'client',
      udpRemoteHost: info.clientHost,
      udpRemotePort: info.clientPort,
      udpClientLocalPort: info.clientLocalPort,
    });
  },
}));
