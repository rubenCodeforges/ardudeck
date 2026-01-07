/**
 * MSP Protocol Handler
 *
 * Handles MSP protocol communication with Betaflight/iNav/Cleanflight boards.
 * Integrates with the main connection flow - NOT a separate connection system.
 * Sends telemetry via the same TELEMETRY_UPDATE channel as MAVLink.
 */

import { ipcMain, BrowserWindow } from 'electron';
import type { Transport } from '@ardudeck/comms';
import {
  MSPParser,
  buildMspV1Request,
  buildMspV1RequestWithPayload,
  buildMspV2Request,
  buildMspV2RequestWithPayload,
  MSP,
  MSP2,
  INAV_PLATFORM_TYPE,
  deserializeFcVariant,
  deserializeFcVersion,
  deserializeBoardInfo,
  deserializeApiVersion,
  deserializeStatus,
  deserializeAttitude,
  deserializeAltitude,
  deserializeAnalog,
  deserializeRc,
  deserializeMotor,
  deserializeRawGps,
  isArmed,
  attitudeToDegrees,
  altitudeToMeters,
  gpsToDecimalDegrees,
  // Config
  deserializePid,
  serializePid,
  deserializeRcTuning,
  deserializeRcTuningInav,
  serializeRcTuning,
  serializeRcTuningInav,
  deserializeModeRanges,
  serializeModeRange,
  deserializeFeatureConfig,
  deserializeMixerConfig,
  serializeMixerConfig,
  isMultirotorMixer,
  getMixerName,
  // iNav Mixer Config (proper MSP2 commands)
  deserializeInavMixerConfig,
  serializeInavMixerConfig,
  isInavMultirotor,
  // iNav Rate Profile (MSP2 0x2007/0x2008 - what iNav configurator uses!)
  deserializeInavRateProfile,
  serializeInavRateProfile,
  rcTuningToInavRateProfile,
  inavRateProfileToRcTuning,
  // iNav MSP2 PID (0x2030/0x2031 - required for iNav 9.0.0+!)
  deserializeInavPid,
  serializeInavPid,
  inavPidToPid,
  pidToInavPid,
  mergeInavPid,
  type MSPInavPid,
  // Servo Config
  deserializeServoConfigurations,
  serializeServoConfiguration,
  deserializeServoValues,
  deserializeServoMixerRules,
  serializeServoMixerRule,
  // Navigation Config
  deserializeNavConfig,
  serializeNavConfig,
  deserializeGpsConfig,
  serializeGpsConfig,
  type MSPPid,
  type MSPRcTuning,
  type MSPModeRange,
  type MSPServoConfig,
  type MSPServoMixerRule,
  type MSPNavConfig,
  type MSPGpsConfig,
  type MSPInavMixerConfig,
} from '@ardudeck/msp-ts';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';
import { initCliHandlers, setCliTransport, setCliModeChangeCallback, cleanupCli, isCliModeActive, exitCliModeIfActive } from '../cli/cli-handlers.js';

// Re-export for use in ipc-handlers disconnect
export { exitCliModeIfActive };

// =============================================================================
// State (managed by main ipc-handlers, not here)
// =============================================================================

let mspParser: MSPParser | null = null;
let telemetryInterval: ReturnType<typeof setInterval> | null = null;
let mainWindow: BrowserWindow | null = null;
let currentTransport: Transport | null = null;

// BSOD FIX: Prevent overlapping telemetry polls that can stack up
let telemetryInProgress = false;

// Telemetry skip counter - reduce log spam
let telemetrySkipCount = 0;

// Skip SITL auto-configure after user manually changes platform
let skipSitlAutoConfig = false;

// Reset the skip flag (call when starting new SITL session)
export function resetSitlAutoConfig(): void {
  skipSitlAutoConfig = false;
  console.log('[MSP] SITL auto-config reset - will auto-configure on next connect');
}
const TELEMETRY_SKIP_LOG_INTERVAL = 10; // Only log every N skips

// Pending response handlers
const pendingResponses = new Map<
  number,
  { resolve: (payload: Uint8Array) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();

// Track commands that returned errors (to avoid spam logging)
const unsupportedCommands = new Set<number>();

// Track firmware type for protocol decisions
let isInavFirmware = false;
let inavVersion = ''; // e.g., "2.0.0"

// Track platform type for CLI PID commands
// 0=multirotor, 1=airplane (fixed-wing)
let currentPlatformType = 0;

// Cache full iNav PID state for read-modify-write pattern
// iNav requires ALL 11 PID controllers (44 bytes) when writing
let cachedInavPid: MSPInavPid | null = null;

// Check if iNav version is legacy (< 2.3.0) - different CLI params, no per-axis RC rates
function isLegacyInav(): boolean {
  if (!isInavFirmware || !inavVersion) return false;
  const parts = inavVersion.split('.').map(Number);
  if (parts.length < 2) return false;
  const [major, minor] = parts;
  return major < 2 || (major === 2 && minor < 3);
}

// Check if iNav version requires MSP2 for PIDs (>= 7.0.0)
// Legacy MSP_PID (112) was removed in iNav 7.0+
function usesMsp2Pid(): boolean {
  if (!isInavFirmware || !inavVersion) return false;
  const parts = inavVersion.split('.').map(Number);
  if (parts.length < 1) return false;
  const [major] = parts;
  // iNav 7.0+ requires MSP2_INAV_PID
  return major >= 7;
}

// Request mutex - ensures only one MSP request is in-flight at a time
let requestMutex: Promise<void> = Promise.resolve();
let mutexRelease: (() => void) | null = null;

// Config command lock - prevents telemetry from interfering with config reads
let configLockCount = 0;

// RC polling state - prevents overlapping RC polls
let rcPollInFlight = false;

// CLI servo config mode - when MSP_SET_SERVO_CONFIGURATION is not supported
let servoCliModeActive = false;

// CLI tuning mode - when MSP_SET_PID/RC_TUNING not supported (legacy iNav)
// When true, all tuning commands should use CLI instead of MSP
let tuningCliModeActive = false;

// Pending mixer type to set via CLI during saveEepromViaCli
// On old iNav, MSP_SET_MIXER_CONFIG doesn't work - mixer must be set via CLI
let pendingMixerType: number | null = null;

// CLI response buffer for tuning commands
let tuningCliResponse = '';
let tuningCliListener: ((data: Uint8Array) => void) | null = null;

// =============================================================================
// Helpers
// =============================================================================

/**
 * Acquire the request mutex. Returns a release function.
 * This ensures only one MSP request is in-flight at a time.
 */
async function acquireMutex(): Promise<() => void> {
  // Wait for any existing request to complete
  await requestMutex;

  // Create a new promise that will be resolved when we release
  let release: () => void;
  requestMutex = new Promise(resolve => {
    release = resolve;
  });

  return release!;
}

function safeSend(channel: string, data: unknown): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

// Unique log ID counter (start at 1M to avoid collision with main ipc-handlers counter)
let mspLogId = 1_000_000;

function sendLog(level: 'info' | 'warn' | 'error', message: string, details?: string): void {
  safeSend(IPC_CHANNELS.CONSOLE_LOG, {
    id: ++mspLogId,
    timestamp: Date.now(),
    level,
    message,
    details,
  });
}

async function sendMspRequest(command: number, timeout: number = 1000): Promise<Uint8Array> {
  if (!currentTransport || !currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  // CRITICAL: Block ALL MSP requests while in CLI mode
  // CLI mode is raw serial - sending MSP packets will corrupt the CLI session
  if (servoCliModeActive) {
    throw new Error('MSP blocked - CLI mode active');
  }

  // Acquire mutex - only one request at a time
  const release = await acquireMutex();

  try {
    const packet = buildMspV1Request(command);
    await currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pendingResponses.delete(command);
        reject(new Error(`MSP command ${command} timed out`));
      }, timeout);

      pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

async function sendMspRequestWithPayload(command: number, payload: Uint8Array, timeout: number = 1000): Promise<Uint8Array> {
  if (!currentTransport || !currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  // CRITICAL: Block ALL MSP requests while in CLI mode
  if (servoCliModeActive) {
    throw new Error('MSP blocked - CLI mode active');
  }

  // Acquire mutex - only one request at a time
  const release = await acquireMutex();

  try {
    const packet = buildMspV1RequestWithPayload(command, payload);
    await currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pendingResponses.delete(command);
        reject(new Error(`MSP command ${command} timed out`));
      }, timeout);

      pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

/**
 * Send an MSP v2 request (for commands > 255 like iNav extensions)
 */
async function sendMspV2Request(command: number, timeout: number = 1000): Promise<Uint8Array> {
  if (!currentTransport || !currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  // CRITICAL: Block ALL MSP requests while in CLI mode
  if (servoCliModeActive) {
    throw new Error('MSP blocked - CLI mode active');
  }

  // Acquire mutex - only one request at a time
  const release = await acquireMutex();

  try {
    const packet = buildMspV2Request(command);
    await currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pendingResponses.delete(command);
        reject(new Error(`MSP2 command ${command.toString(16)} timed out`));
      }, timeout);

      pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

async function sendMspV2RequestWithPayload(command: number, payload: Uint8Array, timeout: number = 1000): Promise<Uint8Array> {
  if (!currentTransport || !currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  // CRITICAL: Block ALL MSP requests while in CLI mode
  if (servoCliModeActive) {
    throw new Error('MSP blocked - CLI mode active');
  }

  // Acquire mutex - only one request at a time
  const release = await acquireMutex();

  try {
    const packet = buildMspV2RequestWithPayload(command, payload);
    await currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        pendingResponses.delete(command);
        reject(new Error(`MSP2 command ${command.toString(16)} timed out`));
      }, timeout);

      pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

function handleMspResponse(command: number, payload: Uint8Array): void {
  // Debug logging disabled - uncomment for debugging
  // console.log(`[MSP] Response cmd=${command} (${payload.length} bytes)`);

  const pending = pendingResponses.get(command);
  if (pending) {
    clearTimeout(pending.timeout);
    pendingResponses.delete(command);
    pending.resolve(payload);
  }
}

/**
 * Run a config command with telemetry paused.
 * This prevents telemetry polling from interfering with config reads.
 */
async function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  configLockCount++;
  try {
    // Small delay to let any in-flight telemetry requests complete
    if (configLockCount === 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return await fn();
  } finally {
    configLockCount--;
  }
}

// =============================================================================
// MSP Detection & Setup (called from main connect handler)
// =============================================================================

/**
 * Try to detect MSP protocol on an already-open transport.
 * Returns board info if MSP is detected, null otherwise.
 */
export async function tryMspDetection(
  transport: Transport,
  window: BrowserWindow
): Promise<{
  fcVariant: string;
  fcVersion: string;
  boardId: string;
  apiVersion: string;
} | null> {
  mainWindow = window;
  currentTransport = transport;
  mspParser = new MSPParser();

  // Reset all CLI mode flags to ensure clean state
  servoCliModeActive = false;
  tuningCliModeActive = false;

  // Share transport with CLI handlers
  setCliTransport(transport);

  sendLog('info', 'Trying MSP protocol detection...');

  // Setup data handler for MSP
  const dataHandler = (data: Uint8Array) => {
    // Skip MSP parsing when in CLI mode - CLI handler processes raw text
    if (isCliModeActive()) return;
    if (!mspParser) return;
    const packets = mspParser.parseSync(data);
    for (const packet of packets) {
      if (packet.direction === 'response') {
        handleMspResponse(packet.command, packet.payload);
      } else if (packet.direction === 'error') {
        // Handle error response - reject pending promise immediately
        const pending = pendingResponses.get(packet.command);
        if (pending) {
          clearTimeout(pending.timeout);
          pendingResponses.delete(packet.command);
          pending.reject(new Error(`MSP command ${packet.command} not supported by this board`));
        }
        // Only log unsupported commands once to avoid spam
        if (!unsupportedCommands.has(packet.command)) {
          unsupportedCommands.add(packet.command);
          console.log(`[MSP] Command ${packet.command} not supported by this board`);
        }
      }
    }
  };

  transport.on('data', dataHandler);

  try {
    // Try to get API version - this is the most reliable MSP detection
    const apiPayload = await sendMspRequest(MSP.API_VERSION, 1500);
    const api = deserializeApiVersion(apiPayload);
    sendLog('info', `MSP API version: ${api.apiMajor}.${api.apiMinor}`);

    // If we got here, it's MSP! Get more info
    let fcVariant = '';
    let fcVersion = '';
    let boardId = '';

    try {
      const variantPayload = await sendMspRequest(MSP.FC_VARIANT, 1000);
      const variant = deserializeFcVariant(variantPayload);
      fcVariant = variant.variant;
    } catch { /* ignore */ }

    try {
      const versionPayload = await sendMspRequest(MSP.FC_VERSION, 1000);
      const version = deserializeFcVersion(versionPayload);
      fcVersion = version.version;
    } catch { /* ignore */ }

    try {
      const boardPayload = await sendMspRequest(MSP.BOARD_INFO, 1000);
      const board = deserializeBoardInfo(boardPayload);
      boardId = board.boardId;
    } catch { /* ignore */ }

    sendLog('info', `MSP detected: ${fcVariant} ${fcVersion}`, `Board: ${boardId}`);

    // Track firmware type for protocol decisions
    isInavFirmware = fcVariant === 'INAV';
    inavVersion = isInavFirmware ? fcVersion : '';
    const legacy = isLegacyInav();
    console.log(`[MSP] Firmware: ${fcVariant} ${fcVersion}, isInavFirmware=${isInavFirmware}, isLegacyInav=${legacy}`);

    return {
      fcVariant,
      fcVersion,
      boardId,
      apiVersion: `${api.apiMajor}.${api.apiMinor}`,
    };
  } catch (error) {
    // Not MSP
    sendLog('info', 'MSP detection failed', error instanceof Error ? error.message : 'No response');
    transport.removeListener('data', dataHandler);
    mspParser = null;
    currentTransport = null;
    return null;
  }
}

/**
 * Start MSP telemetry polling and convert to standard telemetry format.
 * This sends data via TELEMETRY_UPDATE - same channel as MAVLink.
 */
export function startMspTelemetry(rateHz: number = 10): void {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
  }

  const intervalMs = Math.round(1000 / rateHz);

  sendLog('info', `MSP telemetry started at ${rateHz}Hz`);

  telemetryInterval = setInterval(async () => {
    if (!currentTransport?.isOpen) {
      return;
    }

    // Skip telemetry polling while config commands are running
    if (configLockCount > 0) {
      return;
    }

    // Skip telemetry polling while CLI mode is active (servo/tuning CLI operations)
    if (servoCliModeActive || tuningCliModeActive) {
      return;
    }

    // BSOD FIX: Skip if previous poll still running to prevent request stacking
    if (telemetryInProgress) {
      telemetrySkipCount++;
      // Only log every N skips to reduce console spam
      if (telemetrySkipCount % TELEMETRY_SKIP_LOG_INTERVAL === 1) {
        console.warn(`[MSP] Skipping telemetry poll - previous still in progress (skipped ${telemetrySkipCount} times)`);
      }
      return;
    }

    telemetryInProgress = true;

    try {
      // BSOD FIX: Add 10ms delay between commands to prevent burst traffic
      const interCommandDelay = () => new Promise(r => setTimeout(r, 10));

      // Get attitude
      try {
        const attitudePayload = await sendMspRequest(MSP.ATTITUDE, 300);
        const attitude = deserializeAttitude(attitudePayload);
        const degrees = attitudeToDegrees(attitude);
        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'attitude',
          data: {
            roll: degrees.rollDeg,
            pitch: degrees.pitchDeg,
            yaw: degrees.yawDeg,
            rollSpeed: 0,
            pitchSpeed: 0,
            yawSpeed: 0,
          },
        });
      } catch { /* ignore */ }

      await interCommandDelay();

      // Get altitude
      try {
        const altitudePayload = await sendMspRequest(MSP.ALTITUDE, 300);
        const altitude = deserializeAltitude(altitudePayload);
        const meters = altitudeToMeters(altitude);
        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'vfrHud',
          data: {
            airspeed: 0,
            groundspeed: 0,
            heading: 0,
            throttle: 0,
            alt: meters.altitudeM,
            climb: meters.varioMs,
          },
        });
      } catch { /* ignore */ }

      await interCommandDelay();

      // Get battery/analog
      try {
        const analogPayload = await sendMspRequest(MSP.ANALOG, 300);
        const analog = deserializeAnalog(analogPayload);
        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'battery',
          data: {
            voltage: analog.voltage / 10, // Convert to volts
            current: analog.current / 100, // Convert to amps
            remaining: -1, // Not available in MSP
          },
        });
      } catch { /* ignore */ }

      await interCommandDelay();

      // Get status for armed state
      try {
        const statusPayload = await sendMspRequest(MSP.STATUS, 300);
        const status = deserializeStatus(statusPayload);
        const armed = isArmed(status.flightModeFlags);
        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'flight',
          data: {
            mode: armed ? 'Armed' : 'Disarmed',
            modeNum: status.flightModeFlags,
            armed: armed,
            isFlying: armed,
          },
        });
      } catch { /* ignore */ }

      await interCommandDelay();

      // Get GPS
      try {
        const gpsPayload = await sendMspRequest(MSP.RAW_GPS, 300);
        const gps = deserializeRawGps(gpsPayload);
        const decimal = gpsToDecimalDegrees(gps);

        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'gps',
          data: {
            fixType: gps.fixType,
            satellites: gps.numSat,
            hdop: 0,
            lat: decimal.latDeg,
            lon: decimal.lonDeg,
            alt: decimal.altM,
          },
        });

        safeSend(IPC_CHANNELS.TELEMETRY_UPDATE, {
          type: 'position',
          data: {
            lat: decimal.latDeg,
            lon: decimal.lonDeg,
            alt: decimal.altM,
            relativeAlt: decimal.altM,
            vx: 0,
            vy: 0,
            vz: 0,
          },
        });
      } catch { /* ignore */ }
    } catch (error) {
      // Only log once per error type to avoid spam
      console.error('[MSP] Telemetry poll error:', error);
    } finally {
      // BSOD FIX: Always clear the in-progress flag
      telemetryInProgress = false;
    }
  }, intervalMs);
}

