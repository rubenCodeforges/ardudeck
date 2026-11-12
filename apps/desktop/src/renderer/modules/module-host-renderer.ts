import { titleBarRegistry } from './title-bar-registry';
import type { ComponentType } from 'react';
import { coordinateFormatRegistry } from '../utils/coordinate-format';
import { useSettingsStore } from '../stores/settings-store';

/** A cargo sees its own formats by their short id, the built-ins by name, anything else as 'other'. */
const ownFormatId = (slug: string, id: string) => (id === 'decimal' || id === 'dms' ? id : id.startsWith(`${slug}:`) ? id.slice(slug.length + 1) : 'other');
import { useMapFocusStore } from '../stores/map-focus-store';
import type { RendererHostApi, MountPointName, HudProjection } from '@ardudeck/module-sdk';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useConnectionStore } from '../stores/connection-store';
import { useNavigationStore } from '../stores/navigation-store';
import { useParameterStore } from '../stores/parameter-store';
import { useArduPilotSitlStore } from '../stores/ardupilot-sitl-store';
import { useCameraStore } from '../stores/camera-store';
import { useActiveVehicleStore } from '../stores/active-vehicle-store';
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
import { proposeFence, proposeLanding, proposeMission, cancelProposalsFor } from './module-proposal-registry';
import { applyFenceProposal, applyMissionProposal } from './proposal-apply';
import { summariseFence } from './module-fence-write';
import { fenceBudgetFor } from './fence-budget';
import { getVehicleClass } from '../../shared/telemetry-types';
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
  startPick,
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
import { cargoInstrumentId, openModuleInstrumentSettings, registerModuleMapInstrument, unregisterModuleMapInstrument } from './module-map-instruments';
import { registerModuleWorkspacePanel, unregisterModuleWorkspacePanel } from './module-workspace-panels';
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
  boardPortRegistry, configCardRegistry, configTabRegistry, nodeProfileRegistry, detectHardware, firmwareSourceRegistry, hardwareCatalogRegistry, hardwareSetupRegistry,
  viewBodyRegistry,
} from './module-extension-registries';
import { viewOwnerSlug, CARGO_VIEWS } from './capabilities';
import { cargoThemeKey, themeRegistry } from './module-theme-registry';
import { cargoNamespace } from './slug-registry';
import { createSetupApi } from './module-setup-api';
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

const COPTER_LAND_MODE = 9;

/** Why the aircraft cannot be flown somewhere and landed right now, or null. */
function landingRefusal(): string | null {
  const cs = useConnectionStore.getState().connectionState as { isConnected?: boolean; mavType?: number; firmware?: string };
  const flight = useTelemetryStore.getState().flight;
  if (!cs.isConnected) return t('modules:moduleHost.landingNoVehicle');
  if (getVehicleClass(cs.mavType) !== 'copter') return t('modules:moduleHost.landingCopterOnly');
  if (!flight.armed || !flight.isFlying) return t('modules:moduleHost.landingNotFlying');
  return null;
}

function waitForArrival(at: { lat: number; lng: number }, timeoutMs: number): Promise<boolean> {
  const start = Date.now();
  return new Promise((resolve) => {
    const tick = () => {
      const p = useTelemetryStore.getState().position;
      const d = Math.hypot((p.lon - at.lng) * 111320 * Math.cos((at.lat * Math.PI) / 180), (p.lat - at.lat) * 110540);
      if (d < 3) return resolve(true);
      if (Date.now() - start > timeoutMs || !useTelemetryStore.getState().flight.isFlying) return resolve(false);
      setTimeout(tick, 500);
    };
    tick();
  });
}

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

