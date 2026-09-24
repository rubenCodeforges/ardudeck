// apps/desktop/src/main/testing/tools.ts
import { BrowserWindow, ipcMain } from 'electron';
import { randomUUID } from 'crypto';
import { writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { TESTING_CHANNELS } from '../../shared/testing-channels';

/**
 * Lazy: importing ipc-handlers at module load pulls in electron-store, which
 * needs a live Electron app and breaks anything that imports this file outside
 * one (the MCP server's own tests, for instance).
 */
function paramsApi() {
  return import('../ipc-handlers.js');
}

const SCREENSHOT_DIR = join(homedir(), '.ardudeck', 'screenshots');
mkdirSync(SCREENSHOT_DIR, { recursive: true });

let mainWindow: BrowserWindow | null = null;

export function setMainWindow(win: BrowserWindow): void {
  mainWindow = win;
}

async function callRenderer(channel: string, params: any = {}, timeoutMs = 30000): Promise<any> {
  if (!mainWindow || mainWindow.isDestroyed()) {
    throw new Error('Main window not available');
  }

  const requestId = randomUUID();
  const responseChannel = `${channel}:response`;

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      ipcMain.removeListener(responseChannel, handler);
      reject(new Error(`Renderer timeout (${timeoutMs}ms) for ${channel}`));
    }, timeoutMs);

    const handler = (_event: any, id: string, result: any) => {
      if (id !== requestId) return;
      clearTimeout(timeout);
      ipcMain.removeListener(responseChannel, handler);
      if (result.success) {
        resolve(result.data);
      } else {
        const err = new Error(result.error);
        (err as any).selector = result.selector;
        (err as any).timeout = result.timeout;
        reject(err);
      }
    };

    ipcMain.on(responseChannel, handler);
    mainWindow!.webContents.send(channel, requestId, params);
  });
}

// --- Tool implementations ---

export async function screenshot(params?: { region?: { x: number; y: number; width: number; height: number } }): Promise<string> {
  if (!mainWindow || mainWindow.isDestroyed()) throw new Error('Main window not available');

  const rect = params?.region
    ? { x: params.region.x, y: params.region.y, width: params.region.width, height: params.region.height }
    : undefined;

  let image = await mainWindow.webContents.capturePage(rect);

  // Resize to max 1024px wide (Retina displays produce 2-4x pixels)
  const size = image.getSize();
  if (size.width > 1024) {
    const scale = 1024 / size.width;
    image = image.resize({
      width: Math.round(size.width * scale),
      height: Math.round(size.height * scale),
    });
  }

  // Save to file, return path — no base64 over the wire
  const filePath = join(SCREENSHOT_DIR, `screenshot-${Date.now()}.jpg`);
  writeFileSync(filePath, image.toJPEG(80));
  return filePath;
}

export async function findElementsTool(params: { query: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.FIND_ELEMENTS, params);
}

export async function getPageStateTool(): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_PAGE_STATE);
}

export async function getStoreStateTool(params: { storeName: string; path?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_STORE_STATE, params);
}

export async function getElementTextTool(params: { selector: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_ELEMENT_TEXT, params);
}

export async function listTestIdsTool(params?: { scope?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.LIST_TEST_IDS, params || {});
}

export async function getAppInfoTool(): Promise<any> {
  const rendererInfo = await callRenderer(TESTING_CHANNELS.GET_APP_INFO);
  return {
    ...rendererInfo,
    platform: process.platform,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
    devMode: true,
  };
}

export async function getViewsTool(): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_VIEWS);
}

export async function clickTool(params: { selector: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.CLICK, params);
}

export async function typeTool(params: { selector: string; text: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.TYPE, params);
}

export async function selectTool(params: { selector: string; value: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.SELECT, params);
}

export async function scrollTool(params: { selector?: string; direction: string; amount?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.SCROLL, params);
}

export async function keyboardTool(params: { key: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.KEYBOARD, params);
}

export async function hoverTool(params: { selector: string; by?: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.HOVER, params);
}

export async function navigateTool(params: { view: string }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.NAVIGATE, params);
}

export async function waitForElementTool(params: { selector: string; by?: string; options?: any }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_ELEMENT, params);
}

export async function waitForStoreTool(params: { storeName: string; path: string; value: any; timeout?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_STORE, params);
}

// --- Assistant-facing semantic helpers ------------------------------------
// Thin wrappers over store reads that give the assistant a compact, stable
// shape so it doesn't burn tokens navigating raw Zustand state.