/**
 * Stop MSP telemetry polling.
 * NOTE: Does NOT clear transport/parser - those stay valid for config commands.
 * Call cleanupMspConnection() on actual disconnect to clear everything.
 */
export function stopMspTelemetry(): void {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
    sendLog('info', 'MSP telemetry stopped');
  }

  // Reset telemetry-specific state
  telemetryInProgress = false;
  telemetrySkipCount = 0;
}

/**
 * Full cleanup of MSP connection state.
 * Call this on actual disconnect, NOT when just stopping telemetry.
 */
export function cleanupMspConnection(): void {
  // Stop telemetry first
  stopMspTelemetry();

  // Clean up CLI handlers
  cleanupCli();

  // Clear pending responses
  for (const [, pending] of pendingResponses) {
    clearTimeout(pending.timeout);
  }
  pendingResponses.clear();
  unsupportedCommands.clear();

  // Reset mutex, config lock, and RC poll state
  requestMutex = Promise.resolve();
  configLockCount = 0;
  rcPollInFlight = false;

  // Reset CLI fallback states
  servoCliModeActive = false;
  tuningCliModeActive = false;
  pendingMixerType = null;
  usesCliServoFallback = false;
  servoConfigModeProbed = false;
  cliResponseListener = null;
  cliResponse = '';
  tuningCliListener = null;
  tuningCliResponse = '';

  // Reset firmware/platform detection state
  isInavFirmware = false;
  inavVersion = '';
  currentPlatformType = 0;

  // Clear cached PID state (used for read-modify-write pattern)
  cachedInavPid = null;

  // Clear settings cache (generic settings API)
  clearSettingsCache();

  // Clear transport and parser
  mspParser = null;
  currentTransport = null;
}

// =============================================================================
// MSP Config Commands
// =============================================================================

async function getPid(): Promise<MSPPid | null> {
  // Guard: return null if not connected (prevents errors after disconnect)
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      // Increased timeout for slow F3 boards with old firmware (iNav 2.0.0)
      console.log('[MSP] Reading PIDs...');
      sendLog('info', 'Reading PIDs from FC...');

      // iNav 7.0+ requires MSP2_INAV_PID (0x2030) - legacy MSP_PID was removed
      if (usesMsp2Pid()) {
        console.log('[MSP] Using MSP2_INAV_PID (0x2030) for modern iNav');
        const payload = await sendMspV2Request(MSP2.INAV_PID, 2000);
        console.log('[MSP] INAV_PID response:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
        const inavPid = deserializeInavPid(payload);
        // Cache full iNav PID state for read-modify-write pattern
        // iNav requires ALL 11 PID controllers (44 bytes) when writing
        cachedInavPid = inavPid;
        // Convert to legacy format for UI compatibility
        const pid = inavPidToPid(inavPid);
        console.log('[MSP] PIDs parsed (MSP2):', JSON.stringify(pid));
        sendLog('info', `PIDs loaded: Roll P=${pid.roll.p} I=${pid.roll.i} D=${pid.roll.d}`);
        return pid;
      }

      // Legacy MSP_PID for older firmwares
      const payload = await sendMspRequest(MSP.PID, 2000);
      console.log('[MSP] PID response:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const pid = deserializePid(payload);
      console.log('[MSP] PIDs parsed:', JSON.stringify(pid));
      sendLog('info', `PIDs loaded: Roll P=${pid.roll.p} I=${pid.roll.i} D=${pid.roll.d}`);
      return pid;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get PID failed:', msg);
      sendLog('error', 'Get PID failed', msg);
      return null;
    }
  });
}

