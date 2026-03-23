/**
 * Electron Main Process
 * Handles window management and native integrations
 */

import { app, BrowserWindow, shell } from 'electron';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers, cleanupOnShutdown } from './ipc-handlers.js';
import { setupModuleIpc } from './modules/module-ipc.js';
import { registerTileCacheScheme, setupTileCacheProtocol, setupTileCacheHandlers } from './tile-cache.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Handle uncaught exceptions gracefully - especially network errors
// ECONNRESET happens when SITL is killed while connected
process.on('uncaughtException', (error: Error) => {
  // Network errors are expected when SITL/connection is killed
  const isNetworkError = error.message.includes('ECONNRESET') ||
    error.message.includes('ECONNREFUSED') ||
    error.message.includes('EPIPE') ||
    error.message.includes('ETIMEDOUT');

  if (isNetworkError) {
    console.warn('[Main] Network error (expected during disconnect):', error.message);
    return; // Don't crash
  }

  // Log other uncaught exceptions but don't crash
  console.error('[Main] Uncaught exception:', error);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason: unknown) => {
  const message = reason instanceof Error ? reason.message : String(reason);

  // Network errors are expected
  const isNetworkError = message.includes('ECONNRESET') ||
    message.includes('ECONNREFUSED') ||
    message.includes('EPIPE') ||
    message.includes('ETIMEDOUT');

  if (isNetworkError) {
    console.warn('[Main] Network rejection (expected during disconnect):', message);
    return;
  }

  console.error('[Main] Unhandled rejection:', reason);
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Set app name early to ensure consistent userData path in dev mode
// This ensures electron-store saves to %APPDATA%/ardudeck/ instead of %APPDATA%/Electron/
app.name = 'ardudeck';

// Register tile-cache:// scheme BEFORE app.ready (Electron requirement)
registerTileCacheScheme();

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

  // Setup tile cache protocol handler (must be after app.ready)
  setupTileCacheProtocol();

  const mainWindow = createWindow();

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);
  setupModuleIpc(mainWindow);
  setupTileCacheHandlers(mainWindow);

  // Dev-only: start test driver MCP server
  if (isDev) {
    import('./testing/index.js').then((m) => m.initTestingMcp(mainWindow)).catch(console.error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  app.quit();
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
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});
