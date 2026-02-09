/**
 * MSP Shared State Context
 *
 * Singleton class holding all mutable state shared across MSP domain modules.
 * Every domain module imports `ctx` instead of module-level `let` variables.
 */

import type { BrowserWindow } from 'electron';
import type { Transport } from '@ardudeck/comms';
import { MSPParser, type MSPInavPid } from '@ardudeck/msp-ts';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

// Constants
export const TELEMETRY_STUCK_TIMEOUT = 5000; // 5 seconds - auto-reset if stuck longer
export const TELEMETRY_SKIP_LOG_INTERVAL = 100; // Only log every N skips

export class MspContext {
  // Connection
  mspParser: MSPParser | null = null;
  mainWindow: BrowserWindow | null = null;
  currentTransport: Transport | null = null;

  // Firmware detection
  isInavFirmware = false;
  inavVersion = ''; // e.g., "2.0.0"
  currentPlatformType = 0; // 0=multirotor, 1=airplane

  // Telemetry
  telemetryInterval: ReturnType<typeof setInterval> | null = null;
  telemetryInProgress = false;
  telemetryLastStartTime = 0;
  telemetrySkipCount = 0;
  telemetryPollCount = 0;
  telemetryGeneration = 0;

  // Cached box names for flight mode decoding
  cachedBoxNames: string[] = [];
  lastArmingFlags: number | null = null;

  // RC poll
  rcPollInterval: ReturnType<typeof setInterval> | null = null;
  rcPollInFlight = false;
  rcPollActive = false;
  lastKnownThrottlePercent = 0;
  lastSentThrottlePercent: number | null = null;

  // Debug counter for setRawRc logging
  setRawRcCounter = 0;

  // GPS sender
  gpsSenderInterval: ReturnType<typeof setInterval> | null = null;
  gpsSenderEnabled = false;
  gpsSenderLoggedOnce = false;

  // Mutex & locking
  requestMutex: Promise<void> = Promise.resolve();
  mutexRelease: (() => void) | null = null;
  configLockCount = 0;

  // CLI fallback state
  servoCliModeActive = false;
  tuningCliModeActive = false;
  tuningCliResponse = '';
  tuningCliListener: ((data: Uint8Array) => void) | null = null;
  pendingMixerType: number | null = null;
  cliResponseListener: ((data: Uint8Array) => void) | null = null;
  cliResponse = '';
  usesCliServoFallback = false;
  servoConfigModeProbed = false;

  // Caches
  cachedInavPid: MSPInavPid | null = null;
  cachedRxMap: number[] = [0, 1, 2, 3, 4, 5, 6, 7]; // Default AETR

  // Pending MSP responses
  pendingResponses = new Map<
    number,
    { resolve: (payload: Uint8Array) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
  >();

  // Track commands that returned errors (to avoid spam logging)
  unsupportedCommands = new Set<number>();

  // SITL
  skipSitlAutoConfig = false;

  // Logging
  mspLogId = 1_000_000;

  // Settings cache
  settingsCache = new Map<string, import('./msp-settings.js').SettingInfo>();

  // ---- Helper methods ----

  /** Check if iNav version is legacy (< 2.3.0) */
  isLegacyInav(): boolean {
    if (!this.isInavFirmware || !this.inavVersion) return false;
    const parts = this.inavVersion.split('.').map(Number);
    if (parts.length < 2) return false;
    const [major, minor] = parts;
    return major! < 2 || (major! === 2 && minor! < 3);
  }

  /** Check if iNav version requires MSP2 for PIDs (>= 7.0.0) */
  usesMsp2Pid(): boolean {
    if (!this.isInavFirmware || !this.inavVersion) return false;
    const parts = this.inavVersion.split('.').map(Number);
    if (parts.length < 1) return false;
    const [major] = parts;
    return major! >= 7;
  }

  /** Safe IPC send that won't throw if window is destroyed */
  safeSend(channel: string, data: unknown): void {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send(channel, data);
    }
  }

  /** Send a log message to the renderer console */
  sendLog(level: 'info' | 'warn' | 'error', message: string, details?: string): void {
    this.safeSend(IPC_CHANNELS.CONSOLE_LOG, {
      id: ++this.mspLogId,
      timestamp: Date.now(),
      level,
      message,
      details,
    });
  }

  /** Reset all state to defaults (call on disconnect) */
  resetAll(): void {
    // Telemetry
    if (this.telemetryInterval) {
      clearInterval(this.telemetryInterval);
      this.telemetryInterval = null;
    }
    this.telemetryInProgress = false;
    this.telemetryLastStartTime = 0;
    this.telemetrySkipCount = 0;
    this.telemetryGeneration++;

    // RC poll
    if (this.rcPollInterval) {
      clearInterval(this.rcPollInterval);
      this.rcPollInterval = null;
    }
    this.rcPollInFlight = false;
    this.rcPollActive = false;
    this.lastKnownThrottlePercent = 0;
    this.lastSentThrottlePercent = null;
    this.setRawRcCounter = 0;

    // GPS sender
    if (this.gpsSenderInterval) {
      clearInterval(this.gpsSenderInterval);
      this.gpsSenderInterval = null;
    }
    this.gpsSenderEnabled = false;
    this.gpsSenderLoggedOnce = false;

    // Cached box names
    this.cachedBoxNames = [];
    this.lastArmingFlags = null;

    // Mutex & locking
    this.requestMutex = Promise.resolve();
    this.configLockCount = 0;

    // CLI fallback state
    this.servoCliModeActive = false;
    this.tuningCliModeActive = false;
    this.tuningCliResponse = '';
    this.tuningCliListener = null;
    this.pendingMixerType = null;
    this.cliResponseListener = null;
    this.cliResponse = '';
    this.usesCliServoFallback = false;
    this.servoConfigModeProbed = false;

    // Caches
    this.cachedInavPid = null;
    this.cachedRxMap = [0, 1, 2, 3, 4, 5, 6, 7];

    // Pending responses
    for (const [, pending] of this.pendingResponses) {
      clearTimeout(pending.timeout);
    }
    this.pendingResponses.clear();
    this.unsupportedCommands.clear();

    // Firmware/platform
    this.isInavFirmware = false;
    this.inavVersion = '';
    this.currentPlatformType = 0;

    // Settings
    this.settingsCache.clear();

    // Transport/parser
    this.mspParser = null;
    this.currentTransport = null;
  }
}

export const ctx = new MspContext();