async function setPid(pid: MSPPid): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setPid: transport not open');
    sendLog('error', 'Cannot set PIDs - not connected');
    return false;
  }

  // iNav 7.0+ requires MSP2_INAV_SET_PID (0x2031)
  // IMPORTANT: iNav requires ALL 11 PID controllers (44 bytes) when writing
  // We must read current PIDs, merge user changes, then write all 44 bytes
  if (usesMsp2Pid()) {
    return withConfigLock(async () => {
      try {
        // If we don't have cached PIDs, read them first
        if (!cachedInavPid) {
          console.log('[MSP] No cached PIDs, reading current values first...');
          sendLog('info', 'Reading current PIDs before saving...');
          const payload = await sendMspV2Request(MSP2.INAV_PID, 2000);
          cachedInavPid = deserializeInavPid(payload);
          console.log('[MSP] Cached PIDs from FC:', payload.length, 'bytes');
        }

        // Convert user's changes to partial iNav format (only roll, pitch, yaw, level)
        const partialUpdates = pidToInavPid(pid);
        // Merge user changes with full cached state to preserve navigation PIDs
        const fullPid = mergeInavPid(cachedInavPid, partialUpdates);
        // Update cache with merged values
        cachedInavPid = fullPid;

        const payload = serializeInavPid(fullPid);
        console.log('[MSP] SET_INAV_PID payload:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
        sendLog('info', `Sending PIDs via MSP2 (${payload.length} bytes)...`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_PID, payload, 2000);
        console.log('[MSP] SET_INAV_PID success');
        sendLog('info', 'PIDs sent to FC (MSP2)');
        return true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] SET_INAV_PID failed:', msg);
        sendLog('error', 'Failed to set PIDs (MSP2)', msg);
        return false;
      }
    });
  }

  // Try legacy MSP for older firmware
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializePid(pid);
      console.log('[MSP] SET_PID payload:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
      sendLog('info', `Sending PIDs (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_PID, payload, 2000);
      console.log('[MSP] SET_PID success');
      sendLog('info', 'PIDs sent to FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_PID failed:', msg);
      // Check if MSP not supported - will try CLI fallback
      if (msg.includes('not supported')) {
        sendLog('warn', 'MSP SET_PID not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', 'Failed to set PIDs', msg);
      return false;
    }
  });

  // If MSP worked or definitively failed, return result
  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback for old iNav that doesn't support MSP_SET_PID
  return await setPidViaCli(pid);
}

/**
 * CLI fallback for setting PIDs on old iNav that doesn't support MSP 202
 *
 * iNav uses different parameter names based on platform type:
 * - Multirotor: mc_p_roll, mc_i_roll, mc_d_roll, etc.
 * - Fixed-wing: fw_p_roll, fw_i_roll, fw_ff_roll (note: ff = feedforward, not d!)
 *
 * NOTE: Does NOT call 'save' - caller must call saveEeprom() after all changes
 */
async function setPidViaCli(pid: MSPPid): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    // Enter CLI mode if not already in it (like servo pattern)
    if (!tuningCliModeActive) {
      tuningCliModeActive = true;
      stopMspTelemetry();

      // Cancel all pending MSP responses (they will never complete in CLI mode)
      for (const [, pending] of pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      pendingResponses.clear();

      // Wait for any in-flight data to settle
      await new Promise(r => setTimeout(r, 100));

      // Add listener to capture CLI responses
      tuningCliResponse = '';
      tuningCliListener = (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        tuningCliResponse += text;
      };
      currentTransport.on('data', tuningCliListener);

      console.log('[MSP] Entering CLI mode for tuning...');
      sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');

      // Send '#' to enter CLI mode
      await currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 1000)); // Wait longer for CLI to activate

      // Validate CLI entry
      if (tuningCliResponse.includes('CLI') || tuningCliResponse.includes('#')) {
        console.log('[MSP] CLI mode confirmed');
      } else {
        console.warn('[MSP] CLI mode entry not confirmed, response:', tuningCliResponse.slice(0, 100));
      }
    }

    // Build CLI commands based on platform type
    // 0 = multirotor (mc_*), 1+ = fixed-wing (fw_*)
    const isFixedWing = currentPlatformType === 1;
    const prefix = isFixedWing ? 'fw' : 'mc';
    // Fixed-wing uses 'ff' (feedforward) for the third term, multirotor uses 'd' (derivative)
    const dTerm = isFixedWing ? 'ff' : 'd';

    console.log(`[MSP] Setting PIDs for ${isFixedWing ? 'fixed-wing' : 'multirotor'} (prefix=${prefix}, dTerm=${dTerm})`);

    const commands = [
      `set ${prefix}_p_roll = ${pid.roll.p}`,
      `set ${prefix}_i_roll = ${pid.roll.i}`,
      `set ${prefix}_${dTerm}_roll = ${pid.roll.d}`,
      `set ${prefix}_p_pitch = ${pid.pitch.p}`,
      `set ${prefix}_i_pitch = ${pid.pitch.i}`,
      `set ${prefix}_${dTerm}_pitch = ${pid.pitch.d}`,
      `set ${prefix}_p_yaw = ${pid.yaw.p}`,
      `set ${prefix}_i_yaw = ${pid.yaw.i}`,
      `set ${prefix}_${dTerm}_yaw = ${pid.yaw.d}`,
    ];

    for (const cmd of commands) {
      tuningCliResponse = ''; // Clear before each command
      console.log(`[MSP] CLI: ${cmd}`);
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 300)); // Wait longer for response

      // Check for errors
      if (tuningCliResponse.includes('Invalid') || tuningCliResponse.includes('error')) {
        console.error('[MSP] CLI command failed:', tuningCliResponse);
        sendLog('error', 'CLI command failed', cmd);
      }
    }

    sendLog('info', 'PIDs set via CLI', `${isFixedWing ? 'Fixed-wing' : 'Multirotor'} - call save to persist`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI PID set failed:', error);
    sendLog('error', 'CLI PID set failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function getRcTuning(): Promise<MSPRcTuning | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    // Try iNav MSP2 RATE_PROFILE first (0x2007) - this is what iNav configurator uses!
    try {
      console.log('[MSP] Trying INAV_RATE_PROFILE (0x2007)...');
      const payload = await sendMspV2Request(MSP2.INAV_RATE_PROFILE, 2000);
      console.log('[MSP] INAV_RATE_PROFILE response:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
      const inavProfile = deserializeInavRateProfile(payload);
      console.log('[MSP] INAV_RATE_PROFILE parsed:', JSON.stringify(inavProfile));
      const rcTuning = inavRateProfileToRcTuning(inavProfile);
      console.log('[MSP] Converted to RC_TUNING:', JSON.stringify(rcTuning));
      sendLog('info', `Rates loaded (iNav): roll=${rcTuning.rollRate} pitch=${rcTuning.pitchRate} yaw=${rcTuning.yawRate}`);
      return rcTuning;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.log('[MSP] INAV_RATE_PROFILE failed:', msg, '- trying MSP_RC_TUNING...');
    }

    // Fall back to standard MSP_RC_TUNING (111)
    // Use iNav-specific deserializer if connected to iNav (rates need *10)
    try {
      console.log(`[MSP] Reading RC_TUNING (111) for ${isInavFirmware ? 'iNav' : 'Betaflight'}...`);
      sendLog('info', 'Reading rates from FC...');
      const payload = await sendMspRequest(MSP.RC_TUNING, 2000);
      console.log('[MSP] RC_TUNING response:', payload.length, 'bytes:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));

      // iNav and Betaflight have different formats for MSP_RC_TUNING
      // iNav: 11 bytes, rates stored as /10
      // Betaflight: 17+ bytes, rates stored directly
      const rcTuning = isInavFirmware
        ? deserializeRcTuningInav(payload)
        : deserializeRcTuning(payload);

      console.log('[MSP] RC_TUNING parsed:', JSON.stringify(rcTuning));
      sendLog('info', `Rates loaded: roll=${rcTuning.rollRate} pitch=${rcTuning.pitchRate} yaw=${rcTuning.yawRate}`);
      return rcTuning;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get RC_TUNING failed:', msg);
      sendLog('error', 'Get rates failed', msg);
      return null;
    }
  });
}

async function setRcTuning(rcTuning: MSPRcTuning): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setRcTuning: transport not open');
    sendLog('error', 'Cannot set rates - not connected');
    return false;
  }

  // If already in CLI mode (from PID fallback), use CLI directly
  if (tuningCliModeActive) {
    console.log('[MSP] Already in CLI mode, using CLI for rates');
    return await setRcTuningViaCli(rcTuning);
  }

  // For iNav: use MSP2 INAV_SET_RATE_PROFILE (0x2008) - same format as read (0x2007)
  // This ensures read/write use consistent byte layout
  if (isInavFirmware) {
    const msp2Success = await withConfigLock(async () => {
      try {
        // Convert rcTuning to iNav rate profile format
        const inavProfile = rcTuningToInavRateProfile(rcTuning);
        const payload = serializeInavRateProfile(inavProfile);

        console.log('[MSP] INAV_SET_RATE_PROFILE (0x2008) payload:', payload.length, 'bytes');
        console.log('[MSP] Payload hex:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
        console.log('[MSP] iNav profile: rollRate=%d (raw=%d), pitchRate=%d (raw=%d), yawRate=%d (raw=%d), rcExpo=%d',
          inavProfile.rollRate, inavProfile.rollRate / 10,
          inavProfile.pitchRate, inavProfile.pitchRate / 10,
          inavProfile.yawRate, inavProfile.yawRate / 10,
          inavProfile.rcExpo);

        sendLog('info', `Sending rates via MSP2 0x2008 (${payload.length} bytes)...`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_RATE_PROFILE, payload, 2000);
        console.log('[MSP] INAV_SET_RATE_PROFILE success');
        sendLog('info', 'Rates sent to FC (iNav MSP2)');
        return true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] INAV_SET_RATE_PROFILE failed:', msg);
        if (msg.includes('not supported')) {
          sendLog('warn', 'MSP2 not supported, trying MSP1...');
          return null; // Signal to try MSP1 fallback
        }
        sendLog('error', 'Failed to set rates', msg);
        return false;
      }
    });

    if (msp2Success !== null) {
      return msp2Success;
    }

    // Fall back to MSP_SET_RC_TUNING (204) for older iNav
    console.log('[MSP] Falling back to MSP_SET_RC_TUNING (204) for iNav...');
  }

  // For Betaflight (or iNav MSP2 fallback): use MSP_SET_RC_TUNING (204)
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = isInavFirmware
        ? serializeRcTuningInav(rcTuning)
        : serializeRcTuning(rcTuning);

      console.log(`[MSP] SET_RC_TUNING (${isInavFirmware ? 'iNav' : 'Betaflight'}) payload:`, payload.length, 'bytes');
      console.log('[MSP] Payload hex:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));

      sendLog('info', `Sending rates via MSP 204 (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_RC_TUNING, payload, 2000);
      console.log('[MSP] SET_RC_TUNING success');
      sendLog('info', 'Rates sent to FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_RC_TUNING failed:', msg);
      if (msg.includes('not supported')) {
        sendLog('warn', 'MSP not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', 'Failed to set rates', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback for very old firmware that doesn't support MSP 204
  return await setRcTuningViaCli(rcTuning);
}

/**
 * CLI fallback for setting rates on old iNav that doesn't support MSP 204
 * Uses: set rc_rate = X, set roll_rate = X, etc.
 *
 * NOTE: Does NOT call 'save' - caller must call saveEeprom() after all changes
 */
async function setRcTuningViaCli(rcTuning: MSPRcTuning): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    // Enter CLI mode if not already in it (should already be from setPidViaCli)
    if (!tuningCliModeActive) {
      tuningCliModeActive = true;
      stopMspTelemetry();

      // Cancel pending MSP responses
      for (const [, pending] of pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      pendingResponses.clear();

      await new Promise(r => setTimeout(r, 100));

      // Add listener
      tuningCliResponse = '';
      tuningCliListener = (data: Uint8Array) => {
        tuningCliResponse += new TextDecoder().decode(data);
      };
      currentTransport.on('data', tuningCliListener);

      console.log('[MSP] Entering CLI mode for tuning...');
      sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');

      await currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 1000));
    }

    // Set rate values via CLI (works for both modern and legacy iNav)
    // IMPORTANT: Old iNav 2.0.0 uses combined rollPitchRate - both roll_rate and pitch_rate
    // CLI commands may write to the same field! Use rollPitchRate as canonical value.
    // Range: 6-180 for old iNav

    // Get rate values - prefer individual rates, fall back to combined rollPitchRate
    // UI sends rates in °/s (e.g., 70, 200, 360)
    const rollRateDegSec = rcTuning.rollRate || rcTuning.rollPitchRate || 70;
    const pitchRateDegSec = rcTuning.pitchRate || rcTuning.rollPitchRate || 70;
    const yawRateDegSec = rcTuning.yawRate || 70;

    // IMPORTANT: iNav CLI stores rates as value/10 (same as MSP2 storage format)
    // So 70°/s should be sent as `roll_rate = 7`, 200°/s as `roll_rate = 20`
    // Clamp to valid range: 4-100 (which is 40-1000°/s)
    const rollRateStored = Math.max(4, Math.min(100, Math.round(rollRateDegSec / 10)));
    const pitchRateStored = Math.max(4, Math.min(100, Math.round(pitchRateDegSec / 10)));
    const yawRateStored = Math.max(4, Math.min(100, Math.round(yawRateDegSec / 10)));

    // CLI commands for iNav rates
    // Note: Old iNav 2.0.0 may use different parameter names!
    // We try multiple variations and log which ones work
    const commands: Array<{ cmd: string; critical?: boolean }> = [
      // Expo (percentage 0-100)
      { cmd: `set rc_expo = ${rcTuning.rcExpo || 0}` },
      { cmd: `set rc_yaw_expo = ${rcTuning.rcYawExpo || 0}` },
      // Max rates - try multiple naming conventions for old iNav
      // iNav stores rates as value/10 internally (so 7 = 70°/s)
      // But CLI might expect °/s directly - we'll try both
      { cmd: `set roll_rate = ${rollRateStored}`, critical: true },
      { cmd: `set pitch_rate = ${pitchRateStored}`, critical: true },
      { cmd: `set yaw_rate = ${yawRateStored}` },
      // Throttle settings
      { cmd: `set thr_mid = ${rcTuning.throttleMid || 50}` },
      { cmd: `set thr_expo = ${rcTuning.throttleExpo || 0}` },
    ];

    // Alternative rate commands to try if the primary ones fail
    const altRateCommands = [
      // Try with full °/s values (some old firmware might not divide by 10)
      { cmd: `set roll_rate = ${rollRateDegSec}`, name: 'roll_rate (full)' },
      { cmd: `set pitch_rate = ${pitchRateDegSec}`, name: 'pitch_rate (full)' },
      // Try alternative names used in older firmware
      { cmd: `set mc_p_roll = ${rollRateStored}`, name: 'mc_p_roll' },
      { cmd: `set mc_p_pitch = ${pitchRateStored}`, name: 'mc_p_pitch' },
      { cmd: `set fw_p_roll = ${rollRateStored}`, name: 'fw_p_roll' },
      { cmd: `set fw_p_pitch = ${pitchRateStored}`, name: 'fw_p_pitch' },
    ];

    console.log(`[MSP] CLI rates: roll=${rollRateStored} (${rollRateDegSec}°/s), pitch=${pitchRateStored} (${pitchRateDegSec}°/s), yaw=${yawRateStored} (${yawRateDegSec}°/s)`);
    console.log(`[MSP] CLI rcTuning input: rollRate=${rcTuning.rollRate}, pitchRate=${rcTuning.pitchRate}, rollPitchRate=${rcTuning.rollPitchRate}`);

    // Track which critical commands failed so we can try alternatives
    let rollRateFailed = false;
    let pitchRateFailed = false;

    for (const { cmd, critical } of commands) {
      tuningCliResponse = '';
      console.log(`[MSP] CLI: ${cmd}`);
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 300));

      // Log response for debugging
      const response = tuningCliResponse.trim();
      if (response && !response.endsWith('#')) {
        console.log(`[MSP] CLI response: ${response.split('\n')[0]}`);
      }
      const failed = tuningCliResponse.includes('Invalid') || tuningCliResponse.includes('error');
      if (failed) {
        console.warn('[MSP] CLI command FAILED:', cmd);
        sendLog('warn', 'CLI command failed', `${cmd}: ${response.split('\n')[0]}`);
        if (critical && cmd.includes('roll_rate')) rollRateFailed = true;
        if (critical && cmd.includes('pitch_rate')) pitchRateFailed = true;
      }
    }

    // If roll/pitch rate commands failed, try alternatives
    if (rollRateFailed || pitchRateFailed) {
      console.log('[MSP] Primary rate commands failed, trying alternatives...');
      sendLog('info', 'Trying alternative CLI commands...');

      for (const { cmd, name } of altRateCommands) {
        // Skip if we only need to fix one axis
        if (!rollRateFailed && cmd.includes('roll')) continue;
        if (!pitchRateFailed && cmd.includes('pitch')) continue;

        tuningCliResponse = '';
        console.log(`[MSP] CLI alt (${name}): ${cmd}`);
        await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
        await new Promise(r => setTimeout(r, 300));

        const response = tuningCliResponse.trim();
        const failed = tuningCliResponse.includes('Invalid') || tuningCliResponse.includes('error');
        if (!failed) {
          console.log(`[MSP] CLI alt SUCCESS: ${name}`);
          sendLog('info', `Alternative worked: ${name}`);
          if (cmd.includes('roll')) rollRateFailed = false;
          if (cmd.includes('pitch')) pitchRateFailed = false;
        } else {
          console.log(`[MSP] CLI alt failed: ${name} - ${response.split('\n')[0]}`);
        }
      }
    }

    if (rollRateFailed || pitchRateFailed) {
      sendLog('warn', 'Some rate commands failed', 'Check CLI parameter names for your firmware');
    } else {
      sendLog('info', 'Rates set via CLI', 'Call save to persist');
    }
    return true;
  } catch (error) {
    console.error('[MSP] CLI rates set failed:', error);
    sendLog('error', 'CLI rates set failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function getModeRanges(): Promise<MSPModeRange[] | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      console.log('[MSP] Reading MODE_RANGES...');
      sendLog('info', 'Reading modes from FC...');
      const payload = await sendMspRequest(MSP.MODE_RANGES, 2000);
      console.log('[MSP] MODE_RANGES response:', payload.length, 'bytes');
      const modes = deserializeModeRanges(payload);
      // Log active modes (non-empty ranges)
      const activeModes = modes.filter(m => m.rangeEnd > m.rangeStart);
      console.log('[MSP] Modes parsed:', modes.length, 'total,', activeModes.length, 'active');
      activeModes.forEach((m, i) => console.log(`  [${i}] boxId=${m.boxId} aux=${m.auxChannel} range=${m.rangeStart}-${m.rangeEnd}`));
      sendLog('info', `Modes loaded: ${activeModes.length} active`);
      return modes;
    } catch (error) {
      // Only log once, don't spam console
      if (!unsupportedCommands.has(MSP.MODE_RANGES)) {
        unsupportedCommands.add(MSP.MODE_RANGES);
        console.log('[MSP] MODE_RANGES not available on this board');
        sendLog('error', 'Mode ranges not available on this board');
      }
      return null;
    }
  });
}

