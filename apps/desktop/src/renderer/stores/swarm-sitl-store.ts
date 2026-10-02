/**
 * Swarm SITL Store
 *
 * Drives the multi-instance SITL launcher. The main process spawns N SITL
 * binaries (each on TCP 5760 + 10*index via ArduPilot's `-I` offset). The swarm
 * is then routed through the local orchestrator engine: each instance is
 * registered as a `tcpout` source, so the single multi-vehicle engine dials it
 * (reconnecting until the SITL's TCP server is up), remaps it to a virtual sysid,
 * and surfaces the whole swarm as one fleet over the orchestration link. This is
 * also the live exercise of the full orchestrator path (identity, roster,
 * telemetry keeper, command passthrough). Stopping the swarm removes its sources.
 */

import { create } from 'zustand';
import { t } from '../../shared/i18n/index.js';
import { persist } from 'zustand/middleware';
import type {
  SwarmFormation,
  SwarmInstanceStatus,
  SwarmSitlLogLine,
  OrchestratorSource,
} from '../../shared/ipc-channels';
import { useArduPilotSitlStore } from './ardupilot-sitl-store';

const MAX_LOG_LINES = 500;

/** Instance i's MAVLink TCP server port (ArduPilot `-I` offset). */
const swarmTcpPort = (index: number): number => 5760 + 10 * index;
/** Label prefix that marks an orchestrator source as belonging to the swarm. */
const SWARM_SOURCE_PREFIX = 'swarm:';

/** Build the orchestrator tcpout sources for a swarm of `count` instances. */
function swarmSources(count: number): OrchestratorSource[] {
  return Array.from({ length: count }, (_, i) => {
    const port = swarmTcpPort(i);
    return { kind: 'tcp', host: '127.0.0.1', port, label: `${SWARM_SOURCE_PREFIX}${port}` };
  });
}

export interface SwarmSitlStore {
  // Config (persisted)
  count: number;
  spacingM: number;
  formation: SwarmFormation;

  // Runtime
  isRunning: boolean;
  isStarting: boolean;
  isStopping: boolean;
  instances: SwarmInstanceStatus[];
  log: string[];
  lastError: string | null;

  // Config setters
  setCount: (n: number) => void;
  setSpacingM: (m: number) => void;
  setFormation: (f: SwarmFormation) => void;

  // Lifecycle
  start: () => Promise<boolean>;
  stop: () => Promise<boolean>;
  initListeners: () => () => void;
  refreshStatus: () => Promise<void>;
}

export const useSwarmSitlStore = create<SwarmSitlStore>()(
  persist(
    (set, get) => ({
      count: 4,
      spacingM: 30,
      formation: 'grid',

      isRunning: false,
      isStarting: false,
      isStopping: false,
      instances: [],
      log: [],
      lastError: null,

      setCount: (n) => set({ count: Math.max(2, Math.min(20, Math.floor(n) || 2)) }),
      setSpacingM: (m) => set({ spacingM: Math.max(1, Math.floor(m) || 1) }),
      setFormation: (f) => set({ formation: f }),

      start: async () => {
        if (get().isRunning || get().isStarting) return false;
        // Base airframe + home come from the single-SITL config so the two
        // launchers stay in sync and the user configures the vehicle once.
        const ap = useArduPilotSitlStore.getState();
        const { count, spacingM, formation } = get();

        set({ isStarting: true, lastError: null, log: [], instances: [] });
        try {
          const result = await window.electronAPI.swarmSitlStart({
            vehicleType: ap.vehicleType,
            model: ap.model,
            releaseTrack: ap.releaseTrack,
            homeLocation: ap.homeLocation,
            speedup: ap.speedup,
            wipeOnStart: ap.wipeOnStart,
            count,
            spacingM,
            formation,
          });
          if (!result.success) {
            set({ isStarting: false, lastError: result.error ?? t('stores:swarmSitlStore.startFailed') });
            return false;
          }

          // Route the swarm through the orchestrator engine: register each instance
          // as a tcpout source (merged with any existing non-swarm sources). The
          // engine reconnects until each SITL's TCP server is up, so we can register
          // immediately without waiting for per-instance readiness.
          const sources = swarmSources(count);
          const status = await window.electronAPI.orchestratorGetStatus();
          const base = status.sources.filter((s) => !s.label?.startsWith(SWARM_SOURCE_PREFIX));
          const merged = [...base, ...sources];
          if (status.isRunning) {
            await window.electronAPI.orchestratorSetSources(merged);
          } else {
            await window.electronAPI.orchestratorStart(merged);
          }

          set((s) => ({
            isRunning: true,
            isStarting: false,
            instances: s.instances.length ? s.instances : (result.instances ?? []),
          }));
          return true;
        } catch (err) {
          set({ isStarting: false, lastError: err instanceof Error ? err.message : t('common:unknownError') });
          return false;
        }
      },

      stop: async () => {
        if (get().isStopping) return false;
        set({ isStopping: true });
        // Drop the swarm's sources from the engine (leave the engine + any other
        // sources running; the user stops multi-vehicle from its own panel).
        try {
          const status = await window.electronAPI.orchestratorGetStatus();
          if (status.isRunning) {
            const remaining = status.sources.filter((s) => !s.label?.startsWith(SWARM_SOURCE_PREFIX));
            await window.electronAPI.orchestratorSetSources(remaining);
          }
        } catch {
          // best-effort; we still stop the SITL processes below
        }
        try {
          await window.electronAPI.swarmSitlStop();
        } catch {
          // fall through — we still clear local state
        }
        set({ isRunning: false, isStopping: false, instances: [] });
        return true;
      },

      refreshStatus: async () => {
        try {
          const status = await window.electronAPI.swarmSitlGetStatus();
          set({ isRunning: status.isRunning, instances: status.instances });
        } catch {
          // ignore
        }
      },

      initListeners: () => {
        // Per-instance push: track lifecycle for the UI. Connection is handled by
        // the orchestrator engine (instances are registered as tcpout sources at
        // launch), so there's no per-instance transport to add here.
        const unsubInstance = window.electronAPI.onSwarmSitlInstance((inst: SwarmInstanceStatus) => {
          set((s) => ({ instances: upsertInstance(s.instances, inst) }));
        });

        const unsubState = window.electronAPI.onSwarmSitlState((status) => {
          set({ isRunning: status.isRunning, instances: status.instances });
        });

        const unsubLog = window.electronAPI.onSwarmSitlLog((line: SwarmSitlLogLine) => {
          set((s) => {
            const next = [...s.log, `[SYS ${line.sysid}] ${line.line}`];
            while (next.length > MAX_LOG_LINES) next.shift();
            return { log: next };
          });
        });

        return () => {
          unsubInstance();
          unsubState();
          unsubLog();
        };
      },
    }),
    {
      name: 'swarm-sitl-storage',
      partialize: (s) => ({ count: s.count, spacingM: s.spacingM, formation: s.formation }),
    },
  ),
);

/** Replace the matching instance by index, or append if new. */
function upsertInstance(list: SwarmInstanceStatus[], inst: SwarmInstanceStatus): SwarmInstanceStatus[] {
  const idx = list.findIndex((i) => i.index === inst.index);
  if (idx === -1) return [...list, inst].sort((a, b) => a.index - b.index);
  const next = [...list];
  next[idx] = inst;
  return next;
}
