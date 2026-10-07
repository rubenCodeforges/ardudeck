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
import { raiseModuleAlert, clearModuleAlert, clearModuleAlertsFor } from './module-alert-registry';
import { proposeFence, cancelProposalsFor } from './module-proposal-registry';
import { summariseFence, replaceInclusion } from './module-fence-write';
import {
  openModuleMissionPanel,
  registerModuleMissionPanel,
  unregisterModuleMissionPanel,
  unregisterModuleMissionPanelsFor,
} from './module-mission-panel-registry';
import { useFenceStore } from '../stores/fence-store';
import { useModuleStore } from '../stores/module-store';
import { getElevation, getElevations } from '../utils/elevation-api';
import {
  registerModuleMapLayer,
  startPolygonPick,
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
import { t, i18n } from '../../shared/i18n/index.js';
import {
  boardPortRegistry, configCardRegistry, nodeProfileRegistry, detectHardware, firmwareSourceRegistry, hardwareCatalogRegistry,
  viewBodyRegistry,
} from './module-extension-registries';
import { viewOwnerSlug, CARGO_VIEWS } from './capabilities';
import { vaultWorkspaceState, subscribeVaultWorkspace } from './vault-workspace';
import * as productionHost from './production-host';
import { sampleCanBusHealth } from '../lib/can-bus-health';
import { useDroneCanStore } from '../stores/dronecan-store';
import { useFirmwareStore } from '../stores/firmware-store';
import { droneCanPorts } from '../lib/dronecan-ports';
import { proposeParameterChanges } from '../lib/param-proposal';
import { requestDroneCanWrite } from '../lib/dronecan-review';
import { registerModuleTemplate, unregisterModuleTemplate, unregisterModuleTemplates as unregisterModuleTemplatesForSlug } from '../lib/vehicle-templates/registry';
import type { VehicleTemplate } from '../lib/vehicle-templates/types';
import type { DroneCanNode } from '../../shared/dronecan-types';
import type { DroneCanNodeInfo, DetectedHardware } from '@ardudeck/module-sdk';
import { Package } from 'lucide-react';

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

/** Remove every mission panel a module registered (module unload/reload). */
export function unregisterModuleMissionPanelsForSlug(slug: string): void {
  unregisterModuleMissionPanelsFor(slug);
}

/** Withdraw anything a module has waiting on the pilot (module unload/reload). */
export function cancelModuleProposalsForSlug(slug: string): void {
  cancelProposalsFor(slug);
}

/** Withdraw every alert a module raised (module unload/reload). */
export function clearModuleAlertsForSlug(slug: string): void {
  clearModuleAlertsFor(slug);
}

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


function toNodeInfo(n: DroneCanNode): DroneCanNodeInfo {
  return {
    nodeId: n.nodeId, health: n.health, mode: n.mode, uptimeSec: n.uptimeSec, online: n.online,
    name: n.name, softwareVersion: n.softwareVersion, hardwareVersion: n.hardwareVersion, uniqueId: n.uniqueId,
  };
}

function currentNodes(): DroneCanNode[] {
  return useDroneCanStore.getState().state?.nodes ?? [];
}

function currentDetectedHardware(): DetectedHardware[] {
  const cs = useConnectionStore.getState().connectionState;
  const board = cs.isConnected ? { name: cs.boardId, boardVersion: cs.boardVersion } : null;
  return detectHardware(hardwareCatalogRegistry.list(), board, currentNodes());
}

/** Remove every config card, catalog, firmware source and template a module registered (unload/reload). */
const cargoNamespace = (slug: string) => `cargo.${slug}`;

export function unregisterModuleExtensionsForSlug(slug: string): void {
  for (const lang of Object.keys(i18n.store.data)) i18n.removeResourceBundle(lang, cargoNamespace(slug));
  configCardRegistry.unregisterAll(slug);
  hardwareCatalogRegistry.unregisterAll(slug);
  firmwareSourceRegistry.unregisterAll(slug);
  boardPortRegistry.unregisterAll(slug);
  nodeProfileRegistry.unregisterAll(slug);
  viewBodyRegistry.unregisterAll(slug);
  unregisterModuleTemplatesForSlug(slug);
}

export function createRendererHostApi(
  slug: string,
  register: RegisterFn,
  permissions: readonly string[] = [],
): RendererHostApi {
  const requireDronecan = () => {
    if (!permissions.includes('dronecan')) {
      throw new Error(`[module:${slug}] DroneCAN writes require the 'dronecan' manifest permission`);
    }
  };
  const moduleName = () => useModuleStore.getState().modules.find((m) => m.slug === slug)?.name || slug;
  const dronecanCall = async <T>(p: Promise<{ success: true; data: T } | { success: false; error: string }>): Promise<T> => {
    const res = await p;
    if (!res.success) throw new Error(res.error);
    return res.data;
  };

  const requireProduction = () => {
    if (!permissions.includes('production')) {
      throw new Error(`[module:${slug}] production access requires the 'production' manifest permission`);
    }
  };

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
        const outcome = await proposeParameterChanges([{ name, value, reason: moduleName() }]);
        if (!outcome.ok) throw new Error(outcome.reason ?? outcome.rejected[0]?.reason ?? 'not written'); // i18n-exempt
      },
      propose: async (changes, reason) => {
        const from = moduleName();
        const outcome = await proposeParameterChanges(
          changes.map((c) => ({ name: c.name, value: c.value, reason: `${from}: ${c.reason ?? reason}` })),
        );
        return {
          accepted: outcome.ok,
          applied: outcome.applied,
          failed: outcome.failedParams,
          rebootRequired: outcome.rebootRequired,
          rejected: outcome.rejected,
          ...(outcome.reason ? { error: outcome.reason } : {}),
        };
      },
    },

    i18n: {
      addResources: (resources) => {
        for (const [lang, res] of Object.entries(resources ?? {})) i18n.addResourceBundle(lang, cargoNamespace(slug), res, true, true);
      },
      t: (key, vars) => i18n.t(`${cargoNamespace(slug)}:${key}`, vars ?? {}) as string,
      language: () => i18n.language,
    },

    config: {
      registerCard: (reg) => {
        if (!reg?.id || !reg.component) throw new Error(`[module:${slug}] config card needs an id and a component`);
        configCardRegistry.register(slug, reg.id, reg);
      },
      unregisterCard: (id) => configCardRegistry.unregister(slug, id),
    },

    hardware: {
      registerProducts: (products) => hardwareCatalogRegistry.register(slug, 'catalog', Array.isArray(products) ? products : []),
      unregisterProducts: () => hardwareCatalogRegistry.unregister(slug, 'catalog'),
      getDetected: () => currentDetectedHardware(),
      registerBoardPorts: (boardId, ports) => boardPortRegistry.register(slug, `board:${boardId}`, { boardId, ports: Array.isArray(ports) ? ports : [] }),
      subscribe: (listener) => {
        const notify = () => listener(currentDetectedHardware());
        const offs = [
          hardwareCatalogRegistry.subscribe(notify),
          useConnectionStore.subscribe(notify),
          useDroneCanStore.subscribe(notify),
        ];
        const offInit = useDroneCanStore.getState().init();
        return () => { offs.forEach((off) => off()); offInit(); };
      },
    },

    dronecan: {
      acquire: () => {
        const offInit = useDroneCanStore.getState().init();
        const port = droneCanPorts(useParameterStore.getState().parameters)[0];
        if (!port) {
          console.warn(`[module:${slug}] dronecan.acquire: no CAN port uses DroneCAN`);
          return offInit;
        }
        const release = useDroneCanStore.getState().acquire(port.port);
        return () => { release(); offInit(); };
      },
      getNodes: () => currentNodes().map(toNodeInfo),
      subscribe: (listener) => {
        const offInit = useDroneCanStore.getState().init();
        const off = useDroneCanStore.subscribe((s, prev) => {
          if (s.state?.nodes !== prev.state?.nodes) listener((s.state?.nodes ?? []).map(toNodeInfo));
        });
        return () => { off(); offInit(); };
      },
      listParams: async (nodeId) => {
        // Share the DroneCAN tab's copy so a module panel and the parameter table read the node once.
        const cached = useDroneCanStore.getState().paramsByNode[nodeId];
        if (cached && !cached.loading && !cached.error && cached.params.length > 0) return cached.params;
        return useDroneCanStore.getState().loadParams(nodeId);
      },
      getBusStats: async () => {
        const port = droneCanPorts(useParameterStore.getState().parameters)[0];
        if (!port) return null;
        const h = await sampleCanBusHealth(port.port - 1);
        return h ? { bitrate: h.bitrate, diagnosis: h.diagnosis, deltas: h.deltas, intervalMs: h.intervalMs } : null;
      },
      proposeParams: async (nodeId, changes, options) => {
        requireDronecan();
        const result = await requestDroneCanWrite({
          from: moduleName(),
          nodeId,
          nodeName: currentNodes().find((n) => n.nodeId === nodeId)?.name,
          reason: options?.reason,
          saveByDefault: options?.saveByDefault,
          changes: changes.map((c) => ({ name: c.name, value: c.value })),
        });
        useDroneCanStore.getState().applyWritten(nodeId, result.written);
        return result;
      },
      restartNode: async (nodeId) => {
        requireDronecan();
        return dronecanCall(window.electronAPI.dronecanRestartNode(nodeId));
      },
      registerNodeProfile: (profile) => {
        if (!profile?.id || !profile.match) throw new Error(`[module:${slug}] node profile needs an id and a match`);
        nodeProfileRegistry.register(slug, profile.id, profile);
      },
      unregisterNodeProfile: (id) => nodeProfileRegistry.unregister(slug, id),
    },

    firmware: {
      registerSource: (reg) => {
        if (!reg?.id || !reg.name || !reg.component) throw new Error(`[module:${slug}] firmware source needs id, name and component`);
        firmwareSourceRegistry.register(slug, reg.id, reg);
      },
      unregisterSource: (id) => firmwareSourceRegistry.unregister(slug, id),
      useFile: (path) => useFirmwareStore.getState().setCustomFirmwarePath(path),
      getDetectedBoard: () => {
        const b = useFirmwareStore.getState().detectedBoard;
        const version = useConnectionStore.getState().connectionState.boardVersion;
        if (!b) return null;
        return { name: b.name, target: b.boardId, mcu: b.mcuType, ...(version ? { apjBoardId: version >>> 16 } : {}) };
      },
    },

    vehicleTemplates: {
      register: (reg) => {
        if (!reg?.slug || typeof reg.params !== 'function') throw new Error(`[module:${slug}] vehicle template needs a slug and params()`);
        const template: VehicleTemplate = {
          slug: reg.slug,
          name: reg.name,
          description: reg.description,
          icon: Package,
          vehicleType: reg.vehicleType,
          category: reg.category,
          defaults: (reg.defaults ?? {}) as VehicleTemplate['defaults'],
          toParams: (p) => reg.params(p),
          toSimParams: (p) => reg.simParams?.(p) ?? [],
          inferFrom: () => 0,
        };
        registerModuleTemplate(slug, template);
      },
      unregister: (templateSlug) => unregisterModuleTemplate(slug, templateSlug),
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
        if (!log) return { error: 'No flight log is open in the Log Explorer.' }; // i18n-exempt
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

    views: {
      register: (reg) => {
        if (!reg?.viewId || !reg.component) throw new Error(`[module:${slug}] view needs a viewId and a component`);
        const cargoViewPermission = CARGO_VIEWS[reg.viewId as keyof typeof CARGO_VIEWS];
        const cargoOwned = cargoViewPermission !== undefined && permissions.includes(cargoViewPermission);
        if (!cargoOwned && viewOwnerSlug(reg.viewId) !== slug) throw new Error(`[module:${slug}] view '${reg.viewId}' is not unlocked by this cargo`);
        const holder = viewBodyRegistry.list().find((e) => e.id === reg.viewId && e.slug !== slug);
        if (holder) throw new Error(`[module:${slug}] view '${reg.viewId}' is already provided by ${holder.slug}`);
        viewBodyRegistry.register(slug, reg.viewId, reg.component);
      },
      unregister: (viewId) => viewBodyRegistry.unregister(slug, viewId),
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

    missionWorkspace: {
      registerPanel: (reg) => registerModuleMissionPanel(slug, reg),
      unregisterPanel: (id) => unregisterModuleMissionPanel(slug, id),
      openPanel: (id) => openModuleMissionPanel(slug, id),
    },

    vehicle: {
      proposeFence: async (proposal) => {
        const name = useModuleStore.getState().modules.find((m) => m.slug === slug)?.name;
        const answer = await proposeFence(
          slug,
          name || slug,
          proposal,
          summariseFence(useFenceStore.getState()),
        );
        if (!answer.accepted) return answer;
        // The HOST writes. The module never held this path.
        const fence = useFenceStore.getState();
        replaceInclusion(fence, fence, proposal.inclusion);
        const ok = await useFenceStore.getState().uploadFence();
        return ok
          ? { accepted: true, pointsAccepted: proposal.inclusion.length }
          : {
              accepted: true,
              error: useFenceStore.getState().error ?? t('modules:moduleHost.fenceNotConfirmed'),
            };
      },
    },

    terrain: {
      elevationAt: (lat, lng) => getElevation(lat, lng),
      elevationsAt: (points) => getElevations(points.map((p) => ({ lat: p.lat, lon: p.lng }))),
    },

    alerts: {
      raise: (alert) => raiseModuleAlert(slug, alert),
      clear: (id) => clearModuleAlert(slug, id),
    },

    map: {
      registerLayer: (reg) => registerModuleMapLayer(slug, reg),
      unregisterLayer: (id) => unregisterModuleMapLayer(slug, id),
      pickPolygon: (prompt) => startPolygonPick(prompt ?? t('modules:moduleHost.pickPolygonPrompt')),
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
          : { success: false, error: useFleetRepoStore.getState().lastError ?? t('modules:moduleHost.snapshotFailed') };
      },
      snapshotAsNewVehicle: async (name?: string, note?: string) => {
        requireVault();
        const ok = await useFleetRepoStore.getState().snapshotAsNewVehicle(name, note);
        return ok
          ? { success: true }
          : { success: false, error: useFleetRepoStore.getState().lastError ?? t('modules:moduleHost.snapshotFailed') };
      },
      sync: async () => {
        requireVault();
        // Store action: busy flag, notice and refresh reach every vault surface
        await useFleetRepoStore.getState().sync();
        const error = useFleetRepoStore.getState().lastError;
        return error ? { success: false, error } : { success: true };
      },
      getState: () => {
        requireVault();
        return vaultWorkspaceState();
      },
      subscribe: (listener) => {
        requireVault();
        return subscribeVaultWorkspace(listener);
      },
      refresh: async () => {
        requireVault();
        await useFleetRepoStore.getState().refresh();
      },
      snapshotMission: async (site, missionName) => {
        requireVault();
        return useFleetRepoStore.getState().snapshotMission(site, missionName);
      },
      snapshotArea: async (site) => {
        requireVault();
        return useFleetRepoStore.getState().snapshotArea(site);
      },
      renameUnit: async (uid, name) => {
        requireVault();
        return useFleetRepoStore.getState().renameUnit(uid, name);
      },
      deleteUnit: async (uid) => {
        requireVault();
        return useFleetRepoStore.getState().deleteUnit(uid);
      },
      linkUnit: async (unitUid, aliasUid) => {
        requireVault();
        return useFleetRepoStore.getState().linkUnit(unitUid, aliasUid);
      },
      setUnitOverride: (uid) => {
        requireVault();
        useFleetRepoStore.getState().setUnitOverride(uid);
      },
      openSnapshot: async (oid, uid) => {
        requireVault();
        await useFleetRepoStore.getState().loadDiff(oid, uid);
      },
      closeSnapshot: () => {
        requireVault();
        useFleetRepoStore.getState().clearDiff();
      },
      restoreSnapshot: async (includeCalibration) => {
        requireVault();
        return useFleetRepoStore.getState().restoreSnapshot(includeCalibration);
      },
      setAutoSync: async (on) => {
        requireVault();
        await window.electronAPI.fleetRepoSetAutoSync(on);
        await useFleetRepoStore.getState().refresh();
      },
      clearMessages: () => {
        requireVault();
        useFleetRepoStore.getState().clearMessages();
      },
      openFolder: () => {
        requireVault();
        void window.electronAPI.fleetRepoOpenDir();
      },
      openBackupSetup: () => {
        requireVault();
        useFleetRepoStore.getState().setBackupSetupOpen(true);
      },
    },

    production: (() => {
      const api = () => {
        requireProduction();
        return window.electronAPI;
      };
      return {
        startBays: () => { requireProduction(); return productionHost.startBays(); },
        stopBays: () => api().productionBaysStop(),
        isStationRunning: async () => (await api().productionBaysList()).running,
        getBays: () => { requireProduction(); return productionHost.getBays(); },
        subscribeBays: (listener) => { requireProduction(); return productionHost.subscribeBays(listener); },
        addSimulatorBay: (endpoint) => api().productionBayAddTcp(endpoint),
        removeBay: (bayId, ignore) => api().productionBayRemove(bayId, Boolean(ignore)),
        restoreIgnoredPorts: () => api().productionUnignorePorts(),
        setBayModel: (bayId, modelId) => api().productionBaySetModel(bayId, modelId),
        setModelForAllBays: (modelId) => api().productionBaySetModelAll(modelId),
        getStation: () => api().productionGetStation(),
        setStation: (name) => api().productionSetStation(name),
        listModels: () => api().productionListModels(),
        captureGolden: (source, name) => {
          requireProduction();
          if (source === 'connected') return productionHost.captureFromConnected(name);
          if (source === 'file') return window.electronAPI.productionCaptureFile(name);
          if ('vaultUnit' in source) return window.electronAPI.productionCaptureVault(name, source.vaultUnit);
          return window.electronAPI.productionBayCapture(source.bayId, name);
        },
        updateRules: (modelId, rules) => api().productionUpdateRules(modelId, rules),
        deleteModel: (modelId) => api().productionDeleteModel(modelId),
        attachFirmware: (modelId) => api().productionAttachFirmware(modelId),
        previewGolden: (bayId, modelId) => { requireProduction(); return productionHost.previewGolden(bayId, modelId); },
        armModel: (modelId, bayId) => { requireProduction(); return productionHost.armModel(modelId, bayId); },
        prepare: (bayId, modelId) => { requireProduction(); return productionHost.prepare(bayId, modelId); },
        flash: (bayId, modelId) => api().productionBayFlash(bayId, modelId),
        resetToDefaults: (bayId) => api().productionBayReset(bayId),
        reboot: (bayId) => api().productionBayReboot(bayId),
        startCalibration: (bayId, type) => api().productionBayCalStart(bayId, type),
        confirmCalibrationPosition: (bayId, position) => api().productionBayCalConfirm(bayId, position),
        cancelCalibration: (bayId) => api().productionBayCalCancel(bayId),
        runQa: (bayId, modelId, serial) => api().productionBayQa(bayId, modelId, serial),
        submit: (bayId, modelId, serial, operator, notes) => api().productionBaySubmit(bayId, modelId, serial, operator, notes),
        listRuns: (limit) => api().productionListRuns(limit),
        onRecordsChanged: (listener) => { requireProduction(); return productionHost.onRecordsChanged(listener); },
        openHostView: (view) => {
          requireProduction();
          if (['calibration', 'firmware', 'parameters', 'vault'].includes(view)) {
            useNavigationStore.getState().setView(view);
          }
        },
      };
    })(),

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
