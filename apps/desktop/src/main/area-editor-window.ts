import { BrowserWindow, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { registerSecondaryWindow } from './window-manager.js';
import { t } from '../shared/i18n/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Nulled on 'closed' so a second open() re-creates rather than re-focusing a dead ref.
let areaEditorWindow: BrowserWindow | null = null;

// Latest map viewport reported by the main window, so the editor can open on the
// same location the user is looking at instead of a fixed default.
let lastMainViewport: { lat: number; lng: number; zoom: number } | null = null;
export function setMainMapViewport(v: { lat: number; lng: number; zoom: number }): void {
  lastMainViewport = v;
}

export function openAreaEditorWindow(): BrowserWindow {
  if (areaEditorWindow && !areaEditorWindow.isDestroyed()) {
    areaEditorWindow.focus();
    return areaEditorWindow;
  }

  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    title: t('main:areaEditorWindow.windowTitle'),
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.on('ready-to-show', () => {
    win.show();
  });

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Keep the singleton ref current. registerSecondaryWindow handles broadcast
  // cleanup on 'closed'; this handler keeps our local ref nulled separately.
  win.on('closed', () => {
    areaEditorWindow = null;
  });

  // Use the same detached-window convention as window-manager so the renderer's
  // existing URLSearchParams routing picks it up: detached=1&componentId=area-editor.
  const params = new URLSearchParams();
  params.set('detached', '1');
  params.set('componentId', 'area-editor');
  params.set('title', t('main:areaEditorWindow.title'));
  if (lastMainViewport) {
    params.set('lat', String(lastMainViewport.lat));
    params.set('lng', String(lastMainViewport.lng));
    params.set('zoom', String(lastMainViewport.zoom));
  }
  const query = `?${params.toString()}`;

  const devUrl = process.env['ELECTRON_RENDERER_URL'];
  if (devUrl) {
    win.loadURL(`${devUrl}/${query}`);
    // Detached windows have no menu/shortcut wired for devtools; open it in dev
    // so the console is reachable.
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), { search: query });
  }

  // Register with window-manager so broadcast() delivers telemetry, connection
  // state, and MAVLink packets to this window alongside all other windows.
  registerSecondaryWindow(win);

  areaEditorWindow = win;
  return win;
}
