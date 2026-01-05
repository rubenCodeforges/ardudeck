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
  serializeRcTuning,
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
const TELEMETRY_SKIP_LOG_INTERVAL = 10; // Only log every N skips

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

// CLI servo config mode - when MSP_SET_SERVO_CONFIGURATION is not supported
let servoCliModeActive = false;

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

  // Reset CLI servo fallback state
  servoCliModeActive = false;
  usesCliServoFallback = false;
  servoConfigModeProbed = false;
  cliResponseListener = null;
  cliResponse = '';

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
      const payload = await sendMspRequest(MSP.PID, 2000);
      return deserializePid(payload);
    } catch (error) {
      console.error('[MSP] Get PID failed:', error);
      return null;
    }
  });
}

async function setPid(pid: MSPPid): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

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
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      // Increased timeout for slow F3 boards with old firmware (iNav 2.0.0)
      const payload = await sendMspRequest(MSP.RC_TUNING, 2000);
      return deserializeRcTuning(payload);
    } catch (error) {
      console.error('[MSP] Get RC Tuning failed:', error);
      return null;
    }
  });
}

async function setRcTuning(rcTuning: MSPRcTuning): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

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
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

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
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

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
 * Get mixer configuration (legacy, for non-iNav boards)
 */
async function getMixerConfig(): Promise<{ mixer: number; isMultirotor: boolean } | null> {
  // Guard: return null if not connected
  if (!currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      // Increased timeout for slow F3 boards
      const payload = await sendMspRequest(MSP.MIXER_CONFIG, 2000);
      const config = deserializeMixerConfig(payload);
      const isMultirotor = isMultirotorMixer(config.mixer);

      console.log(`[MSP] Mixer config: type=${config.mixer} isMultirotor=${isMultirotor}`);
      sendLog('info', `Mixer type: ${config.mixer}`, isMultirotor ? 'Multirotor mode' : 'Fixed-wing/plane mode');

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
 *
 * For iNav 2.0.0 and older: MSP2 may not be supported, uses CLI fallback
 * BSOD Prevention: Uses conservative delays and withConfigLock.
 */
async function setInavPlatformType(platformType: number): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) {
    console.log('[MSP] setInavPlatformType: transport not open');
    return false;
  }

  const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
  const platformName = platformNames[platformType] ?? `UNKNOWN`;

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
    return await setPlatformViaCli(platformType);
  }

  return true;
}

/**
 * CLI fallback for setting platform type on old iNav that doesn't support MSP2.
 *
 * For iNav 2.0.0 and older: Uses `mixer X` command directly
 * For newer iNav: Uses `set platform_type = X` then `save`
 *
 * BSOD Prevention: Conservative delays between commands.
 */
async function setPlatformViaCli(platformType: number): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  try {
    const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
    const platformName = platformNames[platformType] ?? 'AIRPLANE';

    // Map platform types to old iNav mixer names/numbers
    // iNav 2.0.0 mixer values: 3=QUADX, 8=FLYING_WING, 14=AIRPLANE, etc.
    const mixerMapping: Record<number, string> = {
      0: 'QUADX',      // MULTIROTOR -> default quad
      1: 'AIRPLANE',   // AIRPLANE
      2: 'CUSTOM',     // HELICOPTER -> use custom
      3: 'TRI',        // TRICOPTER
      4: 'QUADX',      // ROVER -> not really supported, default
      5: 'QUADX',      // BOAT -> not really supported, default
    };
    const mixerName = mixerMapping[platformType] ?? 'AIRPLANE';

    sendLog('info', `CLI: Changing to ${platformName}`, `Using mixer command for old iNav compatibility`);

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

  return withConfigLock(async () => {
    try {
      const payload = serializeServoMixerRule(index, rule);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_MIXER, payload, 1000);
      sendLog('info', `Servo mixer rule ${index} updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      // Don't spam UI for unsupported MSP2 on old iNav
      if (msg.includes('not supported')) {
        console.log('[MSP] Set Servo Mixer MSP2 not supported (old iNav)');
      } else {
        sendLog('error', 'Failed to set servo mixer rule', msg);
      }
      return false;
    }
  });
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
  if (!currentTransport?.isOpen) return false;

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
  if (!currentTransport?.isOpen) return false;

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
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

  // If we're in CLI mode, MSP won't work - return false to trigger CLI fallback
  if (servoCliModeActive) {
    console.log('[MSP] In CLI mode, skipping MSP EEPROM save (will use CLI save)');
    return false;
  }

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

async function reboot(): Promise<boolean> {
  // Guard: return false if not connected
  if (!currentTransport?.isOpen) return false;

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
  ipcMain.handle(IPC_CHANNELS.MSP_SET_MIXER_CONFIG, async (_event, mixerType: number) => setMixerConfig(mixerType));
  // iNav-specific mixer config (proper MSP2 commands)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_INAV_MIXER_CONFIG, async () => getInavMixerConfig());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_INAV_PLATFORM_TYPE, async (_event, platformType: number) => setInavPlatformType(platformType));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_RC, async () => getRc());

  // Servo config handlers (iNav)
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIGS, async () => getServoConfigs());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_CONFIG, async (_event, index: number, config: MSPServoConfig) => setServoConfig(index, config));
  ipcMain.handle(IPC_CHANNELS.MSP_SAVE_SERVO_CLI, async () => saveServoConfigViaCli()); // CLI fallback for old iNav
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_VALUES, async () => getServoValues());
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_MIXER, async () => getServoMixer());
  ipcMain.handle(IPC_CHANNELS.MSP_SET_SERVO_MIXER, async (_event, index: number, rule: MSPServoMixerRule) => setServoMixerRule(index, rule));
  ipcMain.handle(IPC_CHANNELS.MSP_GET_SERVO_CONFIG_MODE, async () => probeServoConfigMode());

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

  // Telemetry control handlers
  ipcMain.removeHandler(IPC_CHANNELS.MSP_START_TELEMETRY);
  ipcMain.removeHandler(IPC_CHANNELS.MSP_STOP_TELEMETRY);

  mainWindow = null;
  console.log('[MSP] Command handlers unregistered');
}
