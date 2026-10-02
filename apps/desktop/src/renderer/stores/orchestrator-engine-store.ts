/**
 * Local orchestrator engine state - the invisible multi-vehicle engine the desktop spawns
 * as a localhost child. The Multi-vehicle panel drives this: one Start brings the engine up
 * (and the main process auto-connects to it); adding a source restarts it with the new link.
 *
 * Distinct from `orchestration-store` (which tracks server welcome/roster/intents for any
 * connected orchestration link); this one owns the *local engine's process lifecycle*.
 */

import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import type { OrchestratorSource, OrchestratorStatus } from '../../shared/ipc-channels';

interface OrchestratorEngineStore {
  isRunning: boolean;
  /** A start/stop/restart is in flight. */
  busy: boolean;
  sources: OrchestratorSource[];
  error: string | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
  addSource: (source: OrchestratorSource) => Promise<void>;
  removeSource: (index: number) => Promise<void>;
  /** Subscribe to engine state pushes; returns an unsubscribe. Call once on mount. */
  initListeners: () => () => void;
}

type SetFn = (partial: Partial<OrchestratorEngineStore>) => void;

function apply(set: SetFn, status: OrchestratorStatus): void {
  set({ isRunning: status.isRunning, sources: status.sources, error: status.error ?? null });
}

export const useOrchestratorEngineStore = create<OrchestratorEngineStore>((set, get) => ({
  isRunning: false,
  busy: false,
  sources: [],
  error: null,

  start: async () => {
    set({ busy: true, error: null });
    try {
      apply(set, await window.electronAPI.orchestratorStart());
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('stores:orchestratorEngineStore.startFailed') });
    } finally {
      set({ busy: false });
    }
  },

  stop: async () => {
    set({ busy: true });
    try {
      apply(set, await window.electronAPI.orchestratorStop());
    } finally {
      set({ busy: false });
    }
  },

  addSource: async (source) => {
    const next = [...get().sources, source];
    set({ busy: true, error: null });
    try {
      apply(set, await window.electronAPI.orchestratorSetSources(next));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : t('stores:orchestratorEngineStore.addSourceFailed') });
    } finally {
      set({ busy: false });
    }
  },

  removeSource: async (index) => {
    const next = get().sources.filter((_, i) => i !== index);
    set({ busy: true });
    try {
      apply(set, await window.electronAPI.orchestratorSetSources(next));
    } finally {
      set({ busy: false });
    }
  },

  initListeners: () => {
    void window.electronAPI.orchestratorGetStatus().then((s) => apply(set, s)).catch(() => undefined);
    return window.electronAPI.onOrchestratorState((s) => apply(set, s));
  },
}));