export function unregisterModuleExtensionsForSlug(slug: string): void {
  for (const lang of Object.keys(i18n.store.data)) i18n.removeResourceBundle(lang, cargoNamespace(slug));
  unregisterCargoStreamsForSlug(slug);
  configCardRegistry.unregisterAll(slug);
  coordinateFormatRegistry.unregisterAll(slug);
  configTabRegistry.unregisterAll(slug);
  hardwareCatalogRegistry.unregisterAll(slug);
  hardwareSetupRegistry.unregisterAll(slug);
  firmwareSourceRegistry.unregisterAll(slug);
  boardPortRegistry.unregisterAll(slug);
  nodeProfileRegistry.unregisterAll(slug);
  viewBodyRegistry.unregisterAll(slug);
  themeRegistry.unregisterAll(slug);
  titleBarRegistry.unregisterAll(slug);
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
      label: (viewId) => {
        const id = viewId ?? useNavigationStore.getState().currentView;
        return t(`navigation:short.${id}`, { defaultValue: id });
      },
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
      ensureLoaded: async (timeoutMs = 45_000) => {
        const store = useParameterStore.getState();
        if (store.hasFullParameterSet()) return true;
        if (!useConnectionStore.getState().connectionState?.isConnected) return false;
        if (store.downloadState !== 'loading') await store.fetchParameters();
        const deadline = Date.now() + timeoutMs;
        while (Date.now() < deadline) {
          if (useParameterStore.getState().hasFullParameterSet()) return true;
          await new Promise((r) => setTimeout(r, 100));
        }
        return useParameterStore.getState().hasFullParameterSet();
      },
    },

    setup: createSetupApi(),

    i18n: {
      addResources: (resources) => {
        for (const [lang, res] of Object.entries(resources ?? {})) i18n.addResourceBundle(lang, cargoNamespace(slug), res, true, true);
      },
      t: (key, vars) => i18n.t(`${cargoNamespace(slug)}:${key}`, vars ?? {}) as string,
      language: () => i18n.language,
      subscribe: (listener) => {
        i18n.on('languageChanged', listener);
        return () => i18n.off('languageChanged', listener);
      },
    },

    config: {
      registerCard: (reg) => {
        if (!reg?.id || !reg.component) throw new Error(`[module:${slug}] config card needs an id and a component`);
        configCardRegistry.register(slug, reg.id, reg);
      },
      unregisterCard: (id) => configCardRegistry.unregister(slug, id),
      registerTab: (reg) => {
        if (!reg?.id || !reg.component || typeof reg.title !== 'function') throw new Error(`[module:${slug}] config tab needs an id, a title() and a component`);
        configTabRegistry.register(slug, reg.id, reg);
      },
      unregisterTab: (id) => configTabRegistry.unregister(slug, id),
    },

    hardware: {
      registerProducts: (products) => hardwareCatalogRegistry.register(slug, 'catalog', Array.isArray(products) ? products : []),
      unregisterProducts: () => hardwareCatalogRegistry.unregister(slug, 'catalog'),
      getDetected: () => currentDetectedHardware(),
      registerBoardPorts: (boardId, ports) => boardPortRegistry.register(slug, `board:${boardId}`, { boardId, ports: Array.isArray(ports) ? ports : [] }),
      registerSetups: (entries) => hardwareSetupRegistry.register(slug, 'setups', Array.isArray(entries) ? entries.filter((e) => e && typeof e.open === 'function' && typeof e.name === 'string') : []),
      unregisterSetups: () => hardwareSetupRegistry.unregister(slug, 'setups'),
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

    workspace: {
      registerPanel: (reg) => registerModuleWorkspacePanel(slug, reg),
      unregisterPanel: (id) => unregisterModuleWorkspacePanel(slug, id),
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
      getHome: () => {
        const h = useMissionStore.getState().homePosition;
        return h ? { lat: h.lat, lng: h.lon, altMsl: h.alt !== 0 && Number.isFinite(h.alt) ? h.alt : null } : null;
      },
      subscribe: (listener) => {
        let items = useMissionStore.getState().missionItems;
        let home = useMissionStore.getState().homePosition;
        return useMissionStore.subscribe((s) => {
          if (s.missionItems === items && s.homePosition === home) return;
          items = s.missionItems;
          home = s.homePosition;
          listener(s.missionItems as unknown[]);
        });
      },
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
        return applyFenceProposal(proposal);
      },
      proposeMission: async (proposal) => {
        const name = useModuleStore.getState().modules.find((m) => m.slug === slug)?.name;
        const ms = useMissionStore.getState();
        const answer = await proposeMission(slug, name || slug, proposal, ms.missionItems.length);
        if (!answer.accepted) return answer;
        return applyMissionProposal(name || slug, proposal);
      },
      proposeLanding: async (proposal) => {
        const name = useModuleStore.getState().modules.find((m) => m.slug === slug)?.name;
        const refusal = landingRefusal();
        const answer = await proposeLanding(slug, name || slug, proposal, refusal);
        if (!answer.accepted) return answer;
        if (landingRefusal()) return { accepted: false, error: landingRefusal() ?? undefined };
        const api = window.electronAPI;
        const alt = Math.max(5, proposal.transitAltRelM);
        const sent = await api.mavlinkGoto(proposal.at.lat, proposal.at.lng, alt, 6);
        if (!sent) return { accepted: true, error: t('modules:moduleHost.landingNotSent') };
        const arrived = await waitForArrival(proposal.at, 180_000);
        if (!arrived) return { accepted: true, error: t('modules:moduleHost.landingNoArrival') };
        const landed = await api.mavlinkSetMode(COPTER_LAND_MODE);
        return landed ? { accepted: true, pointsAccepted: 1 } : { accepted: true, error: t('modules:moduleHost.landingNotSent') };
      },
      fenceBudget: async () => {
        const mavType = (useConnectionStore.getState().connectionState as { mavType?: number }).mavType;
        return fenceBudgetFor(getVehicleClass(mavType), useFenceStore.getState());
      },
    },

    files: {
      pickFolder: (title) => window.electronAPI.pickFolder(title),
    },

    sitl: {
      startExternal: (req) => useArduPilotSitlStore.getState().startExternal(req),
      stop: async () => { await useArduPilotSitlStore.getState().stop(); },
      getStatus: () => sitlHostStatus(),
      subscribe: (listener) => useArduPilotSitlStore.subscribe(() => listener(sitlHostStatus())),
    },

    camera: {
      registerStream: (reg) => registerCargoStream(slug, reg),
      unregisterStream: (id) => unregisterCargoStream(slug, id),
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
      registerInstrument: (reg) => registerModuleMapInstrument(slug, cargoNamespace(slug), reg),
      unregisterInstrument: (id) => unregisterModuleMapInstrument(slug, id),
      openInstrumentSettings: (id) => openModuleInstrumentSettings(cargoInstrumentId(slug, id)),
      pickPolygon: (prompt, initial) => startPolygonPick(prompt ?? t('modules:moduleHost.pickPolygonPrompt'), initial),
      pickPath: (prompt, initial) => startPick(prompt ?? t('modules:moduleHost.pickPathPrompt'), 'path', initial),
      pickPoint: (prompt, initial) => startPick(prompt ?? t('modules:moduleHost.pickPointPrompt'), 'point', initial ? [initial] : undefined).then((pts) => pts?.[0] ?? null),
      centerOn: (point, zoom) => useMapFocusStore.getState().centerOn(point.lat, point.lng, zoom),
    },

    titleBar: {
      register: (reg) => {
        if (!reg?.id || !reg.component) throw new Error(`[module:${slug}] title bar item needs an id and a component`);
        titleBarRegistry.register(slug, reg.id, reg);
      },
      unregister: (id) => titleBarRegistry.unregister(slug, id),
    },

    theme: {
      register: (reg) => {
        if (!reg?.id || !reg.className || typeof reg.css !== 'string') throw new Error(`[module:${slug}] theme needs an id, a className and css`);
        if (reg.className === 'light' || reg.className === 'dark') throw new Error(`[module:${slug}] theme className '${reg.className}' is reserved`);
        themeRegistry.register(slug, reg.id, reg);
      },
      unregister: (id) => themeRegistry.unregister(slug, id),
      update: (id, patch) => {
        const current = themeRegistry.list().find((e) => e.slug === slug && e.id === id);
        if (!current) throw new Error(`[module:${slug}] theme '${id}' is not registered`);
        themeRegistry.register(slug, id, { ...current.value, ...patch, id });
      },
      isActive: (id) => useSettingsStore.getState().theme === cargoThemeKey(slug, id),
      activate: (id) => {
        if (!themeRegistry.list().some((e) => e.slug === slug && e.id === id)) throw new Error(`[module:${slug}] theme '${id}' is not registered`);
        useSettingsStore.getState().setTheme(cargoThemeKey(slug, id));
      },
      subscribe: (listener) => useSettingsStore.subscribe((s, prev) => {
        if (s.theme !== prev.theme) listener();
      }),
    },

    coordinates: {
      registerFormat: (reg) => {
        if (!reg?.id || typeof reg.format !== 'function' || typeof reg.parse !== 'function' || typeof reg.name !== 'function') {
          throw new Error(`[module:${slug}] coordinate format needs an id, name(), format() and parse()`);
        }
        coordinateFormatRegistry.register(slug, reg.id, reg);
      },
      unregisterFormat: (id) => coordinateFormatRegistry.unregister(slug, id),
      current: () => ownFormatId(slug, useSettingsStore.getState().coordinateFormat),
      select: (id) => useSettingsStore.getState().setCoordinateFormat(id === 'decimal' || id === 'dms' ? id : `${slug}:${id}`),
      subscribe: (listener) => useSettingsStore.subscribe((s, prev) => {
        if (s.coordinateFormat !== prev.coordinateFormat) listener(ownFormatId(slug, s.coordinateFormat));
      }),
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

function sitlHostStatus() {
  const s = useArduPilotSitlStore.getState();
  return { running: s.isRunning, starting: s.isStarting, external: s.isRunning ? s.externalPhysics : null, vehicleType: s.isRunning ? s.vehicleType : null, error: s.lastError };
}

const cargoStreamId = (slug: string, id: string) => `${slug}:${id}`;
/** Streams registered before a vehicle is selected wait here until one is, then land under it. */
const pendingStreams = new Map<string, { slug: string; reg: Parameters<RendererHostApi['camera']['registerStream']>[0] }>();
let pendingWatch: (() => void) | null = null;

function placeStream(slug: string, reg: Parameters<RendererHostApi['camera']['registerStream']>[0], vehicleKey: string): void {
  useCameraStore.getState().addSource({
    id: cargoStreamId(slug, reg.id),
    vehicleKey,
    kind: 'rtp-udp',
    label: reg.label,
    url: reg.url,
    rtpCodec: reg.rtpCodec,
    hfovDeg: reg.hfovDeg,
    vfovDeg: reg.vfovDeg,
    lowLatency: true,
    preset: `cargo:${slug}`,
  });
}

function flushPendingStreams(): void {
  const key = useActiveVehicleStore.getState().activeVehicleKey;
  if (!key) return;
  for (const [id, p] of pendingStreams) { placeStream(p.slug, p.reg, key); pendingStreams.delete(id); }
  if (pendingStreams.size === 0 && pendingWatch) { pendingWatch(); pendingWatch = null; }
}

function registerCargoStream(slug: string, reg: Parameters<RendererHostApi['camera']['registerStream']>[0]): void {
  const key = useActiveVehicleStore.getState().activeVehicleKey;
  if (key) { placeStream(slug, reg, key); return; }
  pendingStreams.set(cargoStreamId(slug, reg.id), { slug, reg });
  pendingWatch ??= useActiveVehicleStore.subscribe(flushPendingStreams);
}

function unregisterCargoStream(slug: string, id: string): void {
  const full = cargoStreamId(slug, id);
  pendingStreams.delete(full);
  if (useCameraStore.getState().sources[full]) useCameraStore.getState().removeSource(full);
}

/** Every stream a cargo registered, for when it is deactivated. */
export function unregisterCargoStreamsForSlug(slug: string): void {
  for (const id of Object.keys(useCameraStore.getState().sources)) if (id.startsWith(`${slug}:`)) useCameraStore.getState().removeSource(id);
  for (const id of [...pendingStreams.keys()]) if (id.startsWith(`${slug}:`)) pendingStreams.delete(id);
}
