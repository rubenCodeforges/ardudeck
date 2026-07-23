/**
 * Detachable Windows — main process manager.
 *
 * Holds the registry of every BrowserWindow the app has open (main + detached
 * pop-outs), provides a broadcast() helper so IPC pushes go to every window
 * with a single call, and persists the set of open pop-outs across restarts.
 *
 * The renderer addresses detached windows by `id` (typically
 * `${componentId}` for singletons or `${componentId}:${instance}` for
 * multi-instance components like field graphs).
 */

import { BrowserWindow, ipcMain, screen } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import Store from 'electron-store';
import type {
  DetachedWindowBounds,
  DetachedWindowInfo,
  OpenDetachedRequest,
  WorkspaceStoreSchema,
} from '../shared/window-types.js';
import { IPC_CHANNELS } from '../shared/ipc-channels.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const workspaceStore = new Store<WorkspaceStoreSchema>({
  name: 'workspace',
  defaults: { detachedWindows: [] },
});

interface RegisteredWindow {
  id: string;
  componentId: string;
  instance?: string;
  title: string;
  props?: Record<string, unknown>;
  win: BrowserWindow;
}

let mainWindow: BrowserWindow | null = null;
const detached = new Map<string, RegisteredWindow>();

/**
 * Secondary windows are BrowserWindows we don't manage directly — typically
 * dockview popouts created via the renderer's `window.open()` call. We still
 * want broadcast IPC (telemetry, status, packets) to reach them, so we
 * register them here. We do NOT serialize/restore these — dockview's own
 * popoutGroups serialization handles that.
 */
const secondaryWindows = new Set<BrowserWindow>();

/** Stored "always on top" preferences keyed by detached-window id. */
const alwaysOnTopStore = new Store<{ ids: string[] }>({
  name: 'window-always-on-top',
  defaults: { ids: [] },
});
function loadPinnedIds(): Set<string> {
  return new Set(alwaysOnTopStore.get('ids', []));
}
function savePinnedIds(set: Set<string>): void {
  alwaysOnTopStore.set('ids', [...set]);
}
let pinnedIds = loadPinnedIds();

/**
 * Initialize the window manager with the main window. Must be called from
 * main/index.ts before opening any detached windows.
 */
export function initWindowManager(main: BrowserWindow): void {
  mainWindow = main;
  main.on('closed', () => {
    // Tear down every detached window when the main window closes — they
    // don't make sense on their own (no IPC source).
    for (const reg of detached.values()) {
      if (!reg.win.isDestroyed()) reg.win.close();
    }
    detached.clear();
    mainWindow = null;
  });
}

export function getMainWindow(): BrowserWindow | null {
  return mainWindow;
}

/**
 * Get all live windows (main + detached + dockview popouts). Used by
 * safeSend/broadcast to push IPC events to every window at once.
 */
export function getAllWindows(): BrowserWindow[] {
  const out: BrowserWindow[] = [];
  if (mainWindow && !mainWindow.isDestroyed()) out.push(mainWindow);
  for (const reg of detached.values()) {
    if (!reg.win.isDestroyed() && !reg.win.webContents.isDestroyed()) out.push(reg.win);
  }
  for (const win of secondaryWindows) {
    if (!win.isDestroyed() && !win.webContents.isDestroyed()) out.push(win);
  }
  return out;
}

/**
 * Register a BrowserWindow that we didn't spawn ourselves (e.g. dockview
 * popouts created by the renderer via `window.open`). The window joins the
 * broadcast set so existing telemetry/status/packet IPCs reach it without
 * any per-window subscription rewiring.
 */
export function registerSecondaryWindow(win: BrowserWindow): void {
  if (win.isDestroyed()) return;
  secondaryWindows.add(win);
  win.once('closed', () => {
    secondaryWindows.delete(win);
  });
}

/**
 * Broadcast an IPC event to every live window. Use this for telemetry / status
 * pushes that all windows (including pop-outs) need to receive.
 */
export function broadcast(channel: string, ...args: unknown[]): void {
  for (const win of getAllWindows()) {
    try {
      win.webContents.send(channel, ...args);
    } catch {
      // window may have been destroyed between getAllWindows() and now
    }
  }
}

function buildWindowId(componentId: string, instance?: string): string {
  return instance ? `${componentId}:${instance}` : componentId;
}

