/**
 * Electron Main Process
 * Handles window management and native integrations
 */

import { app, BrowserWindow, dialog, shell } from 'electron';
import { existsSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { setupIpcHandlers, cleanupOnShutdown } from './ipc-handlers.js';
import { setupModuleIpc } from './modules/module-ipc.js';
import { registerTileCacheScheme, setupTileCacheProtocol, setupTileCacheHandlers } from './tile-cache.js';
import { registerModuleSchemePrivileges, setupModuleProtocol } from './modules/module-protocol.js';
import { setupDeepLinks, handleStartupArgs, flushPendingDeepLink, deliverDeepLinkUrl } from './modules/deep-link.js';
import { initWindowManager, restoreDetachedWindows, setupWindowManagerIpc } from './window-manager.js';
import { createSplashWindow, splashSetStatus, closeSplash } from './splash-window.js';

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
  console.error('[Main] Rejection type:', typeof reason, reason?.constructor?.name);
  console.error('[Main] Rejection stack:', new Error('rejection trace').stack);
});

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

// Single-instance lock so ardudeck:// deep links route to the running app
// instead of spawning a second one.
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
}

// Track the main window so deep-link handlers can focus/message it.
let mainWindowRef: BrowserWindow | null = null;
setupDeepLinks(() => mainWindowRef);

// Set app name early to ensure consistent userData path in dev mode
// This ensures electron-store saves to %APPDATA%/ardudeck/ instead of %APPDATA%/Electron/
app.name = 'ardudeck';

// Register tile-cache:// scheme BEFORE app.ready (Electron requirement)
registerTileCacheScheme();
registerModuleSchemePrivileges();

/**
 * macOS shows a scary system prompt ("ardudeck wants to access your
 * confidential information") the first time a build with a new code signature
 * reads the "ardudeck Safe Storage" keychain entry created by an older,
 * differently-signed build. That read happens as soon as the first
 * BrowserWindow's session initialises, so this notice must run BEFORE
 * createWindow() and before any safeStorage call. Fresh installs create the
 * entry silently and never see the system prompt, so only warn when a
 * previous install is detected (settings.json is written on every run).
 * Shown at most once per machine.
 */
function maybeShowKeychainNotice(): void {
  if (process.platform !== 'darwin' || !app.isPackaged) return;
  const userData = app.getPath('userData');
  const marker = join(userData, '.keychain-notice-shown');
  if (existsSync(marker)) return;
  const isUpgrade = existsSync(join(userData, 'settings.json'));
  try {
    writeFileSync(marker, '1');
  } catch {
    /* best effort - worst case the notice shows again next launch */
  }
  if (!isUpgrade) return;
  dialog.showMessageBoxSync({
    type: 'info',
    title: 'ArduDeck',
    message: 'Your keys are protected',
    detail:
      'ArduDeck encrypts the sensitive data you enter - AI provider API keys, map service keys and connection tokens - and keeps the encryption key in your macOS keychain, the same vault Safari uses for your passwords.\n\n' +
      'Because macOS guards that vault, it may ask once whether ArduDeck can access "ardudeck Safe Storage". That is ArduDeck unlocking its own encryption key, nothing else.\n\n' +
      'Click "Always Allow" and macOS will not ask again. Nothing is read from other apps and nothing ever leaves this computer.',
    buttons: ['Got it'],
  });
}

function createWindow(splash?: BrowserWindow | null): BrowserWindow {
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

  // Milestone: the renderer bundle has parsed and is executing.
  mainWindow.webContents.once('did-finish-load', () => {
    splashSetStatus(splash ?? null, 'Loading interface');
  });

  // Safety net: if ready-to-show never fires, don't leave the splash orphaned
  // (or the main window forever hidden). Close splash and reveal main anyway.
  const handoffTimeout = setTimeout(() => {
    if (!mainWindow.isDestroyed() && !mainWindow.isVisible()) {
      console.warn('[Main] ready-to-show timed out; forcing window handoff');
      closeSplash(splash ?? null);
      mainWindow.show();
    }
  }, 8000);

  mainWindow.on('ready-to-show', () => {
    clearTimeout(handoffTimeout);
    splashSetStatus(splash ?? null, 'Ready');
    closeSplash(splash ?? null);
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
  // A second instance is quitting; don't open another window.
  if (!gotSingleInstanceLock) return;

  // Set macOS dock icon
  if (process.platform === 'darwin') {
    const resourcesPath = isDev
      ? join(__dirname, '../../resources')
      : join(app.getAppPath(), 'resources');
    app.dock.setIcon(join(resourcesPath, 'icon.png'));
  }

  // Setup tile cache protocol handler (must be after app.ready)
  setupTileCacheProtocol();
  setupModuleProtocol();

  // Must run before the first BrowserWindow exists: creating a session is
  // what triggers the Safe Storage keychain read on macOS.
  maybeShowKeychainNotice();

  // Instant branded launch card; covers the gap while the renderer boots hidden.
  const splash = createSplashWindow();

  const mainWindow = createWindow(splash);
  mainWindowRef = mainWindow;

  // Register the main window with the detachable-windows manager BEFORE any
  // IPC handlers wire up, so safeSend's broadcast() helper can see it.
  initWindowManager(mainWindow);
  setupWindowManagerIpc();

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);
  setupModuleIpc(mainWindow);
  setupTileCacheHandlers(mainWindow);

  splashSetStatus(splash, 'Initializing systems');

  // Restore any detached windows the user had open last time.
  // Defer until after the main window is ready so the renderer has subscribed
  // to the push channels by the time pop-outs spawn (they share the broadcast).
  mainWindow.webContents.once('did-finish-load', () => {
    restoreDetachedWindows();
    // Deliver any deep link captured before the renderer was ready, and handle
    // a link present in the initial launch argv (Windows/Linux cold start).
    flushPendingDeepLink();
    handleStartupArgs(process.argv);
    // Dev: macOS can't OS-register the scheme for an unpackaged build, so allow
    // testing the deep-link path by feeding a URL in directly.
    //   ARDUDECK_DEEPLINK="ardudeck://open?view=mission" npm run dev
    if (isDev && process.env['ARDUDECK_DEEPLINK']) {
      deliverDeepLinkUrl(process.env['ARDUDECK_DEEPLINK']);
    }
  });

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
