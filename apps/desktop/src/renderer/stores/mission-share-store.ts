import { create } from 'zustand';
import type { IncomingShare, MissionPackage } from '../../shared/mission-share-types';

interface MissionShareState {
  /** Shared versions from teammates not reviewed yet, newest first. */
  incoming: IncomingShare[];
  /** A package the pilot opened from a file (toolbar Open), reviewed on the same card. */
  opened: MissionPackage | null;
  refresh: () => Promise<void>;
  /** Marks the shared version reviewed, whatever the pilot chose. */
  dismiss: (share: IncomingShare) => Promise<void>;
  closeOpened: () => void;
}

export const useMissionShareStore = create<MissionShareState>((set, get) => ({
  incoming: [],
  opened: null,

  refresh: async () => {
    const incoming = (await window.electronAPI?.fleetRepoPendingShares?.()) ?? [];
    set({ incoming });
  },

  dismiss: async (share) => {
    await window.electronAPI?.fleetRepoDismissShare?.(share.path, share.pkg.sharedAt);
    set({ incoming: get().incoming.filter((s) => s.path !== share.path) });
  },

  closeOpened: () => set({ opened: null }),
}));