function pickDefaultBounds(initial?: DetachedWindowBounds): DetachedWindowBounds {
  if (initial && initial.width > 0 && initial.height > 0) return initial;
  const display = screen.getPrimaryDisplay();
  const w = Math.min(900, display.workArea.width - 100);
  const h = Math.min(640, display.workArea.height - 100);
  return { width: w, height: h };
}

/**
 * Open a detached BrowserWindow that hosts the given renderer component.
 * Returns the assigned window id (componentId or componentId:instance).
 *
 * If a window with the same id already exists it is focused instead of
 * spawning a duplicate — this keeps the UX predictable when the user double-
 * clicks a pop-out button.
 */
export function openDetachedWindow(req: OpenDetachedRequest): string {
  const id = buildWindowId(req.componentId, req.instance);
  const existing = detached.get(id);
  if (existing && !existing.win.isDestroyed()) {
    existing.win.focus();
    return id;
  }

  const bounds = pickDefaultBounds(req.initialBounds);

  // Preload bundle is one level up from out/main/, same as the main window.
  const preloadPath = join(__dirname, '../preload/index.mjs');

  const win = new BrowserWindow({
    width: bounds.width,
    height: bounds.height,
    ...(bounds.x !== undefined ? { x: bounds.x } : {}),
    ...(bounds.y !== undefined ? { y: bounds.y } : {}),
    minWidth: 320,
    minHeight: 240,
    show: false,
    autoHideMenuBar: true,
    title: req.title,
    backgroundColor: '#0f1115',
    webPreferences: {
      preload: preloadPath,
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Encode the component id + instance + props in the query string so the
  // shared renderer entry knows what to render. Props are JSON-encoded; keep
  // them small (pop-out targets like field paths or panel ids, not bulk data).
  const params = new URLSearchParams();
  params.set('detached', '1');
  params.set('componentId', req.componentId);
  if (req.instance) params.set('instance', req.instance);
  params.set('title', req.title);
  if (req.props) params.set('props', JSON.stringify(req.props));

  const query = `?${params.toString()}`;
  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.loadURL(`${devUrl}/${query}`);
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query });
  }

  win.on('ready-to-show', () => win.show());

  const reg: RegisteredWindow = {
    id,
    componentId: req.componentId,
    ...(req.instance !== undefined ? { instance: req.instance } : {}),
    title: req.title,
    ...(req.props !== undefined ? { props: req.props } : {}),
    win,
  };
  detached.set(id, reg);

  const persist = () => {
    if (win.isDestroyed()) return;
    const b = win.getBounds();
    const list = workspaceStore.get('detachedWindows', []);
    const next = list.filter((w) => w.id !== id);
    const entry: DetachedWindowInfo = {
      id,
      componentId: req.componentId,
      ...(req.instance !== undefined ? { instance: req.instance } : {}),
      title: req.title,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      ...(req.props !== undefined ? { props: req.props } : {}),
    };
    next.push(entry);
    workspaceStore.set('detachedWindows', next);
  };
  win.on('move', persist);
  win.on('resize', persist);
  // Persist initial bounds too so close-before-move still restores correctly.
  win.once('ready-to-show', persist);

  win.on('closed', () => {
    detached.delete(id);
    const list = workspaceStore.get('detachedWindows', []);
    workspaceStore.set('detachedWindows', list.filter((w) => w.id !== id));
    if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send(IPC_CHANNELS.WINDOW_DETACHED_CLOSED, id);
    }
  });

  if (mainWindow && !mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
    const info: DetachedWindowInfo = {
      id,
      componentId: req.componentId,
      ...(req.instance !== undefined ? { instance: req.instance } : {}),
      title: req.title,
      bounds,
      ...(req.props !== undefined ? { props: req.props } : {}),
    };
    mainWindow.webContents.send(IPC_CHANNELS.WINDOW_DETACHED_OPENED, info);
  }

  return id;
}

export function closeDetachedWindow(id: string): void {
  const reg = detached.get(id);
  if (reg && !reg.win.isDestroyed()) reg.win.close();
}

export function listDetachedWindows(): DetachedWindowInfo[] {
  return [...detached.values()].map((reg) => {
    const b = reg.win.isDestroyed() ? { x: 0, y: 0, width: 0, height: 0 } : reg.win.getBounds();
    const info: DetachedWindowInfo = {
      id: reg.id,
      componentId: reg.componentId,
      ...(reg.instance !== undefined ? { instance: reg.instance } : {}),
      title: reg.title,
      bounds: { x: b.x, y: b.y, width: b.width, height: b.height },
      ...(reg.props !== undefined ? { props: reg.props } : {}),
    };
    return info;
  });
}

