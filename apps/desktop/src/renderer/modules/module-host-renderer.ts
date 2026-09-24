import type { ComponentType } from 'react';
import type { RendererHostApi, MountPointName, HudProjection } from '@ardudeck/module-sdk';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useConnectionStore } from '../stores/connection-store';
import { useNavigationStore } from '../stores/navigation-store';
import { useParameterStore } from '../stores/parameter-store';
import { useLogStore } from '../stores/log-store';
import { CLAUDE_LOG_TOOLS, executeLogTool, listMessageTypes } from '../components/logs/log-ai-tools';
import { useMissionStore } from '../stores/mission-store';
import { useCommandTargetStore, commandTargetKey } from '../stores/command-target-store';
import {
  useFleetRepoStore,
  getCurrentVaultUnit,
  subscribeCurrentVaultUnit,
} from '../stores/fleet-repo-store';
import {
  registerModuleMapLayer,
  unregisterModuleMapLayer,
  unregisterModuleMapLayersFor,
} from './module-map-registry';
import { useHudStore } from '../stores/hud-store';
import { useHudOverlayStore } from '../stores/hud-overlay-store';
import { buildHudProjection } from '../components/camera/hud/hud-projection';
import {
  registerModuleOsdElement,
  unregisterModuleOsdElement,
} from './module-osd-registry';
import {
  registerModuleHudInstrument,
  unregisterModuleHudInstrument,
} from './module-hud-registry';
import {
  registerModulePanel,
  unregisterModulePanel,
} from './module-panel-registry';
import {
  registerSurveyGenerator,
  unregisterSurveyGenerator,
  type SurveyGeneratorRegistration,
} from '../components/survey/generator-registry';

type RegisterFn = (slug: string, name: MountPointName, component: ComponentType) => void;

// ── Host lifecycle events ───────────────────────────────────────
// Emitted by core surfaces (write-to-flash paths), consumed by modules via
// host.events. Module listeners must never break the emitter.

const paramsFlashedListeners = new Set<(info: { paramCount: number }) => void>();

/** Core calls this after a successful write-to-flash. */
export function emitParamsFlashed(info: { paramCount: number }): void {
  for (const listener of paramsFlashedListeners) {
    try {
      listener(info);
    } catch (err) {
      console.error('[module-host] paramsFlashed listener threw', err);
    }
  }
}

function currentHudProjection(): HudProjection | null {
  if (!useHudOverlayStore.getState().active) return null;
  return buildHudProjection(useHudStore.getState().config);
}

// Which generator ids each module registered, so a module can only remove its
// own and a future module-unload path can sweep them all.
const surveyGeneratorsBySlug = new Map<string, Set<string>>();

/** Remove every map layer a module registered (module unload/reload). */
export function unregisterModuleMapLayersForSlug(slug: string): void {
  unregisterModuleMapLayersFor(slug);
}

/** Remove every survey generator a module registered (module unload/reload). */
export function unregisterModuleSurveyGenerators(slug: string): void {
  const ids = surveyGeneratorsBySlug.get(slug);
  if (!ids) return;
  for (const id of ids) unregisterSurveyGenerator(id);
  surveyGeneratorsBySlug.delete(slug);
}