async function setModeRange(index: number, mode: MSPModeRange): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setModeRange: transport not open');
    sendLog('error', 'Cannot set mode - not connected');
    return false;
  }

  // If already in CLI mode (from PID/Rates fallback), use CLI directly
  if (tuningCliModeActive) {
    console.log('[MSP] Already in CLI mode, using CLI for mode range');
    return await setModeRangeViaCli(index, mode);
  }

  // Try MSP first
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeModeRange(index, mode);
      // Only log non-empty ranges to reduce noise
      if (mode.rangeEnd > mode.rangeStart) {
        console.log(`[MSP] SET_MODE_RANGE[${index}]: boxId=${mode.boxId} aux=${mode.auxChannel} range=${mode.rangeStart}-${mode.rangeEnd}`);
        console.log('[MSP] SET_MODE_RANGE payload:', Array.from(payload).map(b => b.toString(16).padStart(2, '0')).join(' '));
        sendLog('info', `Setting mode ${index}: boxId=${mode.boxId} aux=${mode.auxChannel} range=${mode.rangeStart}-${mode.rangeEnd}`);
      }
      await sendMspRequestWithPayload(MSP.SET_MODE_RANGE, payload, 2000);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MSP] SET_MODE_RANGE[${index}] failed:`, msg);
      if (msg.includes('not supported')) {
        sendLog('warn', 'MSP SET_MODE_RANGE not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', `Failed to set mode ${index}`, msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback
  return await setModeRangeViaCli(index, mode);
}

/**
 * CLI fallback for setting mode range on old iNav
 * Uses: aux <index> <boxId> <channel> <start> <end> <logic>
 *
 * NOTE: Does NOT call 'save' - caller must call saveEeprom() after all changes
 */
async function setModeRangeViaCli(index: number, mode: MSPModeRange): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    // Enter CLI mode if not already in it (like servo pattern)
    if (!tuningCliModeActive) {
      tuningCliModeActive = true;
      stopMspTelemetry();

      console.log('[MSP] Entering CLI mode for tuning...');
      sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');

      await currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 500));
    }

    // iNav CLI aux command: aux <index> <boxId> <channel> <start> <end> <logic>
    // Channel is 0-based (AUX1 = 0), range is in steps of 25 from 900
    // Convert PWM values to step values: (pwm - 900) / 25
    const startStep = Math.round((mode.rangeStart - 900) / 25);
    const endStep = Math.round((mode.rangeEnd - 900) / 25);
    const cmd = `aux ${index} ${mode.boxId} ${mode.auxChannel} ${startStep} ${endStep} 0`;

    console.log(`[MSP] CLI: ${cmd}`);
    await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
    await new Promise(r => setTimeout(r, 100));

    return true;
  } catch (error) {
    console.error('[MSP] CLI mode set failed:', error);
    return false;
  }
}

async function getFeatures(): Promise<number | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.FEATURE_CONFIG, 1000);
      const config = deserializeFeatureConfig(payload);
      return config.features;
    } catch (error) {
      // Only log once, don't spam console
      if (!unsupportedCommands.has(MSP.FEATURE_CONFIG)) {
        unsupportedCommands.add(MSP.FEATURE_CONFIG);
        console.log('[MSP] Feature config not available on this board');
      }
      return null;
    }
  });
}

/**
 * Get iNav mixer configuration using the proper MSP2 command.
 * This is the CORRECT way to detect platform type on iNav boards.
 *
 * Returns platformType: 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
 *
 * Falls back to legacy MSP_MIXER_CONFIG for old iNav 2.0.0.
 */
async function getInavMixerConfig(): Promise<MSPInavMixerConfig | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    // Try MSP2 first (iNav 2.5+)
    try {
      const payload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
      const config = deserializeInavMixerConfig(payload);

      // Cache platform type for CLI commands
      currentPlatformType = config.platformType;

      const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
      const platformName = platformNames[config.platformType] ?? `UNKNOWN(${config.platformType})`;
      console.log(`[MSP] iNav Mixer config: platformType=${config.platformType} (${platformName}), mixerPreset=${config.appliedMixerPreset}`);
      sendLog('info', `Platform: ${platformName}`, `Mixer: ${config.appliedMixerPreset}, Servos: ${config.numberOfServos}`);

      return config;
    } catch (msp2Error) {
      // MSP2 failed - try legacy MSP_MIXER_CONFIG for old iNav
      const msg = msp2Error instanceof Error ? msp2Error.message : String(msp2Error);
      if (msg.includes('not supported')) {
        console.log('[MSP] MSP2 mixer config not supported, trying legacy MSP...');
      } else {
        console.warn('[MSP] MSP2 mixer config failed:', msg);
      }

      try {
        // Use legacy MSP_MIXER_CONFIG (works on iNav 2.0.0)
        const payload = await sendMspRequest(MSP.MIXER_CONFIG, 2000);
        const legacyConfig = deserializeMixerConfig(payload);

        // Map legacy mixer type to platform type
        // 8=FLYING_WING, 14=AIRPLANE, 3=QUADX, etc.
        const isMultirotor = isMultirotorMixer(legacyConfig.mixer);
        const platformType = isMultirotor ? 0 : 1; // 0=multirotor, 1=airplane

        // Cache platform type for CLI commands
        currentPlatformType = platformType;

        const platformNames = ['MULTIROTOR', 'AIRPLANE'];
        console.log(`[MSP] Legacy mixer: type=${legacyConfig.mixer}, platformType=${platformType} (${platformNames[platformType]})`);
        sendLog('info', `Platform: ${platformNames[platformType]} (legacy)`, `Mixer type: ${legacyConfig.mixer}`);

        // Return a partial config with the mixer type as appliedMixerPreset
        return {
          yawMotorDirection: 1,
          yawJumpPreventionLimit: 200,
          motorStopOnLow: 0,
          platformType,
          hasFlaps: 0,
          appliedMixerPreset: legacyConfig.mixer, // This is the key - mixer type for auto-detection
          numberOfMotors: 0,
          numberOfServos: 0,
        } as MSPInavMixerConfig;
      } catch (legacyError) {
        console.error('[MSP] Legacy mixer config also failed:', legacyError);
        return null;
      }
    }
  });
}

/**
 * Auto-configure SITL platform type based on profile name.
 * Called after MSP connect when SITL is detected.
 *
 * @param profileName - SITL profile name (e.g., "Airplane", "Quadcopter")
 * @returns true if platform was changed, false if no change needed
 */
export async function autoConfigureSitlPlatform(profileName: string | null): Promise<boolean> {
  // Skip if user manually changed platform (don't revert their change)
  if (skipSitlAutoConfig) {
    console.log('[MSP] SITL auto-config: skipped (user manually changed platform)');
    return false;
  }

  if (!profileName) {
    console.log('[MSP] SITL auto-config: no profile name');
    return false;
  }

  console.log(`[MSP] SITL auto-config: checking platform for profile "${profileName}"`);

  // Determine expected platform from profile name
  const profileLower = profileName.toLowerCase();
  let expectedPlatform: number | null = null;

  if (profileLower.includes('airplane') || profileLower.includes('plane') || profileLower.includes('wing')) {
    expectedPlatform = INAV_PLATFORM_TYPE.AIRPLANE;
  } else if (profileLower.includes('quad') || profileLower.includes('copter') || profileLower.includes('multi')) {
    expectedPlatform = INAV_PLATFORM_TYPE.MULTIROTOR;
  } else if (profileLower.includes('tri')) {
    expectedPlatform = INAV_PLATFORM_TYPE.TRICOPTER;
  } else if (profileLower.includes('heli')) {
    expectedPlatform = INAV_PLATFORM_TYPE.HELICOPTER;
  }

  if (expectedPlatform === null) {
    console.log('[MSP] SITL auto-config: profile name does not indicate a specific platform');
    return false;
  }

  // Get current platform
  const mixerConfig = await getInavMixerConfig();
  if (!mixerConfig) {
    console.log('[MSP] SITL auto-config: could not read mixer config');
    return false;
  }

  const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
  console.log(`[MSP] SITL auto-config: current platform=${platformNames[mixerConfig.platformType]}, expected=${platformNames[expectedPlatform]}`);

  if (mixerConfig.platformType === expectedPlatform) {
    console.log('[MSP] SITL auto-config: platform already correct');
    return false;
  }

  // Need to change platform
  console.log(`[MSP] SITL auto-config: changing platform from ${platformNames[mixerConfig.platformType]} to ${platformNames[expectedPlatform]}`);
  sendLog('info', `Auto-configuring SITL as ${platformNames[expectedPlatform]}`, `Profile: ${profileName}`);

  // Pass isAutoConfig=true so the skip flag isn't set
  const success = await setInavPlatformType(expectedPlatform, undefined, true);
  if (success) {
    // Save to EEPROM
    await saveEeprom();
    // Small delay to ensure EEPROM write completes before reboot
    await new Promise(r => setTimeout(r, 200));
    // Reboot to apply new platform type (MSP.EEPROM_WRITE only saves, doesn't reboot)
    // Fire-and-forget - board reboots immediately and closes connection
    reboot().catch(() => {
      // Ignore errors - board reboots and connection closes, that's expected
    });
    sendLog('info', 'SITL platform configured', 'Board will reboot - reconnect in a few seconds');
    return true;
  }

  console.error('[MSP] SITL auto-config: failed to set platform type');
  return false;
}

/**
 * Get the vehicle type string for display in connection panel.
 * For iNav: MULTIROTOR, AIRPLANE, HELICOPTER, TRICOPTER
 * For Betaflight: Multirotor, Fixed-wing (based on mixer type)
 *
 * @param fcVariant - "INAV", "BTFL", "CLFL"
 * @returns Vehicle type string or null if not detected
 */
export async function getMspVehicleType(fcVariant: string): Promise<string | null> {
  console.log(`[MSP] getMspVehicleType called for ${fcVariant}`);
  if (!currentTransport?.isOpen) {
    console.log('[MSP] getMspVehicleType: transport not open');
    return null;
  }

  const INAV_PLATFORM_NAMES = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

  if (fcVariant === 'INAV') {
    // iNav: use MSP2_INAV_MIXER for accurate platform type
    const mixerConfig = await getInavMixerConfig();
    if (mixerConfig) {
      const name = INAV_PLATFORM_NAMES[mixerConfig.platformType] ?? 'Unknown';
      console.log(`[MSP] Vehicle type for iNav: ${name} (platformType=${mixerConfig.platformType})`);
      return name;
    }
  } else {
    // Betaflight/Cleanflight: use legacy mixer config
    const mixerConfig = await getMixerConfig();
    if (mixerConfig) {
      const name = mixerConfig.isMultirotor ? 'Multirotor' : 'Fixed-wing';
      console.log(`[MSP] Vehicle type for ${fcVariant}: ${name} (mixer=${mixerConfig.mixer})`);
      return name;
    }
  }

  return null;
}

/**
 * Get mixer configuration (legacy, for non-iNav boards)
 */
async function getMixerConfig(): Promise<{ mixer: number; isMultirotor: boolean } | null> {
  // Guard: return null if not connected or CLI mode active
  if (!currentTransport?.isOpen) return null;
  if (servoCliModeActive || tuningCliModeActive) return null; // Silently skip during CLI ops

  return withConfigLock(async () => {
    try {
      // Increased timeout for slow F3 boards
      const payload = await sendMspRequest(MSP.MIXER_CONFIG, 2000);
      const config = deserializeMixerConfig(payload);
      const isMultirotor = isMultirotorMixer(config.mixer);

      console.log(`[MSP] Mixer config: type=${config.mixer} (legacy - may be stale on iNav 2.0.0+)`);
      // NOTE: On iNav 2.0.0+, this legacy mixer type is STALE and doesn't reflect actual platform.
      // MSP2 INAV_MIXER platformType is the authoritative source for platform detection.
      // Don't log misleading "Multirotor/Fixed-wing mode" here - let the store handle platform detection.

      return {
        mixer: config.mixer,
        isMultirotor,
      };
    } catch (error) {
      console.error('[MSP] Get Mixer Config failed:', error);
      return null;
    }
  });
}

/**
 * Set iNav platform type using the proper MSP2 command.
 * platformType: 0=multirotor, 1=airplane, 2=helicopter, 3=tricopter
 * mixerType: Optional - specific mixer type for CLI fallback (e.g., 8=FLYING_WING, 14=AIRPLANE)
 *
 * For iNav 2.0.0 and older: MSP2 may not be supported, uses CLI fallback
 * NOTE: For legacy iNav, we store the mixerType as pendingMixerType and apply it
 * during saveEepromViaCli(), since the mixer must be set via CLI to persist.
 * BSOD Prevention: Uses conservative delays and withConfigLock.
 */
export async function setInavPlatformType(platformType: number, mixerType?: number, isAutoConfig = false): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setInavPlatformType: transport not open');
    return false;
  }

  // Skip SITL auto-config after USER manually changes platform (not auto-config)
  // This prevents the auto-config from reverting user's manual change on reconnect
  if (!isAutoConfig) {
    skipSitlAutoConfig = true;
    console.log('[MSP] setInavPlatformType: User initiated platform change, disabling auto-config');
  }

  const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
  const platformName = platformNames[platformType] ?? `UNKNOWN`;

  // For legacy iNav, ALWAYS store the mixerType for CLI application later
  // MSP2 only sets platformType, but the actual mixer must be set via CLI
  if (isLegacyInav() && mixerType !== undefined) {
    console.log(`[MSP] Legacy iNav detected - storing mixer ${mixerType} for CLI save`);
    pendingMixerType = mixerType;
    // Don't set platformType via MSP2 either - let CLI handle everything
    sendLog('info', 'Legacy iNav', 'Mixer will be set when saving');
    return true; // Success - mixer will be applied during save
  }

  // Try MSP2 first (inside config lock)
  let msp2Success = false;
  try {
    msp2Success = await withConfigLock(async () => {
      sendLog('info', `Setting platform to: ${platformName}`);

      // First, read current config
      let currentConfig: MSPInavMixerConfig | null = null;
      try {
        const payload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
        currentConfig = deserializeInavMixerConfig(payload);
        console.log(`[MSP] Current platform: ${currentConfig.platformType}`);
      } catch (readErr) {
        console.warn('[MSP] Could not read current iNav mixer config:', readErr);
        return false; // Will trigger CLI fallback below
      }

      if (!currentConfig) {
        return false; // Will trigger CLI fallback below
      }

      // Update just the platformType and send back
      const newConfig: MSPInavMixerConfig = {
        ...currentConfig,
        platformType,
      };

      try {
        const payload = serializeInavMixerConfig(newConfig);
        console.log(`[MSP] Sending MSP2_INAV_SET_MIXER (0x2011) with platformType=${platformType}`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_MIXER, payload, 2000);
      } catch (writeErr) {
        console.warn('[MSP] MSP2 write failed:', writeErr);
        return false; // Will trigger CLI fallback below
      }

      // BSOD Prevention: Small delay before verification
      await new Promise(r => setTimeout(r, 100));

      // Verify
      try {
        const verifyPayload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
        const verified = deserializeInavMixerConfig(verifyPayload);
        console.log(`[MSP] Platform after change: ${verified.platformType} (expected: ${platformType})`);

        if (verified.platformType !== platformType) {
          sendLog('warn', 'MSP2 write did not change platform',
            `Expected ${platformName}, got ${platformNames[verified.platformType] ?? verified.platformType}`);
          return false; // Will trigger CLI fallback below
        }

        sendLog('info', `Platform verified: ${platformName}`, 'Save to EEPROM and reboot required');
        return true;
      } catch (verifyErr) {
        console.warn('[MSP] Could not verify platform change:', verifyErr);
        // Assume MSP2 worked if we got here without errors
        return true;
      }
    });
  } catch (error) {
    console.error('[MSP] setInavPlatformType MSP2 failed:', error);
    msp2Success = false;
  }

  // If MSP2 failed, try CLI fallback (outside config lock)
  if (!msp2Success) {
    sendLog('info', 'MSP2 failed, trying CLI fallback...');
    console.log('[MSP] MSP2 failed, attempting CLI fallback for old iNav');
    return await setPlatformViaCli(platformType, mixerType);
  }

  // MSP2 platformType succeeded, but we ALSO need to set the mixer type!
  // platformType (AIRPLANE) and mixer (FLYING_WING vs AIRPLANE) are DIFFERENT things
  //
  // IMPORTANT: On old iNav, MSP_SET_MIXER_CONFIG doesn't actually change the mixer.
  // The mixer must be changed via CLI `mixer X` command and then saved.
  // Since servo config will likely use CLI mode anyway, we store the pending mixer
  // and apply it during saveEepromViaCli() in the same CLI session as the save.
  if (mixerType !== undefined) {
    const mixerTypeToName: Record<number, string> = {
      0: 'TRI', 3: 'QUADX', 5: 'GIMBAL', 8: 'FLYING_WING', 14: 'AIRPLANE', 24: 'CUSTOM_AIRPLANE',
    };
    const mixerName = mixerTypeToName[mixerType] ?? `MIXER_${mixerType}`;

    console.log(`[MSP] Storing pending mixer type: ${mixerType} (${mixerName})`);
    pendingMixerType = mixerType;
    sendLog('info', `Mixer ${mixerName} queued`, 'Will be applied when saving');
  }

  return true;
}

/**
 * CLI fallback for setting platform type on old iNav that doesn't support MSP2.
 *
 * For iNav 2.0.0 and older: Uses `mixer X` command directly
 * For newer iNav: Uses `set platform_type = X` then `save`
 *
 * mixerType: Optional - specific mixer type (e.g., 8=FLYING_WING, 14=AIRPLANE)
 *            If provided, uses the correct mixer name instead of platformType default.
 *
 * BSOD Prevention: Conservative delays between commands.
 */
async function setPlatformViaCli(platformType: number, mixerType?: number): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  try {
    const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
    const platformName = platformNames[platformType] ?? 'AIRPLANE';

    // Map mixer TYPE numbers to iNav mixer command names
    // iNav 2.0.0 mixer values: 0=TRI, 3=QUADX, 5=GIMBAL, 8=FLYING_WING, 14=AIRPLANE, 24=CUSTOM_AIRPLANE
    const mixerTypeToName: Record<number, string> = {
      0: 'TRI',
      3: 'QUADX',
      5: 'GIMBAL',
      8: 'FLYING_WING',
      14: 'AIRPLANE',
      24: 'CUSTOM_AIRPLANE',
    };

    // Map platform types to default mixer names (fallback if mixerType not provided)
    const platformToMixer: Record<number, string> = {
      0: 'QUADX',      // MULTIROTOR -> default quad
      1: 'AIRPLANE',   // AIRPLANE
      2: 'CUSTOM',     // HELICOPTER -> use custom
      3: 'TRI',        // TRICOPTER
      4: 'QUADX',      // ROVER -> not really supported, default
      5: 'QUADX',      // BOAT -> not really supported, default
    };

    // Use specific mixerType if provided, otherwise fall back to platform default
    const mixerName = mixerType !== undefined
      ? (mixerTypeToName[mixerType] ?? platformToMixer[platformType] ?? 'AIRPLANE')
      : (platformToMixer[platformType] ?? 'AIRPLANE');

    console.log(`[MSP] CLI: mixerType=${mixerType}, resolved mixer name: ${mixerName}`);

    sendLog('info', `CLI: Setting mixer ${mixerName}`, `Platform: ${platformName}, using CLI for old iNav compatibility`);

    // BSOD Prevention: Stop telemetry during CLI commands
    stopMspTelemetry();

    // Enter CLI mode by sending '#'
    console.log('[MSP] Entering CLI mode...');
    await currentTransport.write(new Uint8Array([0x23])); // '#'

    // BSOD Prevention: Wait for CLI to activate
    await new Promise(r => setTimeout(r, 500));

    // First try the new command (for iNav 2.5+)
    const cmd1 = `set platform_type = ${platformName}\n`;
    console.log(`[MSP] CLI: ${cmd1.trim()}`);
    await currentTransport.write(new TextEncoder().encode(cmd1));
    await new Promise(r => setTimeout(r, 200));

    // Also try the old mixer command (for iNav 2.0.0)
    // This won't hurt on newer versions and is needed for old versions
    const cmd2 = `mixer ${mixerName}\n`;
    console.log(`[MSP] CLI: ${cmd2.trim()}`);
    await currentTransport.write(new TextEncoder().encode(cmd2));
    await new Promise(r => setTimeout(r, 200));

    // Send save command (this reboots the board)
    console.log('[MSP] CLI: save');
    await currentTransport.write(new TextEncoder().encode('save\n'));

    sendLog('info', 'CLI commands sent', 'Board will reboot. Reconnect to verify.');

    // BSOD Prevention: Delay before cleanup
    await new Promise(r => setTimeout(r, 500));

    // Clean up connection state since board is rebooting
    cleanupMspConnection();

    return true;
  } catch (error) {
    console.error('[MSP] CLI platform set failed:', error);
    sendLog('error', 'CLI command failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Set mixer configuration (legacy, for non-iNav boards)
 */
async function setMixerConfig(mixerType: number): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const mixerName = getMixerName(mixerType);
      sendLog('info', `Setting mixer to: ${mixerName} (${mixerType})`);

      const payload = serializeMixerConfig(mixerType);
      await sendMspRequestWithPayload(MSP.SET_MIXER_CONFIG, payload, 2000);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      sendLog('error', 'Failed to set mixer config', message);
      console.error('[MSP] Set Mixer Config failed:', error);
      return false;
    }
  });
}

/**
 * Get live RC channel values (for modes wizard live feedback)
 * This skips if a poll is already in-flight to prevent queue buildup.
 * Does NOT use configLock since it's a quick single command.
 */
async function getRc(): Promise<{ channels: number[] } | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  // Skip if already polling - prevents queue buildup
  if (rcPollInFlight) {
    return null;
  }

  rcPollInFlight = true;
  try {
    const payload = await sendMspRequest(MSP.RC, 200);
    const rc = deserializeRc(payload);
    return { channels: rc.channels };
  } catch (error) {
    // Silently fail - this is polled frequently
    return null;
  } finally {
    rcPollInFlight = false;
  }
}

// =============================================================================
// Servo Configuration (iNav)
// =============================================================================

async function getServoConfigs(): Promise<MSPServoConfig[] | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.SERVO_CONFIGURATIONS, 1000);

      // Log RAW bytes for debugging
      console.log(`[MSP] RAW servo payload (${payload.length} bytes): ${Array.from(payload.slice(0, 56)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      if (payload.length > 56) {
        console.log(`[MSP] RAW servo payload continued: ${Array.from(payload.slice(56)).map(b => b.toString(16).padStart(2, '0')).join(' ')}`);
      }

      const configs = deserializeServoConfigurations(payload);

      // Log what we read from FC
      if (configs) {
        console.log('[MSP] READ servo configs from FC:');
        configs.forEach((c, i) => {
          console.log(`  Servo ${i}: min=${c.min} mid=${c.middle} max=${c.max} rate=${c.rate}`);
        });
        sendLog('info', 'Read servo configs', `${configs.length} servos`);
      }

      return configs;
    } catch (error) {
      console.error('[MSP] Get Servo Configurations failed:', error);
      return null;
    }
  });
}

