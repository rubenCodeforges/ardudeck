/**
 * Splash window
 *
 * A frameless, transparent, zero-dependency launch card shown instantly on cold
 * start while the heavy renderer boots hidden in parallel. It loads a static
 * `resources/splash.html` (no preload, no bundle) so it paints in ~1 frame.
 *
 * The main process drives the page by calling `window.splash.*` via
 * `executeJavaScript` - deliberately no IPC/preload bridge, to keep the splash
 * a self-contained asset. All strings passed in are main-authored constants.
 */

import { app, BrowserWindow } from 'electron';
import { join } from 'path';

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

function resourcesPath(): string {
  // Mirror createWindow()'s dev/prod resolution.
  return isDev
    ? join(__dirname, '../../resources')
    : join(app.getAppPath(), 'resources');
}

/**
 * Create and immediately show the splash window. Never throws - any failure is
 * logged and swallowed so a broken splash can never block app boot.
 */
export function createSplashWindow(): BrowserWindow | null {
  try {
    // Transparent, shadow-clipping-free window works on macOS/Linux. On Windows a
    // transparent window uses a software-composited path that has historically
    // been unstable, so there we render an OPAQUE variant instead: same window
    // size, but painted the card's navy so the 20px margin around the card (where
    // mac/linux show the desktop through the CSS drop-shadow) simply renders navy
    // and stays seamless. Same splash, Windows-safe compositing.
    const isWin = process.platform === 'win32';
    const win = new BrowserWindow({
      // 40px larger than the 440x340 card on every platform so the card keeps its
      // 20px breathing room and its top radar rings/glow aren't clipped by the
      // window edge. On Windows the surrounding margin is filled by backgroundColor.
      width: 480,
      height: 380,
      frame: false,
      transparent: !isWin,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      center: true,
      show: false,
      // Transparent (mac/linux) needs no background/shadow. Opaque (Windows) gets
      // the navy card colour to avoid a white flash, and the native OS shadow.
      hasShadow: isWin,
      backgroundColor: isWin ? '#0d1524' : undefined,
      webPreferences: {
        // No preload, no node - it is a static page driven via executeJavaScript.
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    win.once('ready-to-show', () => {
      if (!win.isDestroyed()) win.show();
    });

    win.loadFile(join(resourcesPath(), 'splash.html')).catch((err) => {
      console.error('[Splash] Failed to load splash.html:', err);
      if (!win.isDestroyed()) win.close();
    });

    // Seed the version once the page is ready to receive calls.
    win.webContents.once('did-finish-load', () => {
      splashRun(win, `window.splash.setVersion(${JSON.stringify(app.getVersion())})`);
    });

    return win;
  } catch (err) {
    console.error('[Splash] Failed to create splash window:', err);
    return null;
  }
}

/** Push a status milestone to the splash. No-op if the window is gone. */
export function splashSetStatus(win: BrowserWindow | null, text: string): void {
  if (!win) return;
  splashRun(win, `window.splash.setStatus(${JSON.stringify(text)})`);
}

/**
 * Play the fade-out then close. Guards against double-close / destroyed windows.
 * Resolves after the window is closed (or immediately if already gone).
 */
export function closeSplash(win: BrowserWindow | null): void {
  if (!win || win.isDestroyed()) return;
  splashRun(win, 'window.splash.fadeOut()');
  // fadeOut() plays a completion beat (final check → OK, bar fills, ~140ms)
  // then the 300ms card fade. Wait for the whole ~440ms before closing so the
  // fade isn't cut off mid-animation.
  setTimeout(() => {
    if (!win.isDestroyed()) win.close();
  }, 500);
}

function splashRun(win: BrowserWindow, code: string): void {
  if (win.isDestroyed()) return;
  win.webContents.executeJavaScript(code).catch(() => {
    // Page not ready / already navigating away - safe to ignore.
  });
}