/**
 * Restore previously-open detached windows. Called after the main window is
 * created so the broadcasts have somewhere to land.
 */
export function restoreDetachedWindows(): void {
  const saved = workspaceStore.get('detachedWindows', []);
  for (const w of saved) {
    openDetachedWindow({
      componentId: w.componentId,
      ...(w.instance !== undefined ? { instance: w.instance } : {}),
      title: w.title,
      initialBounds: w.bounds,
      ...(w.props !== undefined ? { props: w.props } : {}),
    });
  }
}

/** Look up a window's stable id by inspecting the detached registry. */
function findWindowIdFor(win: BrowserWindow): string | undefined {
  for (const [id, reg] of detached) {
    if (reg.win === win) return id;
  }
  return undefined;
}

/**
 * Inspector state sync — renderer toggles pause/clear in one window and main
 * re-broadcasts to every window so the local Zustand stores stay aligned.
 * Sender receives its own echo (idempotent) so we don't have to special-case
 * the caller.
 */
export interface InspectorBroadcast {
  type: 'paused' | 'reset';
  paused?: boolean;
}

/**
 * Last mission snapshot published by the primary window. Cached so a detached
 * window opening AFTER the mission was authored can pull it on mount (the push
 * only reaches windows that already exist).
 */
let lastMissionMirror: unknown = null;

/** Wire renderer→main IPC for the window manager. Idempotent. */
export function setupWindowManagerIpc(): void {
  // Mission mirror: the primary window publishes its authored mission; we cache
  // it and push to every OTHER window (detached pop-outs). We skip echoing to
  // the sender so the primary never re-applies its own snapshot (no loop).
  ipcMain.handle(IPC_CHANNELS.MISSION_MIRROR, async (event, snapshot: unknown) => {
    lastMissionMirror = snapshot;
    for (const win of getAllWindows()) {
      if (win.webContents === event.sender) continue;
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.MISSION_MIRROR, snapshot);
        }
      } catch {
        // window destroyed between iteration and send; ignore
      }
    }
  });
  ipcMain.handle(IPC_CHANNELS.MISSION_MIRROR_REQUEST, async () => lastMissionMirror);

  ipcMain.handle(IPC_CHANNELS.INSPECTOR_BROADCAST, async (_, event: InspectorBroadcast) => {
    for (const win of getAllWindows()) {
      try {
        if (!win.isDestroyed() && !win.webContents.isDestroyed()) {
          win.webContents.send(IPC_CHANNELS.INSPECTOR_BROADCAST, event);
        }
      } catch {
        // window destroyed between iteration and send; ignore
      }
    }
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_OPEN_DETACHED, async (_, req: OpenDetachedRequest) => {
    const id = openDetachedWindow(req);
    // Re-apply pinned "always on top" if this window was previously pinned.
    if (pinnedIds.has(id)) {
      const reg = detached.get(id);
      if (reg && !reg.win.isDestroyed()) {
        reg.win.setAlwaysOnTop(true, 'floating');
      }
    }
    return id;
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_CLOSE_DETACHED, async (_, id: string) => {
    closeDetachedWindow(id);
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_DETACHED, async () => {
    return listDetachedWindows();
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_FOCUS_MAIN, async () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Always-on-top: toggle for the caller window. Uses 'floating' level so
  // the window stays above ArduDeck's main window but not above other apps
  // (matches what users expect from a pinned inspector — it floats over the
  // primary GCS without being a global HUD).
  ipcMain.handle(IPC_CHANNELS.WINDOW_SET_ALWAYS_ON_TOP_SELF, async (event, on: boolean) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    win.setAlwaysOnTop(on, 'floating');
    const id = findWindowIdFor(win);
    if (id) {
      if (on) pinnedIds.add(id);
      else pinnedIds.delete(id);
      savePinnedIds(pinnedIds);
    }
    return on;
  });
  ipcMain.handle(IPC_CHANNELS.WINDOW_GET_ALWAYS_ON_TOP_SELF, async (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win || win.isDestroyed()) return false;
    return win.isAlwaysOnTop();
  });
}
