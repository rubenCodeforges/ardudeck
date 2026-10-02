import { create } from 'zustand';

// Unsaved config-tab edits, outside the tabs so a tab switch keeps them and Save All writes them.
export interface PendingWrite<D = unknown> {
  /** Shown when the write fails, e.g. "Navigation". */
  label: string;
  /** The tab's edited values; a remounted tab shows these instead of reloading from the FC. */
  draft: D;
  /** Sends the draft to the FC without the EEPROM write; resolves false if anything was rejected. */
  write: (draft: D) => Promise<boolean>;
  /** The FC only applies this after a reboot (mixer changes). */
  needsReboot?: boolean;
}

interface PendingWritesStore {
  pending: Record<string, PendingWrite>;
  put: <D>(id: string, entry: PendingWrite<D>) => void;
  drop: (id: string) => void;
  clearAll: () => void;
}

export const usePendingWritesStore = create<PendingWritesStore>((set) => ({
  pending: {},
  put: (id, entry) => set((s) => ({ pending: { ...s.pending, [id]: entry as PendingWrite } })),
  drop: (id) =>
    set((s) => {
      if (!(id in s.pending)) return s;
      const next = { ...s.pending };
      delete next[id];
      return { pending: next };
    }),
  clearAll: () => set({ pending: {} }),
}));

/** The draft a tab left behind, if it has unsaved edits. */
export function pendingDraft<D>(id: string): D | undefined {
  return usePendingWritesStore.getState().pending[id]?.draft as D | undefined;
}

export interface WriteAllResult {
  /** Labels of the tabs that did not save, with the reason when one is known. */
  failed: string[];
  reasons: Record<string, string>;
  wrote: number;
  needsReboot: boolean;
}

/**
 * Runs every pending write in order; succeeded ones are dropped, failed ones stay for a retry.
 * `explain` is asked right after a failure for why it failed (the FC's range, an unknown setting).
 */
export async function writeAllPending(explain?: () => Promise<string | null | undefined>): Promise<WriteAllResult> {
  const { pending, drop } = usePendingWritesStore.getState();
  const result: WriteAllResult = { failed: [], reasons: {}, wrote: 0, needsReboot: false };
  for (const [id, entry] of Object.entries(pending)) {
    let ok = false;
    try {
      ok = await entry.write(entry.draft);
    } catch {
      ok = false;
    }
    if (ok) {
      result.wrote++;
      if (entry.needsReboot) result.needsReboot = true;
      drop(id);
    } else {
      result.failed.push(entry.label);
      const reason = await explain?.().catch(() => null);
      if (reason) result.reasons[entry.label] = reason;
    }
  }
  return result;
}
