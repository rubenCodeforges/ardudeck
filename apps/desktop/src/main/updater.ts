/**
 * Auto-Update Module
 *
 * Uses electron-updater for real in-app auto-updates:
 * check -> download with progress -> restart to install.
 *
 * On macOS, if the app is not code-signed, falls back to
 * opening the release page in the browser instead of downloading.
 *
 * All state changes are pushed to the renderer via APP_UPDATE_STATUS.
 */

import { app, BrowserWindow } from 'electron';
import { execFile } from 'node:child_process';
import pkg from 'electron-updater';
const { autoUpdater } = pkg;
import { IPC_CHANNELS, type AppUpdateInfo } from '../shared/ipc-channels.js';

let mainWindow: BrowserWindow | null = null;
let canAutoUpdate = true;

/**
 * Check if the app is code-signed on macOS.
 * Returns true if signed (auto-update will work), false if unsigned.
 */
function checkMacCodeSigning(): Promise<boolean> {
  if (process.platform !== 'darwin') return Promise.resolve(true);

  return new Promise((resolve) => {
    const appPath = app.getPath('exe').replace(/\/Contents\/MacOS\/.*$/, '');
    execFile('codesign', ['--verify', '--deep', '--strict', appPath], (error) => {
      resolve(!error);
    });
  });
}

function sendStatus(info: Partial<AppUpdateInfo>) {
  const payload: AppUpdateInfo = {
    status: 'idle',
    currentVersion: app.getVersion(),
    canAutoUpdate,
    ...info,
  };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(IPC_CHANNELS.APP_UPDATE_STATUS, payload);
  }
}

/**
 * Initialize auto-updater. Must be called once after mainWindow is created.
 */
export async function initAutoUpdater(win: BrowserWindow): Promise<void> {
  mainWindow = win;

  // Don't run in dev mode - electron-updater throws without a packaged app
  if (!app.isPackaged) {
    return;
  }

  // Check code signing on macOS
  canAutoUpdate = await checkMacCodeSigning();
  if (!canAutoUpdate) {
    console.log('[Updater] App is not code-signed, auto-download disabled (will open release page instead)');
  }

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => {
    sendStatus({ status: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    sendStatus({
      status: 'available',
      latestVersion: info.version,
      releaseName: info.releaseName ?? `v${info.version}`,
      releaseUrl: `https://github.com/rubenCodeforges/ardudeck/releases/tag/v${info.version}`,
      publishedAt: info.releaseDate ?? '',
    });
  });

  autoUpdater.on('update-not-available', () => {
    sendStatus({ status: 'not-available' });
  });

  autoUpdater.on('download-progress', (progress) => {
    sendStatus({
      status: 'downloading',
      downloadProgress: progress.percent,
      bytesDownloaded: progress.transferred,
      totalBytes: progress.total,
      downloadSpeed: progress.bytesPerSecond,
    });
  });

  autoUpdater.on('update-downloaded', (info) => {
    sendStatus({
      status: 'downloaded',
      latestVersion: info.version,
      releaseName: info.releaseName ?? `v${info.version}`,
      releaseUrl: `https://github.com/rubenCodeforges/ardudeck/releases/tag/v${info.version}`,
      publishedAt: info.releaseDate ?? '',
    });
  });

  autoUpdater.on('error', (err) => {
    sendStatus({
      status: 'error',
      error: err.message,
    });
  });

  // Auto-check 10s after launch
  setTimeout(() => {
    checkForUpdates();
  }, 10_000);
}

/**
 * Check for updates. Results arrive via APP_UPDATE_STATUS events.
 */
export function checkForUpdates(): void {
  if (!app.isPackaged) {
    sendStatus({ status: 'not-available' });
    return;
  }
  autoUpdater.checkForUpdates().catch(() => {
    // Error already handled by 'error' event
  });
}

/**
 * Start downloading the available update.
 */
export function downloadUpdate(): void {
  if (!app.isPackaged || !canAutoUpdate) return;
  autoUpdater.downloadUpdate().catch(() => {
    // Error already handled by 'error' event
  });
}

/**
 * Quit and install the downloaded update.
 */
export function installUpdate(): void {
  if (!app.isPackaged || !canAutoUpdate) return;
  autoUpdater.quitAndInstall();
}
