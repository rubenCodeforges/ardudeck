/**
 * Electron Main Process
 * Handles window management and native integrations
 */

import { app, BrowserWindow, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers, cleanupOnShutdown } from './ipc-handlers.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Set app name early to ensure consistent userData path in dev mode
// This ensures electron-store saves to %APPDATA%/ardudeck/ instead of %APPDATA%/Electron/
app.name = 'ardudeck';

function createWindow(): BrowserWindow {
  // Get the icon path based on platform
  // In dev: __dirname is out/main/, resources is at ../../resources/
  // In prod: app.getAppPath() points to the app root
  const resourcesPath = isDev
    ? join(__dirname, '../../resources')
    : join(app.getAppPath(), 'resources');

  const iconPath = process.platform === 'win32'
    ? join(resourcesPath, 'icon.ico')
    : process.platform === 'darwin'
    ? join(resourcesPath, 'icon.icns')
    : join(resourcesPath, 'icon.png');

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: iconPath,
    webPreferences: {
      preload: join(__dirname, '../preload/index.mjs'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  // Open DevTools in development
  if (isDev) {
    mainWindow.webContents.openDevTools();
  }

  // Load the app
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']);
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
  }

  return mainWindow;
}

app.whenReady().then(() => {
  // Set macOS dock icon
  if (process.platform === 'darwin') {
    const resourcesPath = isDev
      ? join(__dirname, '../../resources')
      : join(app.getAppPath(), 'resources');
    app.dock.setIcon(join(resourcesPath, 'icon.png'));
  }

  const mainWindow = createWindow();

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// BSOD Prevention: Clean up serial/USB connections before app quits
// This is CRITICAL for Windows USB drivers (CH340, CP210x, FTDI)
// Without proper cleanup, drivers may not release, causing issues on reconnect
app.on('before-quit', async (event) => {
  // Prevent immediate quit to allow async cleanup
  event.preventDefault();

  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }

  // Now actually quit
  app.exit(0);
});

// Also handle SIGINT/SIGTERM for graceful shutdown in dev mode
process.on('SIGINT', async () => {
  console.log('[App] SIGINT received, cleaning up...');
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('[App] SIGTERM received, cleaning up...');
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});
