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
  serializeRcTuning,
  deserializeModeRanges,
  serializeModeRange,
  deserializeFeatureConfig,
  deserializeMixerConfig,
  isMultirotorMixer,
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
} from '@ardudeck/msp-ts';
import { IPC_CHANNELS } from '../../shared/ipc-channels.js';

// =============================================================================
// State (managed by main ipc-handlers, not here)
// =============================================================================

let mspParser: MSPParser | null = null;
let telemetryInterval: ReturnType<typeof setInterval> | null = null;
let mainWindow: BrowserWindow | null = null;
let currentTransport: Transport | null = null;

// BSOD FIX: Prevent overlapping telemetry polls that can stack up
let telemetryInProgress = false;

// Pending response handlers
const pendingResponses = new Map<
  number,
  { resolve: (payload: Uint8Array) => void; reject: (err: Error) => void; timeout: ReturnType<typeof setTimeout> }
>();

// Track commands that returned errors (to avoid spam logging)
const unsupportedCommands = new Set<number>();

// Request mutex - ensures only one MSP request is in-flight at a time
let requestMutex: Promise<void> = Promise.resolve();
let mutexRelease: (() => void) | null = null;

// Config command lock - prevents telemetry from interfering with config reads
let configLockCount = 0;

// RC polling state - prevents overlapping RC polls
let rcPollInFlight = false;

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

  sendLog('info', 'Trying MSP protocol detection...');

  // Setup data handler for MSP
  const dataHandler = (data: Uint8Array) => {
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

    // BSOD FIX: Skip if previous poll still running to prevent request stacking
    if (telemetryInProgress) {
      console.warn('[MSP] Skipping telemetry poll - previous still in progress');
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
 */
export function stopMspTelemetry(): void {
  if (telemetryInterval) {
    clearInterval(telemetryInterval);
    telemetryInterval = null;
    sendLog('info', 'MSP telemetry stopped');
  }

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
  telemetryInProgress = false; // BSOD FIX: Also reset telemetry in-progress flag

  mspParser = null;
  currentTransport = null;
}

// =============================================================================
// MSP Config Commands
// =============================================================================

async function getPid(): Promise<MSPPid | null> {
  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.PID, 1000);
      return deserializePid(payload);
    } catch (error) {
      console.error('[MSP] Get PID failed:', error);
      return null;
    }
  });
}

async function setPid(pid: MSPPid): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      const payload = serializePid(pid);
      await sendMspRequestWithPayload(MSP.SET_PID, payload, 1000);
      sendLog('info', 'PIDs updated');
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set PIDs', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function getRcTuning(): Promise<MSPRcTuning | null> {
  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.RC_TUNING, 1000);
      return deserializeRcTuning(payload);
    } catch (error) {
      console.error('[MSP] Get RC Tuning failed:', error);
      return null;
    }
  });
}

async function setRcTuning(rcTuning: MSPRcTuning): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      const payload = serializeRcTuning(rcTuning);
      await sendMspRequestWithPayload(MSP.SET_RC_TUNING, payload, 1000);
      sendLog('info', 'Rates updated');
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set rates', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function getModeRanges(): Promise<MSPModeRange[] | null> {
  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.MODE_RANGES, 1000);
      return deserializeModeRanges(payload);
    } catch (error) {
      // Only log once, don't spam console
      if (!unsupportedCommands.has(MSP.MODE_RANGES)) {
        unsupportedCommands.add(MSP.MODE_RANGES);
        console.log('[MSP] Mode ranges not available on this board');
      }
      return null;
    }
  });
}

async function setModeRange(index: number, mode: MSPModeRange): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      const payload = serializeModeRange(index, mode);
      await sendMspRequestWithPayload(MSP.SET_MODE_RANGE, payload, 1000);
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set mode range', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function getFeatures(): Promise<number | null> {
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
 * Get mixer configuration (to detect quad vs plane)
 */
async function getMixerConfig(): Promise<{ mixer: number; isMultirotor: boolean } | null> {
  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.MIXER_CONFIG, 1000);
      const config = deserializeMixerConfig(payload);
      return {
        mixer: config.mixer,
        isMultirotor: isMultirotorMixer(config.mixer),
      };
    } catch (error) {
      console.error('[MSP] Get Mixer Config failed:', error);
      return null;
    }
  });
}

/**
 * Get live RC channel values (for modes wizard live feedback)
 * This skips if a poll is already in-flight to prevent queue buildup.
 * Does NOT use configLock since it's a quick single command.
 */
async function getRc(): Promise<{ channels: number[] } | null> {
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
  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.SERVO_CONFIGURATIONS, 1000);
      return deserializeServoConfigurations(payload);
    } catch (error) {
      console.error('[MSP] Get Servo Configurations failed:', error);
      return null;
    }
  });
}

async function setServoConfig(index: number, config: MSPServoConfig): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      const payload = serializeServoConfiguration(index, config);
      await sendMspRequestWithPayload(MSP.SET_SERVO_CONFIGURATION, payload, 1000);
      sendLog('info', `Servo ${index} config updated`);
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set servo config', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function getServoValues(): Promise<number[] | null> {
  try {
    const payload = await sendMspRequest(MSP.SERVO, 300);
    return deserializeServoValues(payload);
  } catch (error) {
    console.error('[MSP] Get Servo Values failed:', error);
    return null;
  }
}

