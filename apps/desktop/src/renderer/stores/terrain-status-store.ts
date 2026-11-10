/**
 * Terrain state per vehicle: availability from TERRAIN_REPORT (136) and the
 * GCS terrain uplink counters (TERRAIN_REQUEST -> TERRAIN_DATA, main process).
 * `loaded > 0` is the signal that terrain-relative commands can work; no report
 * at all means TERRAIN_ENABLE is off or the vehicle predates the message, and
 * the FC will reject terrain frames.
 */
import { create } from 'zustand';
import type { TerrainUplinkStatus } from '../../shared/tile-source-types';

export interface TerrainStatus {
  loaded: number;
  pending: number;
  spacing: number;
}

interface TerrainStatusStore {
  bySysid: Record<number, TerrainStatus>;
  /** GCS terrain uplink counters per vehicle (blocks served, blocks with missing data and why, ignored requests). */
  uplink: Record<number, TerrainUplinkStatus>;
  setUplink: (sysid: number, status: TerrainUplinkStatus) => void;
  setStatus: (sysid: number, status: TerrainStatus) => void;
  clearAll: () => void;
}

export const useTerrainStatusStore = create<TerrainStatusStore>((set) => ({
  bySysid: {},
  setStatus: (sysid, status) =>
    set((state) => {
      const prev = state.bySysid[sysid];
      // Reports arrive at ~1Hz per vehicle; skip the store write (and every
      // subscribed re-render) when nothing changed, which is the normal case.
      if (prev && prev.loaded === status.loaded && prev.pending === status.pending && prev.spacing === status.spacing) {
        return state;
      }
      return { bySysid: { ...state.bySysid, [sysid]: status } };
    }),
  uplink: {},
  setUplink: (sysid, status) => set((state) => ({ uplink: { ...state.uplink, [sysid]: status } })),
  clearAll: () => set({ bySysid: {}, uplink: {} }),
}));

/**
 * Terrain availability for a vehicle: true/false when known, undefined when
 * the vehicle has never sent a TERRAIN_REPORT. With no sysid (bare primary
 * connection before fleet registration) falls back to the only reporting
 * vehicle if there is exactly one.
 */
export const useTerrainAvailable = (sysid: number | undefined): boolean | undefined =>
  useTerrainStatusStore((s) => {
    const status = sysid !== undefined
      ? s.bySysid[sysid]
      : Object.keys(s.bySysid).length === 1
        ? s.bySysid[Number(Object.keys(s.bySysid)[0])]
        : undefined;
    return status === undefined ? undefined : status.loaded > 0;
  });
