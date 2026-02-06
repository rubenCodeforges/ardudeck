/**
 * MSP Servo Configuration
 *
 * Servo config read/write, servo values, servo mixer rules.
 * Includes CLI fallback for legacy iNav boards that do not support MSP 212.
 */

import {
  MSP,
  MSP2,
  deserializeServoConfigurations,
  serializeServoConfiguration,
  deserializeServoValues,
  deserializeServoMixerRules,
  serializeServoMixerRule,
  type MSPServoConfig,
  type MSPServoMixerRule,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspRequest,
  sendMspRequestWithPayload,
  sendMspV2Request,
  sendMspV2RequestWithPayload,
  withConfigLock,
} from './msp-transport.js';
import { stopMspTelemetry, startMspTelemetry } from './msp-telemetry.js';
import { cleanupMspConnection } from './msp-cleanup.js';

// =============================================================================
// Servo Configuration (iNav)
// =============================================================================

export async function getServoConfigs(): Promise<MSPServoConfig[] | null> {
  // Guard: return null if not connected
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.SERVO_CONFIGURATIONS, 1000);

      // Log RAW bytes for debugging
      if (payload.length > 56) {
      }

      const configs = deserializeServoConfigurations(payload);

      // Log what we read from FC
      if (configs) {
        configs.forEach((c, i) => {
        });
        ctx.sendLog('info', 'Read servo configs', `${configs.length} servos`);
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

// CLI response buffer - module-level for access across calls

// Track if we're using CLI fallback (old board that doesn't support MSP_SET_SERVO_CONFIGURATION)
// This affects servo value range limits: old boards typically support 750-2250, modern 500-2500

/**
 * Check if the connected board requires CLI fallback for servo config
 * Used by UI to determine valid servo value ranges
 */
export function getServoConfigMode(): { usesCli: boolean; minValue: number; maxValue: number } {
  return {
    usesCli: ctx.usesCliServoFallback,
    // Old iNav (~2.0.0) has tighter limits, modern iNav allows 500-2500
    minValue: ctx.usesCliServoFallback ? 750 : 500,
    maxValue: ctx.usesCliServoFallback ? 2250 : 2500,
  };
}

/**
 * Probe if MSP_SET_SERVO_CONFIGURATION is supported
 * Reads current servo 0 config and tries to write it back unchanged
 * Sets ctx.usesCliServoFallback flag based on result
 */
export async function probeServoConfigMode(): Promise<{ usesCli: boolean; minValue: number; maxValue: number }> {

  if (!ctx.currentTransport?.isOpen) {
    return getServoConfigMode();
  }

  // Only probe once per connection
  if (ctx.servoConfigModeProbed) {
    return getServoConfigMode();
  }

  ctx.servoConfigModeProbed = true;

  try {
    // Read current servo configs
    const configs = await getServoConfigs();
    if (!configs || configs.length === 0) {
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
    ctx.usesCliServoFallback = false;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);

    // Detect CLI fallback needed: "not supported", command number, or timeout
    // Old iNav may not respond at all (timeout) or return error
    if (msg.includes('not supported') || msg.includes('212') || msg.includes('timed out') || msg.includes('timeout')) {
      ctx.usesCliServoFallback = true;
    } else {
      // Other errors - assume CLI fallback to be safe
      ctx.usesCliServoFallback = true;
    }
  }

  const result = getServoConfigMode();
  return result;
}

export async function setServoConfigViaCli(index: number, config: MSPServoConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    // Enter CLI mode if not already in it
    if (!ctx.servoCliModeActive) {
      // CRITICAL: Set CLI mode flag FIRST to block all incoming MSP requests
      ctx.servoCliModeActive = true;
      ctx.usesCliServoFallback = true; // Mark that we're using CLI fallback

      // BSOD Prevention: Stop telemetry during CLI commands
      stopMspTelemetry();

      // Cancel all pending MSP responses (they will never complete in CLI mode)
      for (const [, pending] of ctx.pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      ctx.pendingResponses.clear();

      ctx.sendLog('info', 'CLI mode', 'Entering CLI for legacy servo config');

      // Wait for any in-flight data to settle
      await new Promise(r => setTimeout(r, 100));

      // Re-check transport in case it was closed during the delay
      if (!ctx.currentTransport?.isOpen) {
        ctx.servoCliModeActive = false;
        ctx.usesCliServoFallback = false;
        startMspTelemetry();
        return false;
      }

      // Add persistent listener to capture CLI responses
      ctx.cliResponse = '';
      ctx.cliResponseListener = (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        ctx.cliResponse += text;
      };
      ctx.currentTransport.on('data', ctx.cliResponseListener);

      // Send '#' to enter CLI mode
      await ctx.currentTransport.write(new Uint8Array([0x23])); // '#'
      await new Promise(r => setTimeout(r, 500));

      // Validate CLI entry
      if (!ctx.cliResponse.includes('CLI')) {
        console.warn('[MSP] CLI mode entry not confirmed');
      }

      // Log current servo config from board (useful for advanced users)
      ctx.cliResponse = '';
      await ctx.currentTransport.write(new TextEncoder().encode('servo\n'));
      await new Promise(r => setTimeout(r, 500));
      const servoOutput = ctx.cliResponse.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
      ctx.sendLog('info', 'CLI servo config', servoOutput.split('\n').slice(1, 5).join(', '));
    }

    // iNav CLI servo command format: servo <n> <min> <max> <mid> <rate>
    // Reference: https://github.com/iNavFlight/inav/blob/master/docs/Servo.md
    const cmd = `servo ${index} ${config.min} ${config.max} ${config.middle} ${config.rate}\n`;

    ctx.sendLog('info', `CLI servo ${index}`, `${config.min}-${config.max} mid=${config.middle}`);

    // Send command and capture response
    ctx.cliResponse = '';
    await ctx.currentTransport.write(new TextEncoder().encode(cmd));
    await new Promise(r => setTimeout(r, 300));

    const response = ctx.cliResponse.replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();

    // Log board response for advanced users
    if (response && !response.endsWith('#')) {
    }

    // Check for parse error (usually means value out of range)
    if (response.includes('Parse error')) {
      ctx.sendLog('error', `Servo ${index} failed`, 'Value out of range for this firmware');
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
export async function saveServoConfigViaCli(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  // If not in CLI mode, nothing to save via CLI
  if (!ctx.servoCliModeActive) {
    return true;
  }

  try {
    // Wait a bit before save to ensure all commands are processed
    await new Promise(r => setTimeout(r, 500));

    // Send save command (this reboots the board)
    // Use \n (newline) - iNav configurator uses this (cli.js line 506)
    await ctx.currentTransport.write(new TextEncoder().encode('save\n'));

    ctx.sendLog('info', 'Servo config saved via CLI', 'Board will reboot');

    // Wait for save to complete and board to start rebooting
    await new Promise(r => setTimeout(r, 2000));

    // Clean up CLI listener
    if (ctx.cliResponseListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.cliResponseListener);
      ctx.cliResponseListener = null;
    }

    // Clean up connection state since board is rebooting
    cleanupMspConnection();
    ctx.servoCliModeActive = false;

    return true;
  } catch (error) {
    console.error('[MSP] CLI save failed:', error);
    // Clean up CLI listener on error too
    if (ctx.cliResponseListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.cliResponseListener);
      ctx.cliResponseListener = null;
    }
    ctx.servoCliModeActive = false;
    return false;
  }
}

export async function setServoConfig(index: number, config: MSPServoConfig): Promise<boolean> {
  // Guard: return false if not connected
  if (!ctx.currentTransport?.isOpen) return false;

  // If already in CLI mode, use CLI
  if (ctx.servoCliModeActive) {
    return setServoConfigViaCli(index, config);
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeServoConfiguration(index, config);
      await sendMspRequestWithPayload(MSP.SET_SERVO_CONFIGURATION, payload, 1000);
      ctx.sendLog('info', `Servo ${index} config updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);

      // If MSP 212 not supported, try CLI fallback
      if (msg.includes('not supported')) {
        return await setServoConfigViaCli(index, config);
      }

      ctx.sendLog('error', 'Failed to set servo config', msg);
      return false;
    }
  });
}

export async function getServoValues(): Promise<number[] | null> {
  // Guard: return null if not connected or in CLI mode
  if (!ctx.currentTransport?.isOpen || ctx.servoCliModeActive) return null;

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

export async function getServoMixer(): Promise<MSPServoMixerRule[] | null> {
  // Guard: return null if not connected or in CLI mode
  if (!ctx.currentTransport?.isOpen || ctx.servoCliModeActive) return null;

  return withConfigLock(async () => {
    try {
      // Try iNav MSP2 command first
      const payload = await sendMspV2Request(MSP2.INAV_SERVO_MIXER, 1000);
      return deserializeServoMixerRules(payload);
    } catch (error) {
      // MSP2 servo mixer not supported on old iNav - this is expected
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not supported') || msg.includes('CLI mode')) {
      } else {
        console.warn('[MSP] Get Servo Mixer failed:', msg);
      }
      return null;
    }
  });
}

export async function setServoMixerRule(index: number, rule: MSPServoMixerRule): Promise<boolean> {
  // Guard: return false if not connected
  if (!ctx.currentTransport?.isOpen) return false;

  // Use MSP2 only - no CLI fallback for modern boards
  return await withConfigLock(async () => {
    try {
      const payload = serializeServoMixerRule(index, rule);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_MIXER, payload, 500);
      ctx.sendLog('info', `Servo mixer rule ${index} updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ctx.sendLog('error', `Failed to set servo mixer rule ${index}`, msg);
      return false;
    }
  });
}

/**
 * CLI fallback for servo mixer rule on old iNav
 * Uses: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
 */
export async function setServoMixerRuleViaCli(index: number, rule: MSPServoMixerRule): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {

    stopMspTelemetry();
    await ctx.currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    // smix <index> <target> <input> <rate> <speed> <min> <max> <box>
    const cmd = `smix ${index} ${rule.targetChannel} ${rule.inputSource} ${rule.rate} ${rule.speed || 0} ${rule.min || 0} ${rule.max || 100} ${rule.box || 0}`;
    await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
    await new Promise(r => setTimeout(r, 100));

    return true;
  } catch (error) {
    console.error('[MSP] CLI servo mixer failed:', error);
    return false;
  }
}