async function getServoMixer(): Promise<MSPServoMixerRule[] | null> {
  return withConfigLock(async () => {
    try {
      // Try iNav MSP2 command first
      const payload = await sendMspV2Request(MSP2.INAV_SERVO_MIXER, 1000);
      return deserializeServoMixerRules(payload);
    } catch (error) {
      console.error('[MSP] Get Servo Mixer failed:', error);
      return null;
    }
  });
}

async function setServoMixerRule(index: number, rule: MSPServoMixerRule): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      const payload = serializeServoMixerRule(index, rule);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_MIXER, payload, 1000);
      sendLog('info', `Servo mixer rule ${index} updated`);
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set servo mixer rule', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

// =============================================================================
// Navigation Configuration (iNav)
// =============================================================================

async function getNavConfig(): Promise<Partial<MSPNavConfig> | null> {
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
  return withConfigLock(async () => {
    try {
      const payload = serializeNavConfig(config);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_RTH_AND_LAND_CONFIG, payload, 1000);
      sendLog('info', 'Navigation config updated');
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set nav config', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function getGpsConfig(): Promise<MSPGpsConfig | null> {
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
  return withConfigLock(async () => {
    try {
      const payload = serializeGpsConfig(config);
      await sendMspRequestWithPayload(MSP.SET_GPS_CONFIG, payload, 1000);
      sendLog('info', 'GPS config updated');
      return true;
    } catch (error) {
      sendLog('error', 'Failed to set GPS config', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

// =============================================================================
// MSP Commands
// =============================================================================

async function saveEeprom(): Promise<boolean> {
  return withConfigLock(async () => {
    try {
      await sendMspRequest(MSP.EEPROM_WRITE, 5000);
      sendLog('info', 'Settings saved to EEPROM');
      return true;
    } catch (error) {
      sendLog('error', 'EEPROM save failed', error instanceof Error ? error.message : String(error));
      return false;
    }
  });
}

async function calibrateAcc(): Promise<boolean> {
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
  try {
    await sendMspRequest(MSP.MAG_CALIBRATION, 5000);
    console.log('[MSP] MAG calibration started');
    return true;
  } catch (error) {
    console.error('[MSP] MAG calibration failed:', error);
    return false;
  }
}

async function reboot(): Promise<boolean> {
  try {
    await sendMspRequest(MSP.REBOOT, 1000);
    console.log('[MSP] Reboot command sent');
    return true;
  } catch {
    // Reboot may not respond
    return true;
  }
}

// =============================================================================
// Register command handlers (not connection - that's in main ipc-handlers)
// =============================================================================

export function registerMspHandlers(window: BrowserWindow): void {
  mainWindow = window;

  // Config handlers
  ipcMain.handle(IPC_CHANNELS.MSP_GET_PID, async () => getPid());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_PID, async (_event, pid: MSPPid) => setPid(pid));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC_TUNING, async () => getRcTuning());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_RC_TUNING, async (_event, rcTuning: MSPRcTuning) => setRcTuning(rcTuning));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MODE_RANGES, async () => getModeRanges());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MODE_RANGE, async (_event, index: number, mode: MSPModeRange) => setModeRange(index, mode));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_FEATURES, async () => getFeatures());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_MIXER_CONFIG, async () => getMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC, async () => getRc());

  // Servo config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS, async () => getServoConfigs());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_CONFIG, async (_event, index: number, config: MSPServoConfig) => setServoConfig(index, config));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_VALUES, async () => getServoValues());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_MIXER, async () => getServoMixer());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER, async (_event, index: number, rule: MSPServoMixerRule) => setServoMixerRule(index, rule));

  // Navigation config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_NAV_CONFIG, async () => getNavConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_NAV_CONFIG, async (_event, config: Partial<MSPNavConfig>) => setNavConfig(config));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_GPS_CONFIG, async () => getGpsConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_GPS_CONFIG, async (_event, config: MSPGpsConfig) => setGpsConfig(config));

  // Command handlers
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_EEPROM, async () => saveEeprom());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_ACC, async () => calibrateAcc());
  ipcMain.handle(IPC_CHANNELS.MSP_CALIBRATE_MAG, async () => calibrateMag());
  ipcMain.handle(IPC_CHANNELS.MSP_REBOOT, async () => reboot());

  console.log('[MSP] Command handlers registered');
}

export function unregisterMspHandlers(): void {
  stopMspTelemetry();

  // Config handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_PID);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_RC_TUNING);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MODE_RANGES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_MODE_RANGE);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_FEATURES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_MIXER_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_RC);

  // Servo config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_VALUES);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_SERVO_MIXER);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_SERVO_MIXER);

  // Navigation config handlers (iNav)
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_NAV_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_GET_GPS_CONFIG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SET_GPS_CONFIG);

  // Command handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_SAVE_EEPROM);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_ACC);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_CALIBRATE_MAG);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_REBOOT);

  mainWindow = null;
  console.log('[MSP] Command handlers unregistered');
}
