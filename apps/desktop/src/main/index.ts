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
import { registerModuleSchemePrivileges, setupModuleProtocol } from './modules/module-protocol.js';
import { setupPythonIpc, cleanupPythonPlugins } from './python/python-ipc.js';

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

// Electron can still emit CSP warnings in development with Vite HMR.
// Keep warnings enabled in production builds.
if (isDev) {
  process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

function buildCsp(): string {
  const scriptSrc = isDev ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'" : "script-src 'self'";
  const directives = [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https: tile-cache: module:",
    "font-src 'self' data:",
    "object-src 'none'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
  ];

  if (isDev) {
    directives.push("connect-src 'self' http://localhost:* ws://localhost:* https: wss:");
  } else {
    directives.push("connect-src 'self' https: wss:");
  }

  return directives.join('; ');
}

function attachCsp(mainWindow: BrowserWindow): void {
  const csp = buildCsp();

  mainWindow.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });
}

async function loadRenderer(mainWindow: BrowserWindow): Promise<void> {
  if (isDev && process.env['ELECTRON_RENDERER_URL']) {
    const rendererUrl = process.env['ELECTRON_RENDERER_URL'];
    const fallbackUrls = [rendererUrl];

    try {
      const parsed = new URL(rendererUrl);
      const port = Number(parsed.port || '80');
      if (Number.isFinite(port) && port > 0) {
        const nextPort = String(port + 1);
        const thirdPort = String(port + 2);
        fallbackUrls.push(rendererUrl.replace(`:${port}`, `:${nextPort}`));
        fallbackUrls.push(rendererUrl.replace(`:${port}`, `:${thirdPort}`));
      }
    } catch {
      // Keep only the original URL if parsing fails.
    }

    for (let attempt = 1; attempt <= 20; attempt += 1) {
      for (const url of fallbackUrls) {
        try {
          await mainWindow.loadURL(url);
          return;
        } catch (error) {
          if (attempt === 20 && url === fallbackUrls[fallbackUrls.length - 1]) {
            console.error('[Main] Failed to load renderer URLs:', fallbackUrls, error);
            await mainWindow.loadURL(
              `data:text/html,${encodeURIComponent(
                '<h2>Renderer failed to start</h2><p>Vite dev server is unavailable. Check terminal logs and restart dev command.</p>',
              )}`,
            );
            return;
          }
        }
      }

      // Vite dev server can take a few seconds to become ready.
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return;
  }

  await mainWindow.loadFile(join(__dirname, '../renderer/index.html'));
}

// Set app name early to ensure consistent userData path in dev mode
// This ensures electron-store saves to %APPDATA%/ardudeck/ instead of %APPDATA%/Electron/
app.name = 'ardudeck';

// Register tile-cache:// scheme BEFORE app.ready (Electron requirement)
registerTileCacheScheme();
registerModuleSchemePrivileges();

async function createWindow(): Promise<BrowserWindow> {
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

  attachCsp(mainWindow);

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

  // Load the app with retries in dev mode.
  void loadRenderer(mainWindow);

  return mainWindow;
}

app.whenReady().then(async () => {
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

  const mainWindow = await createWindow();

  // Setup IPC handlers
  setupIpcHandlers(mainWindow);
  setupModuleIpc(mainWindow);
  setupTileCacheHandlers(mainWindow);
  setupPythonIpc(mainWindow);

  // Dev-only: start test driver MCP server
  if (isDev) {
    import('./testing/index.js').then((m) => m.initTestingMcp(mainWindow)).catch(console.error);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow();
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
    await cleanupPythonPlugins();
  } catch (err) {
    console.error('[App] Python cleanup error:', err);
  }
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
    await cleanupPythonPlugins();
  } catch (err) {
    console.error('[App] Python cleanup error:', err);
  }
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});

process.on('SIGTERM', async () => {
  try {
    await cleanupPythonPlugins();
  } catch (err) {
    console.error('[App] Python cleanup error:', err);
  }
  try {
    await cleanupOnShutdown();
  } catch (err) {
    console.error('[App] Cleanup error:', err);
  }
  process.exit(0);
});
