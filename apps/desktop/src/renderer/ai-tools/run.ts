import { z } from 'zod';
import { AI_TOOLS, findAiTool } from '../../shared/ai-tools/definitions';
import { useConnectionStore } from '../stores/connection-store';
import { useTelemetryStore } from '../stores/telemetry-store';
import { useParameterStore } from '../stores/parameter-store';
import { useMessagesStore } from '../stores/messages-store';
import { useNavigationStore, type ViewId } from '../stores/navigation-store';
import { useLogStore } from '../stores/log-store';
import { CLAUDE_LOG_TOOLS, executeLogTool, listMessageTypes } from '../components/logs/log-ai-tools';
import { proposeParameterChanges } from '../lib/param-proposal';
import { createSetupApi } from '../modules/module-setup-api';
import * as planning from '../testing/agent-planning';

type Rec = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- validated against the zod definition before use

async function ensureParameters(timeoutMs = 45_000): Promise<void> {
  const store = useParameterStore.getState();
  if (store.hasFullParameterSet()) return;
  if (!useConnectionStore.getState().connectionState?.isConnected) {
    throw new Error('No vehicle is connected. Connect one in ArduDeck first.'); // i18n-exempt
  }
  if (store.downloadState !== 'loading') await store.fetchParameters();
  const deadline = Date.now() + timeoutMs;
  while (!useParameterStore.getState().hasFullParameterSet()) {
    if (Date.now() > deadline) throw new Error('The vehicle did not finish sending its parameters.'); // i18n-exempt
    await new Promise((r) => setTimeout(r, 100));
  }
}

function parameterList(): Array<{ id: string; value: number }> {
  return [...useParameterStore.getState().parameters.values()].map((p) => ({ id: p.id, value: p.value }));
}

function snapshot() {
  const c = useConnectionStore.getState().connectionState;
  const t = useTelemetryStore.getState() as unknown as Record<string, Rec | undefined>;
  const pick = (o: Rec | undefined, keys: string[]) => (o ? Object.fromEntries(keys.map((k) => [k, o[k] ?? null])) : null);
  return {
    connection: { connected: !!c.isConnected, vehicleType: c.vehicleType ?? null, firmware: c.firmware ?? null, systemId: c.systemId ?? null },
    attitude: pick(t.attitude, ['roll', 'pitch', 'yaw']),
    position: pick(t.position, ['lat', 'lon', 'alt', 'relativeAlt']),
    gps: pick(t.gps, ['fixType', 'satellites', 'hdop']),
    battery: pick(t.battery, ['voltage', 'current', 'remaining']),
    flight: pick(t.flight, ['mode', 'armed', 'isFlying']),
    view: useNavigationStore.getState().currentView,
  };
}

function openLog() {
  const log = useLogStore.getState().currentLog;
  if (!log) throw new Error('No flight log is open in the Log Explorer.'); // i18n-exempt
  return log;
}

const setup = createSetupApi();

const RUN: Record<string, (input: Rec) => unknown | Promise<unknown>> = {
  get_vehicle_snapshot: () => snapshot(),
  get_recent_messages: ({ limit }) => {
    const items = useMessagesStore.getState().messages;
    const n = Math.max(1, Math.min(Number(limit ?? 30), 200));
    return { total: items.length, items: items.slice(-n) };
  },

  get_parameter: async ({ name }) => {
    await ensureParameters();
    const p = useParameterStore.getState().parameters.get(String(name));
    return p ? { found: true, name: p.id, value: p.value } : { found: false };
  },
  list_parameters: async ({ prefix, search, limit }) => {
    await ensureParameters();
    const pre = String(prefix ?? '').toUpperCase();
    const needle = String(search ?? '').toUpperCase();
    const items = parameterList().filter((p) => p.id.startsWith(pre) && p.id.includes(needle));
    const max = Number(limit) > 0 ? Number(limit) : 50;
    return { total: items.length, items: items.slice(0, max), truncated: items.length > max };
  },
  propose_parameters: async ({ reason, changes }) => {
    const list = changes as Array<{ name: string; value: number; reason?: string }>;
    return proposeParameterChanges(list.map((c) => ({ name: c.name, value: c.value, reason: c.reason ?? String(reason ?? '') })), 10 * 60_000);
  },

  get_setup_status: () => setup.getStatus(),
  open_setup_step: ({ stepId }) => setup.openStep(String(stepId)),
  suggest_setup_values: ({ kind, inputs }) => setup.suggest(kind as 'tune' | 'airspeed' | 'battery', inputs as Record<string, number | string> | undefined),
  get_vehicle_profile: () => setup.getProfile(),
  set_vehicle_profile: (input) => planning.agentSetVehicleProfile(input as Parameters<typeof planning.agentSetVehicleProfile>[0]),

  get_flight_log: () => {
    const log = useLogStore.getState().currentLog;
    if (!log) return null;
    const path = useLogStore.getState().currentLogPath;
    return {
      log: { name: path ? (path.split(/[\\/]/).pop() ?? 'log') : 'log', messageTypes: listMessageTypes(log).length },
      queries: CLAUDE_LOG_TOOLS,
    };
  },
  query_flight_log: ({ query, input }) => executeLogTool(String(query), (input ?? {}) as Rec, openLog()),

  get_mission: () => planning.getMission(),
  propose_mission: (input) => planning.agentProposeMission(input as Parameters<typeof planning.agentProposeMission>[0]),
  propose_survey: (input) => planning.agentProposeSurvey(input as Parameters<typeof planning.agentProposeSurvey>[0]),
  survey_area: (input) => planning.agentSurveyArea(input as Parameters<typeof planning.agentSurveyArea>[0]),
  list_survey_options: () => planning.listSurveyOptions(),
  fit_mission: (input) => planning.agentFitMission(input as Parameters<typeof planning.agentFitMission>[0]),
  set_home: (input) => planning.agentSetHome(input as Parameters<typeof planning.agentSetHome>[0]),
  get_flight_estimate: (input) => planning.agentFlightEstimate(input),
  propose_fence: (input) => planning.agentProposeFence(input as Parameters<typeof planning.agentProposeFence>[0]),
  draw_area: (input) => planning.agentDrawArea(input as Parameters<typeof planning.agentDrawArea>[0]),
  list_areas: () => planning.agentListAreas(),
  delete_area: (input) => planning.agentDeleteArea(input as Parameters<typeof planning.agentDeleteArea>[0]),

  open_view: ({ view }) => {
    useNavigationStore.getState().setView(String(view) as ViewId);
    return { view: useNavigationStore.getState().currentView };
  },
};

const missing = AI_TOOLS.filter((t) => !RUN[t.name]).map((t) => t.name);
if (missing.length) console.error('[ai-tools] defined but not implemented:', missing);

/** Validates the input against the tool's definition, then runs it. */
export async function runAiTool(name: string, input: unknown): Promise<unknown> {
  const tool = findAiTool(name);
  const run = RUN[name];
  if (!tool || !run) throw new Error(`Unknown tool: ${name}`); // i18n-exempt
  const parsed = z.object(tool.input).safeParse(input ?? {});
  if (!parsed.success) throw new Error(`Invalid input for ${name}: ${parsed.error.message}`); // i18n-exempt
  return run(parsed.data as Rec);
}