export function createRendererHostApi(
  slug: string,
  register: RegisterFn,
  permissions: readonly string[] = [],
): RendererHostApi {
  const requireVault = () => {
    if (!permissions.includes('vault')) {
      throw new Error(`[module:${slug}] vault access requires the 'vault' manifest permission`);
    }
  };

  // A Zustand store's getState() carries its action functions, which are not
  // structured-cloneable. Handing a raw store snapshot to a module that then
  // sends it over its own IPC (the Claude Advisor "ask" call) throws "An object
  // could not be cloned". Return data-only snapshots (drop the function props).
  const dataOnly = (state: object): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(state)) if (typeof v !== 'function') out[k] = v;
    return out;
  };

  return {
    moduleSlug: slug,

    telemetry: {
      getSnapshot: () => dataOnly(useTelemetryStore.getState()),
      subscribe: (listener) => useTelemetryStore.subscribe(listener as (s: unknown) => void),
    },

    connection: {
      getState: () => dataOnly(useConnectionStore.getState()),
      subscribe: (listener) => useConnectionStore.subscribe(listener as (s: unknown) => void),
    },

    view: {
      getCurrent: () => useNavigationStore.getState().currentView as string,
      subscribe: (listener) =>
        useNavigationStore.subscribe((s) => listener(s.currentView as string)),
    },

    params: {
      getAll: async () => {
        const state = useParameterStore.getState() as unknown as {
          parameters?: Map<string, unknown> | Record<string, unknown>;
        };
        const p = state.parameters;
        if (!p) return [];
        if (p instanceof Map) return Array.from(p.values());
        return Object.values(p);
      },
      get: async (name) => {
        const state = useParameterStore.getState() as unknown as {
          parameters?: Map<string, unknown> | Record<string, unknown>;
        };
        const p = state.parameters;
        if (!p) return undefined;
        if (p instanceof Map) return p.get(name);
        return (p as Record<string, unknown>)[name];
      },
      set: async (name, value) => {
        // Type 9 = MAV_PARAM_TYPE_REAL32 (float). Module callers must know this.
        await window.electronAPI.setParameter(name, value, 9);
      },
    },

    logs: {
      getCurrent: () => {
        const log = useLogStore.getState().currentLog;
        if (!log) return null;
        const path = useLogStore.getState().currentLogPath;
        return {
          name: path ? (path.split(/[\\/]/).pop() ?? 'log') : 'log',
          path,
          messageTypes: listMessageTypes(log).length,
        };
      },
      tools: () => CLAUDE_LOG_TOOLS as unknown as unknown[],
      callTool: (name, input) => {
        const log = useLogStore.getState().currentLog;
        if (!log) return { error: 'No flight log is open in the Log Explorer.' };
        return executeLogTool(name, input, log);
      },
    },

    pty: {
      create: (opts) => window.electronAPI.moduleHostPtyCreate(slug, opts),
      write: (id, data) => window.electronAPI.moduleHostPtyWrite(id, data),
      resize: (id, cols, rows) => window.electronAPI.moduleHostPtyResize(id, cols, rows),
      kill: (id) => window.electronAPI.moduleHostPtyKill(id),
      onData: (id, cb) => window.electronAPI.moduleHostOnPtyData(id, cb),
      onExit: (id, cb) => window.electronAPI.moduleHostOnPtyExit(id, cb),
    },

    invoke: (channel, data) => window.electronAPI.moduleHostInvoke(slug, channel, data),

    on: (channel, cb) => window.electronAPI.moduleHostOnEvent(slug, channel, cb),

    hud: {
      getProjection: () => currentHudProjection(),
      subscribe: (listener) => {
        const notify = () => listener(currentHudProjection());
        const unActive = useHudOverlayStore.subscribe(notify);
        // Scale / colour / line-weight / instrument toggles live in the config store.
        const unConfig = useHudStore.subscribe(notify);
        return () => {
          unActive();
          unConfig();
        };
      },
      registerInstrument: (reg) => registerModuleHudInstrument(slug, reg),
      unregisterInstrument: (id) => unregisterModuleHudInstrument(slug, id),
      isInstrumentEnabled: (id) => useHudStore.getState().isModuleInstrumentEnabled(id),
    },

    osd: {
      registerElement: (reg) => registerModuleOsdElement(slug, reg),
      unregisterElement: (id) => unregisterModuleOsdElement(slug, id),
    },

    panels: {
      register: (reg) => registerModulePanel(slug, reg),
      unregister: (id) => unregisterModulePanel(slug, id),
    },

    mission: {
      getWaypoints: () => useMissionStore.getState().missionItems as unknown[],
      subscribe: (listener) =>
        useMissionStore.subscribe((s) => listener(s.missionItems as unknown[])),
    },

    commandTarget: {
      get: () => useCommandTargetStore.getState().targets[commandTargetKey()] ?? null,
      subscribe: (listener) =>
        useCommandTargetStore.subscribe((s) =>
          listener(s.targets[commandTargetKey()] ?? null),
        ),
    },

    map: {
      registerLayer: (reg) => registerModuleMapLayer(slug, reg),
      unregisterLayer: (id) => unregisterModuleMapLayer(slug, id),
    },

    survey: {
      registerGenerator: (reg) => {
        if (!reg?.id || reg.id.startsWith('builtin.')) {
          throw new Error(`[module:${slug}] invalid survey generator id: ${reg?.id}`);
        }
        // The SDK keeps config/result opaque so it doesn't depend on renderer
        // types; the registry owns the real SurveyConfig/SurveyResult shapes.
        registerSurveyGenerator(reg as unknown as SurveyGeneratorRegistration);
        let ids = surveyGeneratorsBySlug.get(slug);
        if (!ids) {
          ids = new Set();
          surveyGeneratorsBySlug.set(slug, ids);
        }
        ids.add(reg.id);
      },
      unregisterGenerator: (id) => {
        if (!surveyGeneratorsBySlug.get(slug)?.has(id)) return;
        unregisterSurveyGenerator(id);
        surveyGeneratorsBySlug.get(slug)?.delete(id);
      },
    },

    vault: {
      status: async () => {
        requireVault();
        const s = await window.electronAPI.fleetRepoStatus();
        return {
          initialized: s.initialized,
          commitCount: s.commitCount,
          autoSync: s.autoSync,
          backupConfigured: s.github.connected && Boolean(s.github.repo),
          lastSyncAt: s.github.lastSyncAt,
        };
      },
      listUnits: async () => {
        requireVault();
        return window.electronAPI.fleetRepoListUnits();
      },
      history: async (limit?: number) => {
        requireVault();
        return window.electronAPI.fleetRepoHistory(limit);
      },
      readFile: async (path: string, oid?: string) => {
        requireVault();
        return window.electronAPI.fleetRepoReadFile(path, oid);
      },
      snapshotParams: async (note?: string) => {
        requireVault();
        // Store action, not raw IPC: it applies identity rules (override,
        // SITL quarantine) and refreshes vault state for every consumer.
        const ok = await useFleetRepoStore.getState().snapshotParams(note);
        return ok
          ? { success: true }
          : { success: false, error: useFleetRepoStore.getState().lastError ?? 'Snapshot failed' };
      },
      snapshotAsNewVehicle: async (name?: string, note?: string) => {
        requireVault();
        const ok = await useFleetRepoStore.getState().snapshotAsNewVehicle(name, note);
        return ok
          ? { success: true }
          : { success: false, error: useFleetRepoStore.getState().lastError ?? 'Snapshot failed' };
      },
      sync: async () => {
        requireVault();
        return window.electronAPI.fleetRepoGhSync();
      },
    },

    vehicleIdentity: {
      get: () => getCurrentVaultUnit(),
      subscribe: (listener) => subscribeCurrentVaultUnit(listener),
    },

    events: {
      onParamsFlashed: (listener) => {
        paramsFlashedListeners.add(listener);
        return () => paramsFlashedListeners.delete(listener);
      },
    },

    log: (level, ...args) => {
      const tag = `[module:${slug}]`;
      if (level === 'error') console.error(tag, ...args);
      else if (level === 'warn') console.warn(tag, ...args);
      else console.log(tag, ...args);
    },

    registerMountPoint: (name, component) => register(slug, name, component),
  };
}