/**
 * CLI fallback for setting servo config on old iNav that doesn't support MSP 212
 * Uses: servo <index> <min> <max> <middle> <rate> <forward_channel> <reversed_sources>
 */
// Persistent CLI response listener
let cliResponseListener: ((data: Uint8Array) => void) | null = null;

// CLI response buffer - module-level for access across calls
let cliResponse = '';

// Track if we're using CLI fallback (old board that doesn't support MSP_SET_SERVO_CONFIGURATION)
// This affects servo value range limits: old boards typically support 750-2250, modern 500-2500
let usesCliServoFallback = false;
let servoConfigModeProbed = false; // Track if we've already probed

/**
 * Check if the connected board requires CLI fallback for servo config
 * Used by UI to determine valid servo value ranges
 */
function getServoConfigMode(): { usesCli: boolean; minValue: number; maxValue: number } {
  return {
    usesCli: usesCliServoFallback,
    // Old iNav (~2.0.0) has tighter limits, modern iNav allows 500-2500
    minValue: usesCliServoFallback ? 750 : 500,
    maxValue: usesCliServoFallback ? 2250 : 2500,
  };
}

/**
 * Probe if MSP_SET_SERVO_CONFIGURATION is supported
 * Reads current servo 0 config and tries to write it back unchanged
 * Sets usesCliServoFallback flag based on result
 */
async function probeServoConfigMode(): Promise<{ usesCli: boolean; minValue: number; maxValue: number }> {
  console.log('[MSP] probeServoConfigMode called, transport open:', currentTransport?.isOpen, 'already probed:', servoConfigModeProbed);

  if (!currentTransport?.isOpen) {
    console.log('[MSP] Transport not open, returning default mode');
    return getServoConfigMode();
  }

  // Only probe once per connection
  if (servoConfigModeProbed) {
    console.log('[MSP] Already probed, returning cached result');
    return getServoConfigMode();
  }

  servoConfigModeProbed = true;
  console.log('[MSP] Probing servo config mode...');

  try {
    // Read current servo configs
    const configs = await getServoConfigs();
    if (!configs || configs.length === 0) {
      console.log('[MSP] No servo configs available');
      return getServoConfigMode();
    }

    // Get first servo config
    const servo0 = configs[0];

    // Try to write it back unchanged via MSP
    const payload = serializeServoConfiguration(0, {
      min: servo0.min,
      max: servo0.max,
      middle: servo0.middle,
      rate: servo0.rate,
      forwardFromChannel: servo0.forwardFromChannel ?? 255,
      reversedSources: servo0.reversedSources ?? 0,
    });

    await sendMspRequestWithPayload(MSP.SET_SERVO_CONFIGURATION, payload, 2000);
    console.log('[MSP] MSP_SET_SERVO_CONFIGURATION supported - using MSP mode');
    usesCliServoFallback = false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.log('[MSP] Servo config probe failed:', msg);

    // Detect CLI fallback needed: "not supported", command number, or timeout
    // Old iNav may not respond at all (timeout) or return error
    if (msg.includes('not supported') || msg.includes('212') || msg.includes('timed out') || msg.includes('timeout')) {
      console.log('[MSP] MSP_SET_SERVO_CONFIGURATION not supported - will use CLI fallback');
      usesCliServoFallback = true;
    } else {
      // Other errors - assume CLI fallback to be safe
      console.log('[MSP] Unknown error, assuming CLI fallback needed');
      usesCliServoFallback = true;
    }
  }

  const result = getServoConfigMode();
  console.log('[MSP] Servo config mode result:', result);
  return result;
}

