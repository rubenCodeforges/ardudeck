/**
 * MSP Cleanup
 *
 * Full cleanup of MSP connection state on disconnect.
 */

import { cleanupCli } from '../cli/cli-handlers.js';
import { ctx } from './msp-context.js';
import { stopMspTelemetry, stopGpsSender } from './msp-telemetry.js';
import { clearSettingsCache } from './msp-settings.js';

/**
 * Full cleanup of MSP connection state.
 * Call this on actual disconnect, NOT when just stopping telemetry.
 */
export function cleanupMspConnection(): void {
  // Stop telemetry first
  stopMspTelemetry();

  // Stop GPS sender
  stopGpsSender();

  // Clean up CLI handlers
  cleanupCli();

  // Clear pending responses
  for (const [, pending] of ctx.pendingResponses) {
    clearTimeout(pending.timeout);
  }
  ctx.pendingResponses.clear();
  ctx.unsupportedCommands.clear();

  // Stop dedicated RC poll and reset throttle state
  ctx.lastKnownThrottlePercent = 0;
  ctx.lastSentThrottlePercent = null;

  // Reset cached box names
  ctx.cachedBoxNames = [];

  // Reset mutex, config lock, and RC poll state
  ctx.requestMutex = Promise.resolve();
  ctx.configLockCount = 0;
  ctx.rcPollInFlight = false;

  // Reset CLI fallback states
  ctx.servoCliModeActive = false;
  ctx.tuningCliModeActive = false;
  ctx.pendingMixerType = null;
  ctx.usesCliServoFallback = false;
  ctx.servoConfigModeProbed = false;
  ctx.cliResponseListener = null;
  ctx.cliResponse = '';
  ctx.tuningCliListener = null;
  ctx.tuningCliResponse = '';

  // Reset firmware/platform detection state
  ctx.isInavFirmware = false;
  ctx.inavVersion = '';
  ctx.currentPlatformType = 0;

  // Clear cached PID state
  ctx.cachedInavPid = null;

  // Reset RX channel mapping to default AETR
  ctx.cachedRxMap = [0, 1, 2, 3, 4, 5, 6, 7];

  // Clear settings cache
  clearSettingsCache();

  // Clear transport and parser
  ctx.mspParser = null;
  ctx.currentTransport = null;
}
