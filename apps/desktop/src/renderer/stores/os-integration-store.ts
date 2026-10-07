import { create } from 'zustand';
import type { OsIntegrationInfo, OsLinksState, OsDiscoveredVehicle } from '../../shared/ardudeck-os-types';
import { useConnectionStore } from './connection-store';

interface OsIntegrationStore {
  info: OsIntegrationInfo;
  links: OsLinksState | null;
  /** Probe once at startup; on ArduDeck OS keep the app attached to the OS link. */
  init: () => Promise<void>;
  refreshLinks: () => Promise<void>;
  setActiveLink: (id: string) => Promise<{ success: boolean; error?: string }>;
  connectDiscovered: (vehicle: OsDiscoveredVehicle) => Promise<{ success: boolean; error?: string }>;
  /** Join every discovered vehicle to the OS link at once, as a swarm. */
  connectAllDiscovered: (vehicles: OsDiscoveredVehicle[]) => Promise<{ success: boolean; error?: string }>;
  openLinkSettings: () => void;
}

const ATTACH_EVERY_MS = 3000;
const LINKS_EVERY_MS = 2000;
let initStarted = false;

/** Attach to the OS link unless already attached or attaching. */
async function attach(info: Extract<OsIntegrationInfo, { available: true }>): Promise<void> {
  const conn = useConnectionStore.getState();
  if (conn.connectionState.isConnected || conn.isConnecting) return;
  await conn.connect({
    type: 'udp',
    udpMode: 'client',
    udpRemoteHost: info.clientHost,
    udpRemotePort: info.clientPort,
    udpClientLocalPort: info.clientLocalPort,
    protocol: 'mavlink',
  }).catch(() => false);
}

/**
 * ArduDeck OS integration. On ArduDeck OS the system owns the vehicle link, so
 * the app stays attached to it (reattaching after any drop) and connection
 * choices go to the OS. Off ArduDeck OS the probe answers `available: false`
 * and nothing here runs.
 */
export const useOsIntegrationStore = create<OsIntegrationStore>((set, get) => ({
  info: { available: false },
  links: null,

  init: async () => {
    if (initStarted) return;
    initStarted = true;
    const info = await window.electronAPI?.getOsIntegration?.().catch(() => null);
    if (!info?.available) return;
    set({ info });
    await attach(info);
    setInterval(() => void attach(info), ATTACH_EVERY_MS);
    void get().refreshLinks();
    setInterval(() => void get().refreshLinks(), LINKS_EVERY_MS);
  },

  refreshLinks: async () => {
    const links = await window.electronAPI?.getOsLinks?.().catch(() => null);
    set({ links: links ?? null });
  },

  setActiveLink: async (id) => {
    const result = await window.electronAPI.setOsActiveLink(id);
    await get().refreshLinks();
    return result;
  },

  connectDiscovered: async (vehicle) => {
    const result = await window.electronAPI.connectOsDiscovered(vehicle.connection);
    await get().refreshLinks();
    return result;
  },

  connectAllDiscovered: async (vehicles) => {
    for (const v of vehicles) {
      const result = await window.electronAPI.connectOsDiscovered(v.connection, true);
      if (!result.success) {
        await get().refreshLinks();
        return result;
      }
    }
    await get().refreshLinks();
    return { success: true };
  },

  openLinkSettings: () => {
    void window.electronAPI?.openOsLinkSettings?.();
  },
}));