async function setServoConfigViaCli(index: number, config: MSPServoConfig): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    // Enter CLI mode if not already in it
    if (!servoCliModeActive) {
      // CRITICAL: Set CLI mode flag FIRST to block all incoming MSP requests
      servoCliModeActive = true;
      usesCliServoFallback = true; // Mark that we're using CLI fallback

      // BSOD Prevention: Stop telemetry during CLI commands
      stopMspTelemetry();

      // Cancel all pending MSP responses (they will never complete in CLI mode)
      for (const [, pending] of pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      pendingResponses.clear();

      sendLog('info', 'CLI mode', 'Entering CLI for legacy servo config');

      // Wait for any in-flight data to settle
      await new Promise(r => setTimeout(r, 100));

      // Add persistent listener to capture CLI responses
      cliResponse = '';
      cliResponseListener = (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        cliResponse += text;
      };
      currentTransport.on('data', cliResponseListener);

      // Send '#' to enter CLI mode
      await currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 500));

      // Validate CLI entry
      if (!cliResponse.includes('CLI')) {
        console.warn('[MSP] CLI mode entry not confirmed');
      }

      // Log current servo config from board (useful for advanced users)
      cliResponse = '';
      await currentTransport.write(new TextEncoder().encode('servo\n'));
      await new Promise(r => setTimeout(r, 500));
      const servoOutput = cliResponse.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      console.log('[MSP] Board servo config:\n' + servoOutput);
      sendLog('info', 'CLI servo config', servoOutput.split('\n').slice(1, 5).join(', '));
    }

    // iNav CLI servo command format: servo <n> <min> <max> <mid> <rate>
    // Reference: https://github.com/iNavFlight/inav/blob/master/docs/Servo.md
    const cmd = `servo ${index} ${config.min} ${config.max} ${config.middle} ${config.rate}\n`;

    sendLog('info', `CLI servo ${index}`, `${config.min}-${config.max} mid=${config.middle}`);

    // Send command and capture response
    cliResponse = '';
    await currentTransport.write(new TextEncoder().encode(cmd));
    await new Promise(r => setTimeout(r, 300));

    const response = cliResponse.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // Log board response for advanced users
    if (response && !response.endsWith('#')) {
      console.log(`[MSP] Board response: ${response}`);
    }

    // Check for parse error (usually means value out of range)
    if (response.includes('Parse error')) {
      sendLog('error', `Servo ${index} failed`, 'Value out of range for this firmware');
      return false;
    }

    return true;
  } catch (error) {
    console.error('[MSP] CLI servo config failed:', error);
    return false;
  }
}

/**
 * Save servo config via CLI and exit CLI mode
 * Call this after all servo configs have been sent via CLI
 */
async function saveServoConfigViaCli(): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  // If not in CLI mode, nothing to save via CLI
  if (!servoCliModeActive) {
    console.log('[MSP] Not in CLI mode, skipping CLI save');
    return true;
  }

  try {
    // Wait a bit before save to ensure all commands are processed
    await new Promise(r => setTimeout(r, 500));

    // Send save command (this reboots the board)
    // Use \n (newline) - iNav configurator uses this (cli.js line 506)
    console.log('[MSP] CLI: save');
    await currentTransport.write(new TextEncoder().encode('save\n'));

    sendLog('info', 'Servo config saved via CLI', 'Board will reboot');

    // Wait for save to complete and board to start rebooting
    await new Promise(r => setTimeout(r, 2000));

    // Clean up CLI listener
    if (cliResponseListener && currentTransport) {
      currentTransport.off('data', cliResponseListener);
      cliResponseListener = null;
    }

    // Clean up connection state since board is rebooting
    cleanupMspConnection();
    servoCliModeActive = false;

    return true;
  } catch (error) {
    console.error('[MSP] CLI save failed:', error);
    // Clean up CLI listener on error too
    if (cliResponseListener && currentTransport) {
      currentTransport.off('data', cliResponseListener);
      cliResponseListener = null;
    }
    servoCliModeActive = false;
    return false;
  }
}

async function setServoConfig(index: number, config: MSPServoConfig): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  // If already in CLI mode, use CLI
  if (servoCliModeActive) {
    return setServoConfigViaCli(index, config);
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeServoConfiguration(index, config);
      await sendMspRequestWithPayload(MSP.SET_SERVO_CONFIGURATION, payload, 1000);
      sendLog('info', `Servo ${index} config updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // If MSP 212 not supported, try CLI fallback
      if (msg.includes('not supported')) {
        console.log('[MSP] MSP 212 not supported, trying CLI fallback...');
        return await setServoConfigViaCli(index, config);
      }

      sendLog('error', 'Failed to set servo config', msg);
      return false;
    }
  });
}

async function getServoValues(): Promise<number[] | null> {
  // Guard: return null if not connected or in CLI mode
  if (!currentTransport?.isOpen || servoCliModeActive) return null;

  try {
    const payload = await sendMspRequest(MSP.SERVO, 300);
    return deserializeServoValues(payload);
  } catch (error) {
    // Don't log CLI mode blocks as errors - they're expected
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('CLI mode')) {
      console.error('[MSP] Get Servo Values failed:', error);
    }
    return null;
  }
}

async function getServoMixer(): Promise<MSPServoMixerRule[] | null> {
  // Guard: return null if not connected or in CLI mode
  if (!currentTransport?.isOpen || servoCliModeActive) return null;

  return withConfigLock(async () => {
    try {
      // Try iNav MSP2 command first
      const payload = await sendMspV2Request(MSP2.INAV_SERVO_MIXER, 1000);
      return deserializeServoMixerRules(payload);
    } catch (error) {
      // MSP2 servo mixer not supported on old iNav - this is expected
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not supported') || msg.includes('CLI mode')) {
        console.log('[MSP] Servo mixer MSP2 not supported (old iNav) - skipping');
      } else {
        console.warn('[MSP] Get Servo Mixer failed:', msg);
      }
      return null;
    }
  });
}

async function setServoMixerRule(index: number, rule: MSPServoMixerRule): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  // Try MSP2 first
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeServoMixerRule(index, rule);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_MIXER, payload, 1000);
      sendLog('info', `Servo mixer rule ${index} updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not supported') || msg.includes('timed out')) {
        sendLog('warn', 'MSP2 servo mixer not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', 'Failed to set servo mixer rule', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback
  return await setServoMixerRuleViaCli(index, rule);
}

/**
 * CLI fallback for servo mixer rule on old iNav
 * Uses: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
 */
async function setServoMixerRuleViaCli(index: number, rule: MSPServoMixerRule): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Using CLI fallback for servo mixer rule...');

    stopMspTelemetry();
    await currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    // smix <index> <target> <input> <rate> <speed> <min> <max> <box>
    const cmd = `smix ${index} ${rule.targetChannel} ${rule.inputSource} ${rule.rate} ${rule.speed || 0} ${rule.min || 0} ${rule.max || 100} ${rule.box || 0}`;
    console.log(`[MSP] CLI: ${cmd}`);
    await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
    await new Promise(r => setTimeout(r, 100));

    return true;
  } catch (error) {
    console.error('[MSP] CLI servo mixer failed:', error);
    return false;
  }
}

// =============================================================================
// Motor Mixer Configuration (Legacy iNav)
// =============================================================================

/**
 * Set motor mixer rules via CLI for legacy iNav boards.
 * Uses: mmix <index> <throttle> <roll> <pitch> <yaw>
 *
 * This is required for legacy iNav 2.0.0+ boards where setting platform_type
 * alone does NOT configure the motor mixer. Without these rules, motors won't
 * respond correctly to control inputs.
 *
 * @param rules Array of motor mixer rules to apply
 * @returns true if successful, false otherwise
 */
async function setMotorMixerRulesViaCli(
  rules: Array<{ motorIndex: number; throttle: number; roll: number; pitch: number; yaw: number }>
): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Setting motor mixer via CLI...');

    // BSOD Prevention: Stop telemetry before CLI operations
    stopMspTelemetry();

    // Enter CLI mode
    await currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500)); // BSOD delay

    // Reset existing mmix rules first
    await currentTransport.write(new TextEncoder().encode('mmix reset\n'));
    await new Promise(r => setTimeout(r, 200)); // BSOD delay

    // Send each motor mixer rule
    for (const rule of rules) {
      // Format: mmix <index> <throttle> <roll> <pitch> <yaw>
      const cmd = `mmix ${rule.motorIndex} ${rule.throttle.toFixed(3)} ${rule.roll.toFixed(3)} ${rule.pitch.toFixed(3)} ${rule.yaw.toFixed(3)}`;
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 200)); // BSOD delay between commands
    }

    // Exit CLI mode (without saving - save happens later)
    await currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 300));

    sendLog('info', 'Motor mixer rules set via CLI', `${rules.length} rules`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI motor mixer failed:', error);
    sendLog('error', 'CLI motor mixer failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Set servo mixer rules via CLI for legacy iNav boards.
 * Uses: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
 *
 * This is required for legacy iNav 2.0.0 boards where MSP2_SET_SERVO_MIXER is not supported.
 * Without these rules, control surfaces won't respond correctly to stabilization.
 *
 * @param rules Array of servo mixer rules to apply
 * @returns true if successful, false otherwise
 */
async function setServoMixerRulesViaCli(
  rules: Array<{ servoIndex: number; inputSource: number; rate: number }>
): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Setting servo mixer via CLI...', rules.length, 'rules');

    // BSOD Prevention: Stop telemetry before CLI operations
    stopMspTelemetry();

    // Enter CLI mode
    await currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500)); // BSOD delay

    // Reset existing smix rules first
    await currentTransport.write(new TextEncoder().encode('smix reset\n'));
    await new Promise(r => setTimeout(r, 200)); // BSOD delay

    // Send each servo mixer rule
    // Format: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const cmd = `smix ${i} ${rule.servoIndex} ${rule.inputSource} ${rule.rate} 0 0 100 0`;
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 200)); // BSOD delay between commands
    }

    // DO NOT exit CLI mode - save needs to happen in CLI mode!
    servoCliModeActive = true; // Mark that we're in CLI mode

    sendLog('info', 'Servo mixer rules set via CLI', `${rules.length} rules`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI servo mixer failed:', error);
    sendLog('error', 'CLI servo mixer failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Read current smix (servo mixer) configuration via CLI.
 * Returns parsed smix rules for preset detection.
 *
 * This is needed for legacy iNav 2.0.0 boards where MSP2 servo mixer is not supported.
 */
async function readSmixViaCli(): Promise<Array<{ index: number; target: number; input: number; rate: number }> | null> {
  if (!currentTransport?.isOpen) return null;

  try {
    console.log('[MSP] Reading smix via CLI...');

    // CRITICAL: Stop telemetry and wait for in-flight MSP responses to finish
    stopMspTelemetry();
    await new Promise(r => setTimeout(r, 500)); // Wait for pending MSP responses

    // NOW set CLI mode flag - after telemetry stopped, before entering CLI
    servoCliModeActive = true;

    // Set up response listener AFTER telemetry is stopped
    let response = '';
    const dataListener = (data: Uint8Array) => {
      const chunk = new TextDecoder().decode(data);
      response += chunk;
    };
    currentTransport.on('data', dataListener);

    // Send multiple # characters to ensure CLI mode entry (handles timing issues)
    // Some boards need the # after all MSP traffic has stopped
    await currentTransport.write(new Uint8Array([0x23, 0x23, 0x23])); // '###'
    await new Promise(r => setTimeout(r, 1000)); // Wait for CLI banner

    // Check if we got CLI prompt (look for "CLI" or "#" in response)
    const gotCliPrompt = response.includes('CLI') || response.includes('#');

    if (!gotCliPrompt) {
      // Try sending # again
      await currentTransport.write(new Uint8Array([0x0D, 0x0A, 0x23])); // CR LF #
      await new Promise(r => setTimeout(r, 800));
    }

    // Clear buffer and send smix command
    response = '';
    await currentTransport.write(new TextEncoder().encode('smix\n'));
    await new Promise(r => setTimeout(r, 1500)); // Longer wait for all smix rules

    // Remove listener before exit
    currentTransport.removeListener('data', dataListener);

    // Exit CLI without saving
    await currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 300));

    // Parse smix output - format: "smix <index> <target> <input> <rate> <speed> <min> <max> <box>"
    const rules: Array<{ index: number; target: number; input: number; rate: number }> = [];
    const lines = response.split(/[\r\n]+/);

    for (const line of lines) {
      // Match smix rules - handles both "smix 0 3 0 100 0 0 100 0" and "smix 0 3 0 100" formats
      const match = line.match(/smix\s+(\d+)\s+(\d+)\s+(\d+)\s+(-?\d+)/);
      if (match) {
        rules.push({
          index: parseInt(match[1]),
          target: parseInt(match[2]),
          input: parseInt(match[3]),
          rate: parseInt(match[4]),
        });
      }
    }

    console.log('[MSP] CLI smix read:', rules.length, 'rules');
    sendLog('info', 'CLI smix read', `${rules.length} rules found`);
    return rules.length > 0 ? rules : null;
  } catch (error) {
    console.error('[MSP] CLI smix read failed:', error);
    sendLog('error', 'CLI smix read failed', error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    // Always reset CLI mode flag
    servoCliModeActive = false;
  }
}

/**
 * Read current mmix (motor mixer) configuration via CLI.
 * Returns parsed mmix rules for verification.
 */
async function readMmixViaCli(): Promise<Array<{ index: number; throttle: number; roll: number; pitch: number; yaw: number }> | null> {
  if (!currentTransport?.isOpen) return null;

  try {
    console.log('[MSP] Reading mmix via CLI...');

    // CRITICAL: Stop telemetry and wait for in-flight MSP responses to finish
    stopMspTelemetry();
    await new Promise(r => setTimeout(r, 500)); // Wait for pending MSP responses

    // NOW set CLI mode flag - after telemetry stopped, before entering CLI
    servoCliModeActive = true;

    // Set up response listener AFTER telemetry is stopped
    let response = '';
    const dataListener = (data: Uint8Array) => {
      const chunk = new TextDecoder().decode(data);
      response += chunk;
    };
    currentTransport.on('data', dataListener);

    // Send multiple # characters to ensure CLI mode entry
    await currentTransport.write(new Uint8Array([0x23, 0x23, 0x23])); // '###'
    await new Promise(r => setTimeout(r, 1000)); // Wait for CLI banner

    // Check if we got CLI prompt
    const gotCliPrompt = response.includes('CLI') || response.includes('#');

    if (!gotCliPrompt) {
      await currentTransport.write(new Uint8Array([0x0D, 0x0A, 0x23])); // CR LF #
      await new Promise(r => setTimeout(r, 800));
    }

    // Clear buffer and send mmix command
    response = '';
    await currentTransport.write(new TextEncoder().encode('mmix\n'));
    await new Promise(r => setTimeout(r, 1500)); // Longer wait for all mmix rules

    // Remove listener before exit
    currentTransport.removeListener('data', dataListener);

    // Exit CLI without saving
    await currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 300));

    // Parse mmix output - format: "mmix <index> <throttle> <roll> <pitch> <yaw>"
    const rules: Array<{ index: number; throttle: number; roll: number; pitch: number; yaw: number }> = [];
    const lines = response.split(/[\r\n]+/);

    for (const line of lines) {
      const match = line.match(/mmix\s+(\d+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)\s+([\d.-]+)/);
      if (match) {
        rules.push({
          index: parseInt(match[1]),
          throttle: parseFloat(match[2]),
          roll: parseFloat(match[3]),
          pitch: parseFloat(match[4]),
          yaw: parseFloat(match[5]),
        });
      }
    }

    console.log('[MSP] CLI mmix read:', rules.length, 'rules');
    sendLog('info', 'CLI mmix read', `${rules.length} rules found`);
    return rules.length > 0 ? rules : null;
  } catch (error) {
    console.error('[MSP] CLI mmix read failed:', error);
    sendLog('error', 'CLI mmix read failed', error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    // Always reset CLI mode flag
    servoCliModeActive = false;
  }
}