async function readStore(name: string, path?: string): Promise<any> {
  return callRenderer(TESTING_CHANNELS.GET_STORE_STATE, { storeName: name, path });
}

export async function getVehicleSnapshotTool(): Promise<any> {
  const [connection, telemetry, nav] = await Promise.all([
    readStore('connection').catch(() => null),
    readStore('telemetry').catch(() => null),
    readStore('navigation').catch(() => null),
  ]);
  const cs = connection?.connectionState ?? {};
  const attitude = telemetry?.attitude ?? null;
  const position = telemetry?.position ?? null;
  const battery = telemetry?.battery ?? null;
  const flight = telemetry?.flight ?? null;
  return {
    connection: {
      connected: !!cs.isConnected,
      vehicleType: cs.vehicleType ?? null,
      systemId: cs.systemId ?? null,
      packetsReceived: cs.packetsReceived ?? 0,
    },
    telemetry: {
      attitude: attitude && {
        roll: attitude.roll, pitch: attitude.pitch, yaw: attitude.yaw,
      },
      position: position && {
        lat: position.lat, lon: position.lon, alt: position.alt, relativeAlt: position.relativeAlt,
      },
      battery: battery && {
        voltage: battery.voltage, current: battery.current, remaining: battery.remaining,
      },
      flight: flight && {
        mode: flight.mode, armed: flight.armed, isFlying: flight.isFlying,
      },
    },
    currentView: nav?.currentView ?? null,
  };
}

/**
 * Parameters straight from the main process, which holds the authoritative copy
 * regardless of which view is mounted. Reading them used to go through the
 * renderer's Zustand store, so it depended on the Parameters screen having been
 * opened; a fresh download is started here if main has nothing yet.
 */
async function ensureParametersLoaded(timeoutMs = 60000): Promise<{ count: number }> {
  const api = await paramsApi();
  const snapshot = api.getVehicleParameters();
  if (snapshot.complete) return { count: snapshot.params.length };

  if (!api.isParameterDownloadActive()) {
    const res = await api.requestVehicleParameters();
    if (!res.success) throw new Error(res.error ?? 'Could not start a parameter download');
  }

  const start = Date.now();
  for (;;) {
    const s = api.getVehicleParameters();
    if (s.complete) return { count: s.params.length };
    if (Date.now() - start > timeoutMs) {
      throw new Error(
        `Timeout after ${timeoutMs}ms: have ${s.params.length} of ${s.expected || 'unknown'} parameters`,
      );
    }
    await new Promise((r) => setTimeout(r, 200));
  }
}

export async function getParameterTool(params: { name: string }): Promise<any> {
  await ensureParametersLoaded();
  const entry = (await paramsApi()).getVehicleParameters().params.find((p) => p.id === params.name);
  if (!entry) return { found: false };
  return { found: true, parameter: entry };
}

export async function listParametersTool(params: {
  prefix?: string;
  search?: string;
  limit?: number;
}): Promise<any> {
  await ensureParametersLoaded();
  const all: any[] = (await paramsApi()).getVehicleParameters().params;
  const pref = params.prefix?.toUpperCase();
  const needle = params.search?.toLowerCase();
  const filtered = all.filter((entry: any) => {
    const name = String(entry?.id ?? entry?.name ?? entry?.paramId ?? '').toUpperCase();
    if (pref && !name.startsWith(pref)) return false;
    if (needle && !name.toLowerCase().includes(needle)) return false;
    return true;
  });
  const limit = params.limit ?? 50;
  return {
    total: filtered.length,
    items: filtered.slice(0, limit),
    truncated: filtered.length > limit,
  };
}

export async function getRecentMessagesTool(params: { limit?: number }): Promise<any> {
  const state = await readStore('messages').catch(() => ({ messages: [] }));
  const msgs: any[] = state?.messages ?? [];
  const limit = params.limit ?? 20;
  return {
    total: msgs.length,
    items: msgs.slice(-limit),
  };
}

export async function proposeParametersTool(params: {
  proposals: Array<{ name: string; value: number; reason?: string }>;
  timeout?: number;
}): Promise<any> {
  // Outlive the renderer's own review deadline: this call blocks on a human.
  const reviewMs = params.timeout ?? 5 * 60 * 1000;
  return callRenderer(TESTING_CHANNELS.PROPOSE_PARAMETERS, params, reviewMs + 10_000);
}

// --- Control flow -----------------------------------------------------------

export async function waitForIdleTool(params?: { timeout?: number }): Promise<any> {
  return callRenderer(TESTING_CHANNELS.WAIT_FOR_IDLE, params || {});
}