// =============================================================================
// Navigation Configuration (iNav)
// =============================================================================

async function getNavConfig(): Promise<Partial<MSPNavConfig> | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      // Try iNav MSP2 command first for more complete data
      try {
        const payload = await sendMspV2Request(MSP2.INAV_RTH_AND_LAND_CONFIG, 1000);
        return deserializeNavConfig(payload);
      } catch {
        // Fall back to legacy MSP command
        // Note: Some older firmware may not support MSP2
        console.log('[MSP] Falling back to legacy nav config');
        return null;
      }
    } catch (error) {
      console.error('[MSP] Get Nav Config failed:', error);
      return null;
    }
  });
}

async function setNavConfig(config: Partial<MSPNavConfig>): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setNavConfig: transport not open');
    return false;
  }

  // Try MSP2 first
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeNavConfig(config);
      console.log(`[MSP] SET_NAV_CONFIG (MSP2 0x2017) payload: ${payload.length} bytes`);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_RTH_AND_LAND_CONFIG, payload, 2000);
      sendLog('info', 'Navigation config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_NAV_CONFIG failed:', msg);
      if (msg.includes('not supported') || msg.includes('timed out')) {
        sendLog('warn', 'MSP2 nav config not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', 'Failed to set nav config', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback
  return await setNavConfigViaCli(config);
}

/**
 * CLI fallback for navigation config on old iNav
 */
async function setNavConfigViaCli(config: Partial<MSPNavConfig>): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Using CLI fallback for nav config...');
    sendLog('info', 'CLI fallback', 'Setting nav config via CLI');

    stopMspTelemetry();
    await currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    const commands: string[] = [];

    // Only set values that are provided
    if (config.rthAltitude !== undefined) {
      commands.push(`set nav_rth_altitude = ${config.rthAltitude}`);
    }
    if (config.rthAllowLanding !== undefined) {
      const landingModes = ['NEVER', 'ALWAYS', 'FS_ONLY'];
      commands.push(`set nav_rth_allow_landing = ${landingModes[config.rthAllowLanding] || 'ALWAYS'}`);
    }
    if (config.landDescendRate !== undefined) {
      commands.push(`set nav_land_descend_rate = ${config.landDescendRate}`);
    }
    if (config.landSlowdownMinAlt !== undefined) {
      commands.push(`set nav_land_slowdown_minalt = ${config.landSlowdownMinAlt}`);
    }
    if (config.landSlowdownMaxAlt !== undefined) {
      commands.push(`set nav_land_slowdown_maxalt = ${config.landSlowdownMaxAlt}`);
    }
    if (config.emergencyDescendRate !== undefined) {
      commands.push(`set nav_emerg_landing_speed = ${config.emergencyDescendRate}`);
    }

    for (const cmd of commands) {
      console.log(`[MSP] CLI: ${cmd}`);
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }

    return true;
  } catch (error) {
    console.error('[MSP] CLI nav config failed:', error);
    return false;
  }
}

async function getGpsConfig(): Promise<MSPGpsConfig | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.GPS_CONFIG, 1000);
      return deserializeGpsConfig(payload);
    } catch (error) {
      console.error('[MSP] Get GPS Config failed:', error);
      return null;
    }
  });
}

async function setGpsConfig(config: MSPGpsConfig): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setGpsConfig: transport not open');
    return false;
  }

  // Try MSP first
  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeGpsConfig(config);
      console.log(`[MSP] SET_GPS_CONFIG (223) payload: ${payload.length} bytes`);
      await sendMspRequestWithPayload(MSP.SET_GPS_CONFIG, payload, 2000);
      sendLog('info', 'GPS config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_GPS_CONFIG failed:', msg);
      if (msg.includes('not supported')) {
        sendLog('warn', 'MSP SET_GPS_CONFIG not supported, trying CLI...');
        return null;
      }
      sendLog('error', 'Failed to set GPS config', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback
  return await setGpsConfigViaCli(config);
}

/**
 * CLI fallback for GPS config
 */
async function setGpsConfigViaCli(config: MSPGpsConfig): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Using CLI fallback for GPS config...');
    sendLog('info', 'CLI fallback', 'Setting GPS config via CLI');

    stopMspTelemetry();
    await currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    const providerNames = ['NMEA', 'UBLOX', 'MSP', 'FAKE'];
    const sbasNames = ['AUTO', 'EGNOS', 'WAAS', 'MSAS', 'GAGAN', 'NONE'];

    const commands = [
      `set gps_provider = ${providerNames[config.provider] || 'UBLOX'}`,
      `set gps_sbas_mode = ${sbasNames[config.sbasMode] || 'AUTO'}`,
      `set gps_auto_config = ${config.autoConfig ? 'ON' : 'OFF'}`,
      `set gps_auto_baud = ${config.autoBaud ? 'ON' : 'OFF'}`,
    ];

    for (const cmd of commands) {
      console.log(`[MSP] CLI: ${cmd}`);
      await currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }

    return true;
  } catch (error) {
    console.error('[MSP] CLI GPS config failed:', error);
    return false;
  }
}

// =============================================================================
// MSP Commands
// =============================================================================

export async function saveEeprom(): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] saveEeprom: transport not open');
    sendLog('error', 'Cannot save to EEPROM - not connected');
    return false;
  }

  // If we're in CLI mode (servo or tuning), MSP won't work - use CLI save
  if (servoCliModeActive || tuningCliModeActive) {
    console.log('[MSP] In CLI mode, using CLI save');
    sendLog('info', 'In CLI mode, will use CLI save');
    return await saveEepromViaCli();
  }

  // Try MSP first
  const mspSuccess = await withConfigLock(async () => {
    try {
      console.log('[MSP] EEPROM_WRITE (250) - saving...');
      sendLog('info', 'Saving to EEPROM...');
      await sendMspRequest(MSP.EEPROM_WRITE, 5000);
      console.log('[MSP] EEPROM_WRITE success');
      sendLog('info', 'Settings saved to EEPROM');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] EEPROM_WRITE failed:', msg);
      if (msg.includes('not supported')) {
        sendLog('warn', 'MSP EEPROM_WRITE not supported, trying CLI...');
        return null; // Signal to try CLI fallback
      }
      sendLog('error', 'EEPROM save failed', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  // CLI fallback
  return await saveEepromViaCli();
}

/**
 * CLI fallback for saving to EEPROM
 * Uses: save (this reboots the board)
 */
async function saveEepromViaCli(): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  try {
    console.log('[MSP] Using CLI fallback for EEPROM save...');
    sendLog('info', 'CLI fallback', 'Saving via CLI (board will reboot)');

    // Stop telemetry during CLI
    stopMspTelemetry();

    // Enter CLI mode if not already (servo or tuning)
    if (!servoCliModeActive && !tuningCliModeActive) {
      await currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 1000));
    }

    // Apply pending mixer type if set (for old iNav where MSP doesn't work)
    if (pendingMixerType !== null) {
      const mixerTypeToName: Record<number, string> = {
        0: 'TRI', 3: 'QUADX', 5: 'GIMBAL', 8: 'FLYING_WING', 14: 'AIRPLANE', 24: 'CUSTOM_AIRPLANE',
      };
      const mixerName = mixerTypeToName[pendingMixerType] ?? `MIXER_${pendingMixerType}`;

      console.log(`[MSP] CLI: Applying pending mixer ${mixerName} (${pendingMixerType})`);
      sendLog('info', `CLI: Setting mixer ${mixerName}`);

      // Remove CLI listeners that might be capturing our mixer command response
      if (cliResponseListener && currentTransport) {
        currentTransport.off('data', cliResponseListener);
        cliResponseListener = null;
      }
      if (tuningCliListener && currentTransport) {
        currentTransport.off('data', tuningCliListener);
        tuningCliListener = null;
      }

      // Clear any buffered input and ensure clean CLI state
      await currentTransport.write(new TextEncoder().encode('\n'));
      await new Promise(r => setTimeout(r, 300));

      // Send the mixer command
      const mixerCmd = `mixer ${mixerName}\n`;
      console.log(`[MSP] CLI: ${mixerCmd.trim()}`);
      await currentTransport.write(new TextEncoder().encode(mixerCmd));

      // Wait for iNav to process the mixer change (needs more time on old boards)
      await new Promise(r => setTimeout(r, 1000));

      console.log('[MSP] CLI: Mixer command sent, proceeding to save');
      pendingMixerType = null; // Clear after applying
    }

    // Wait a bit before save to ensure all commands are processed
    await new Promise(r => setTimeout(r, 500));

    // Schedule auto-reconnect before CLI save (which triggers reboot)
    const scheduleReconnect = (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect as
      ((options: { reason: string; delayMs: number; timeoutMs?: number; maxAttempts?: number }) => void) | undefined;

    if (scheduleReconnect) {
      scheduleReconnect({
        reason: 'Saving configuration',
        delayMs: 4000, // CLI save + reboot takes longer
        timeoutMs: 6000,
        maxAttempts: 12,
      });
    }

    // Send save command (this reboots the board)
    console.log('[MSP] CLI: save');
    await currentTransport.write(new TextEncoder().encode('save\n'));

    sendLog('info', 'Settings saved via CLI', 'Board will reboot');

    // Wait for save to complete and board to start rebooting
    await new Promise(r => setTimeout(r, 2000));

    // Clean up tuning CLI listener
    if (tuningCliListener && currentTransport) {
      currentTransport.off('data', tuningCliListener);
      tuningCliListener = null;
    }
    tuningCliResponse = '';

    // Clean up servo CLI listener
    if (cliResponseListener && currentTransport) {
      currentTransport.off('data', cliResponseListener);
      cliResponseListener = null;
    }

    // Clean up CLI mode flags - board is rebooting
    tuningCliModeActive = false;
    servoCliModeActive = false;

    // Clean up connection state since board is rebooting
    cleanupMspConnection();

    return true;
  } catch (error) {
    console.error('[MSP] CLI EEPROM save failed:', error);
    sendLog('error', 'CLI save failed', error instanceof Error ? error.message : String(error));

    // Clean up on error too
    if (tuningCliListener && currentTransport) {
      currentTransport.off('data', tuningCliListener);
      tuningCliListener = null;
    }
    if (cliResponseListener && currentTransport) {
      currentTransport.off('data', cliResponseListener);
      cliResponseListener = null;
    }
    tuningCliModeActive = false;
    servoCliModeActive = false;
    pendingMixerType = null;

    return false;
  }
}

async function calibrateAcc(): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  try {
    await sendMspRequest(MSP.ACC_CALIBRATION, 5000);
    console.log('[MSP] ACC calibration started');
    return true;
  } catch (error) {
    console.error('[MSP] ACC calibration failed:', error);
    return false;
  }
}

async function calibrateMag(): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  try {
    await sendMspRequest(MSP.MAG_CALIBRATION, 5000);
    console.log('[MSP] MAG calibration started');
    return true;
  } catch (error) {
    console.error('[MSP] MAG calibration failed:', error);
    return false;
  }
}

export async function reboot(autoReconnect = true): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  try {
    // Schedule auto-reconnect before sending reboot command
    if (autoReconnect) {
      const scheduleReconnect = (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect as
        ((options: { reason: string; delayMs: number; timeoutMs?: number; maxAttempts?: number }) => void) | undefined;

      if (scheduleReconnect) {
        scheduleReconnect({
          reason: 'Rebooting board',
          delayMs: 3000, // Wait 3 seconds for board to reboot
          timeoutMs: 5000,
          maxAttempts: 10,
        });
      }
    }

    await sendMspRequest(MSP.REBOOT, 1000);
    console.log('[MSP] Reboot command sent');
    return true;
  } catch {
    // Reboot may not respond - that's expected
    return true;
  }
}

// =============================================================================
// Generic Settings API (iNav MSP2 COMMON_SETTING)
// Allows reading/writing any CLI setting via MSP without entering CLI mode
// =============================================================================

/**
 * Setting metadata returned from MSP2_COMMON_SETTING_INFO
 */
interface SettingInfo {
  name: string;
  type: 'uint8_t' | 'int8_t' | 'uint16_t' | 'int16_t' | 'uint32_t' | 'float' | 'string';
  mode: number;
  min: number;
  max: number;
  index: number;
  table?: string[]; // Lookup table for enum settings
}

/**
 * Cache for setting metadata to avoid repeated lookups
 */
const settingsCache = new Map<string, SettingInfo>();

/**
 * Clear the settings cache (call on disconnect)
 */
function clearSettingsCache(): void {
  settingsCache.clear();
}

/**
 * Encode a setting name as null-terminated string for MSP request
 */
function encodeSettingName(name: string): Uint8Array {
  const data = new Uint8Array(name.length + 1);
  for (let i = 0; i < name.length; i++) {
    data[i] = name.charCodeAt(i);
  }
  data[name.length] = 0; // Null terminator
  return data;
}

/**
 * Encode a setting reference by index for MSP request
 */
function encodeSettingIndex(index: number): Uint8Array {
  const data = new Uint8Array(3);
  data[0] = 0; // Use index mode
  data[1] = index & 0xFF;
  data[2] = (index >> 8) & 0xFF;
  return data;
}

/**
 * Get setting metadata (type, min, max, enum values)
 * Uses MSP2_COMMON_SETTING_INFO (0x1007)
 */
async function getSettingInfo(name: string): Promise<SettingInfo | null> {
  // Check cache first
  const cached = settingsCache.get(name);
  if (cached) return cached;

  if (!currentTransport?.isOpen) return null;

  const SETTING_TYPES: Record<number, SettingInfo['type']> = {
    0: 'uint8_t',
    1: 'int8_t',
    2: 'uint16_t',
    3: 'int16_t',
    4: 'uint32_t',
    5: 'float',
    6: 'string',
  };
  const MODE_LOOKUP = 1 << 6; // 64

  try {
    const payload = encodeSettingName(name);
    const response = await sendMspV2RequestWithPayload(MSP2.COMMON_SETTING_INFO, payload, 2000);

    // Parse response
    let offset = 0;

    // Read name (null-terminated string) - discard
    while (offset < response.length && response[offset] !== 0) offset++;
    offset++; // Skip null terminator

    // PG ID (uint16) - discard
    offset += 2;

    // Type (uint8)
    const typeNum = response[offset++];
    const type = SETTING_TYPES[typeNum];
    if (!type) {
      console.warn(`[MSP] Unknown setting type ${typeNum} for ${name}`);
      return null;
    }

    // Section (uint8) - discard
    offset++;

    // Mode (uint8)
    const mode = response[offset++];

    // Min (int32)
    const minView = new DataView(response.buffer, response.byteOffset + offset, 4);
    const min = minView.getInt32(0, true);
    offset += 4;

    // Max (uint32)
    const maxView = new DataView(response.buffer, response.byteOffset + offset, 4);
    const max = maxView.getUint32(0, true);
    offset += 4;

    // Index (uint16)
    const indexView = new DataView(response.buffer, response.byteOffset + offset, 2);
    const index = indexView.getUint16(0, true);
    offset += 2;

    // Profile info (2 bytes) - discard
    offset += 2;

    // Lookup table for enum settings
    let table: string[] | undefined;
    if (mode === MODE_LOOKUP) {
      table = [];
      for (let i = min; i <= max; i++) {
        let str = '';
        while (offset < response.length && response[offset] !== 0) {
          str += String.fromCharCode(response[offset++]);
        }
        offset++; // Skip null terminator
        table.push(str);
      }
    }

    const info: SettingInfo = { name, type, mode, min, max, index, table };
    settingsCache.set(name, info);
    return info;
  } catch (error) {
    console.error(`[MSP] getSettingInfo(${name}) failed:`, error);
    return null;
  }
}

/**
 * Get a CLI setting value by name
 * Uses MSP2_COMMON_SETTING (0x1003)
 */
async function getSetting(name: string): Promise<{ value: string | number; info: SettingInfo } | null> {
  if (!currentTransport?.isOpen) return null;

  const info = await getSettingInfo(name);
  if (!info) return null;

  try {
    const payload = encodeSettingIndex(info.index);
    const response = await sendMspV2RequestWithPayload(MSP2.COMMON_SETTING, payload, 2000);

    let value: string | number;
    const view = new DataView(response.buffer, response.byteOffset, response.length);

    switch (info.type) {
      case 'uint8_t':
        value = view.getUint8(0);
        break;
      case 'int8_t':
        value = view.getInt8(0);
        break;
      case 'uint16_t':
        value = view.getUint16(0, true);
        break;
      case 'int16_t':
        value = view.getInt16(0, true);
        break;
      case 'uint32_t':
        value = view.getUint32(0, true);
        break;
      case 'float': {
        const fi32 = view.getUint32(0, true);
        const buf = new ArrayBuffer(4);
        new Uint32Array(buf)[0] = fi32;
        value = new Float32Array(buf)[0];
        break;
      }
      case 'string': {
        let str = '';
        for (let i = 0; i < response.length && response[i] !== 0; i++) {
          str += String.fromCharCode(response[i]);
        }
        value = str;
        break;
      }
      default:
        console.error(`[MSP] Unknown type ${info.type} for ${name}`);
        return null;
    }

    // Convert numeric enum value to string if we have a lookup table
    if (info.table && typeof value === 'number') {
      const tableValue = info.table[value - info.min];
      if (tableValue) {
        return { value: tableValue, info };
      }
    }

    return { value, info };
  } catch (error) {
    console.error(`[MSP] getSetting(${name}) failed:`, error);
    return null;
  }
}

/**
 * Set a CLI setting value by name
 * Uses MSP2_COMMON_SET_SETTING (0x1004)
 */
async function setSetting(name: string, value: string | number): Promise<boolean> {
  if (!currentTransport?.isOpen) return false;

  const info = await getSettingInfo(name);
  if (!info) {
    console.error(`[MSP] setSetting: Unknown setting ${name}`);
    return false;
  }

  try {
    // Convert string enum value to numeric index if we have a lookup table
    let numericValue = value;
    if (info.table && typeof value === 'string') {
      const idx = info.table.indexOf(value);
      if (idx >= 0) {
        numericValue = idx + info.min;
      } else {
        console.error(`[MSP] Invalid enum value "${value}" for ${name}. Valid: ${info.table.join(', ')}`);
        return false;
      }
    }

    // Build payload: index (3 bytes) + value
    const indexPart = encodeSettingIndex(info.index);
    let valuePart: Uint8Array;

    switch (info.type) {
      case 'uint8_t':
      case 'int8_t':
        valuePart = new Uint8Array(1);
        valuePart[0] = Number(numericValue) & 0xFF;
        break;
      case 'uint16_t':
      case 'int16_t':
        valuePart = new Uint8Array(2);
        valuePart[0] = Number(numericValue) & 0xFF;
        valuePart[1] = (Number(numericValue) >> 8) & 0xFF;
        break;
      case 'uint32_t':
        valuePart = new Uint8Array(4);
        const uval = Number(numericValue);
        valuePart[0] = uval & 0xFF;
        valuePart[1] = (uval >> 8) & 0xFF;
        valuePart[2] = (uval >> 16) & 0xFF;
        valuePart[3] = (uval >> 24) & 0xFF;
        break;
      case 'float': {
        const buf = new ArrayBuffer(4);
        new Float32Array(buf)[0] = Number(numericValue);
        valuePart = new Uint8Array(buf);
        break;
      }
      case 'string': {
        const strVal = String(value);
        valuePart = new Uint8Array(strVal.length);
        for (let i = 0; i < strVal.length; i++) {
          valuePart[i] = strVal.charCodeAt(i);
        }
        break;
      }
      default:
        console.error(`[MSP] Unknown type ${info.type} for ${name}`);
        return false;
    }

    // Combine index and value
    const payload = new Uint8Array(indexPart.length + valuePart.length);
    payload.set(indexPart, 0);
    payload.set(valuePart, indexPart.length);

    await sendMspV2RequestWithPayload(MSP2.COMMON_SET_SETTING, payload, 2000);
    console.log(`[MSP] Set ${name} = ${value}`);
    return true;
  } catch (error) {
    console.error(`[MSP] setSetting(${name}, ${value}) failed:`, error);
    return false;
  }
}

/**
 * Get multiple settings at once (convenience wrapper)
 */
async function getSettings(names: string[]): Promise<Record<string, string | number | null>> {
  const result: Record<string, string | number | null> = {};
  for (const name of names) {
    const setting = await getSetting(name);
    result[name] = setting?.value ?? null;
  }
  return result;
}

/**
 * Set multiple settings at once (convenience wrapper)
 */
async function setSettings(settings: Record<string, string | number>): Promise<boolean> {
  for (const [name, value] of Object.entries(settings)) {
    const success = await setSetting(name, value);
    if (!success) return false;
  }
  return true;
}

// =============================================================================
// Register command handlers (not connection - that's in main ipc-handlers)
// =============================================================================

export function registerMspHandlers(window: BrowserWindow): void {
  mainWindow = window;

  // Initialize CLI handlers
  initCliHandlers(window);

  // Set up CLI mode change callback to pause/resume telemetry
  setCliModeChangeCallback((cliActive) => {
    if (cliActive) {
      console.log('[MSP] CLI mode active - pausing telemetry');
      stopMspTelemetry();
    } else {
      console.log('[MSP] CLI mode exited - resuming telemetry');
      startMspTelemetry();
    }
  });

  // Config handlers
  ipcMain.handle(IPC_CHANNELS.MSP_GET_PID, async () => getPid());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_PID, async (_event, pid: MSPPid) => setPid(pid));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC_TUNING, async () => getRcTuning());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_RC_TUNING, async (_event, rcTuning: MSPRcTuning) => setRcTuning(rcTuning));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MODE_RANGES, async () => getModeRanges());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MODE_RANGE, async (_event, index: number, mode: MSPModeRange) => setModeRange(index, mode));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_FEATURES, async () => getFeatures());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MIXER_CONFIG, async () => getMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MIXER_CONFIG, async (_event, mixerType: number) => setMixerConfig(mixerType));
  // iNav-specific mixer config (proper MSP2 commands)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG, async () => getInavMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE, async (_event, platformType: number, mixerType?: number) => setInavPlatformType(platformType, mixerType));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC, async () => getRc());

  // Servo config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS, async () => getServoConfigs());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_CONFIG, async (_event, index: number, config: MSPServoConfig) => setServoConfig(index, config));
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_SERVO_CLI, async () => saveServoConfigViaCli()); // CLI fallback for old iNav
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_VALUES, async () => getServoValues());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_MIXER, async () => getServoMixer());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER, async (_event, index: number, rule: MSPServoMixerRule) => setServoMixerRule(index, rule));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE, async () => probeServoConfigMode());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MOTOR_MIXER_CLI, async (_event, rules: Array<{ motorIndex: number; throttle: number; roll: number; pitch: number; yaw: number }>) => setMotorMixerRulesViaCli(rules));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER_CLI, async (_event, rules: Array<{ servoIndex: number; inputSource: number; rate: number }>) => setServoMixerRulesViaCli(rules));
  ipcMain.handle(IPC_CHANNELS.MSP_READ_SMIX_CLI, async () => readSmixViaCli());
  ipcMain.handle(IPC_CHANNELS.MSP_READ_MMIX_CLI, async () => readMmixViaCli());

  // Navigation config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_NAV_CONFIG, async () => getNavConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_NAV_CONFIG, async (_event, config: Partial<MSPNavConfig>) => setNavConfig(config));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_GPS_CONFIG, async () => getGpsConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_GPS_CONFIG, async (_event, config: MSPGpsConfig) => setGpsConfig(config));

  // Generic settings API (read/write any CLI setting via MSP)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SETTING, async (_event, name: string) => getSetting(name));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SETTING, async (_event, name: string, value: string | number) => setSetting(name, value));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SETTINGS, async (_event, names: string[]) => getSettings(names));
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SETTINGS, async (_event, settings: Record<string, string | number>) => setSettings(settings));

  // Command handlers
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_EEPROM, async () => saveEeprom());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_ACC, async () => calibrateAcc());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_MAG, async () => calibrateMag());
  ipcMain.handle(IPC_CHANNELS.MSP_REBOOT, async () => reboot());

  // Telemetry control handlers
  ipcMain.handle(IPC_CHANNELS.MSP_START_TELEMETRY, async (_event, rateHz?: number) => {
    startMspTelemetry(rateHz ?? 10);
  });
  ipcMain.handle(IPC_CHANNELS.MSP_STOP_TELEMETRY, async () => {
    stopMspTelemetry();
  });

  console.log('[MSP] Command handlers registered');
}

export function unregisterMspHandlers(): void {
  cleanupMspConnection();

  // Config handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MODE_RANGES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MODE_RANGE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_FEATURES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC);

  // Servo config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_SERVO_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_VALUES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MOTOR_MIXER_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_MIXER_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_READ_SMIX_CLI);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_READ_MMIX_CLI);

  // Navigation config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_GPS_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_GPS_CONFIG);

  // Generic settings API
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SETTING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SETTING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SETTINGS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SETTINGS);

  // Command handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_EEPROM);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_ACC);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_MAG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_REBOOT);

  // Telemetry control handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_START_TELEMETRY);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_STOP_TELEMETRY);

  mainWindow = null;
  console.log('[MSP] Command handlers unregistered');
}
