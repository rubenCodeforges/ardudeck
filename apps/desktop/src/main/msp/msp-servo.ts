/**
 * MSP Servo Configuration
 *
 * Servo config read/write, servo values, servo mixer rules.
 * iNav uses MSP2_INAV_SERVO_CONFIG / SET_SERVO_CONFIG; Betaflight uses MSP 120 / 212.
 */

import {
  MSP,
  MSP2,
  deserializeServoConfigurations,
  deserializeInavServoConfigs,
  serializeServoConfiguration,
  serializeInavServoConfig,
  buildServoMixerSlotPayloads,
  activeServoMixerRules,
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
  isCliModeBlockedError,
} from './msp-transport.js';
import { getInavMixerConfig } from './msp-mixer.js';
import { stopMspTelemetry, startMspTelemetry } from './msp-telemetry.js';
import { cleanupMspConnection } from './msp-cleanup.js';

// =============================================================================
// Servo Configuration (iNav)
// =============================================================================

export async function getServoConfigs(): Promise<MSPServoConfig[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      let configs: MSPServoConfig[];
      if (ctx.isInavFirmware) {
        // INAV 9 configurator reads MSP2_INAV_SERVO_CONFIG; MSP 120 is only a read fallback.
        try {
          configs = deserializeInavServoConfigs(await sendMspV2Request(MSP2.INAV_SERVO_CONFIG, 1000));
        } catch (error) {
          if (isCliModeBlockedError(error)) throw error;
          configs = deserializeServoConfigurations(await sendMspRequest(MSP.SERVO_CONFIGURATIONS, 1000));
        }
      } else {
        configs = deserializeServoConfigurations(await sendMspRequest(MSP.SERVO_CONFIGURATIONS, 1000), 12);
      }
      ctx.sendLog('info', 'Read servo configs', `${configs.length} servos`); // i18n-exempt
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

// No probe write: a rejected or slow write is not evidence that the board needs CLI.
export async function probeServoConfigMode(): Promise<{ usesCli: boolean; minValue: number; maxValue: number }> {
  ctx.servoConfigModeProbed = true;
  return getServoConfigMode();
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
        pending.reject(new Error('MSP cancelled - entering CLI mode')); // i18n-exempt
      }
      ctx.pendingResponses.clear();

      ctx.sendLog('info', 'CLI mode', 'Entering CLI for legacy servo config'); // i18n-exempt

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
    if (response.includes('Parse error')) { // i18n-exempt
      ctx.sendLog('error', `Servo ${index} failed`, 'Value out of range for this firmware'); // i18n-exempt
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

  if (!ctx.servoCliModeActive) {
    ctx.sendLog('warn', 'CLI save skipped', 'No CLI servo session is active, nothing was saved'); // i18n-exempt
    return false;
  }

  try {
    // Wait a bit before save to ensure all commands are processed
    await new Promise(r => setTimeout(r, 500));

    // Send save command (this reboots the board)
    // Use \n (newline) - iNav configurator uses this (cli.js line 506)
    await ctx.currentTransport.write(new TextEncoder().encode('save\n'));

    ctx.sendLog('info', 'Servo config saved via CLI', 'Board will reboot'); // i18n-exempt

    // Wait for save to complete and board to start rebooting
    await new Promise(r => setTimeout(r, 2000));

    // Clean up CLI listener
    if (ctx.cliResponseListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.cliResponseListener as (...args: unknown[]) => void);
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
      ctx.currentTransport.off('data', ctx.cliResponseListener as (...args: unknown[]) => void);
      ctx.cliResponseListener = null;
    }
    ctx.servoCliModeActive = false;
    return false;
  }
}

export async function setServoConfig(index: number, config: MSPServoConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  // Only reachable after the renderer explicitly opened a CLI servo session.
  if (ctx.servoCliModeActive) {
    return setServoConfigViaCli(index, config);
  }

  return withConfigLock(async () => {
    try {
      if (ctx.isInavFirmware) {
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_CONFIG, serializeInavServoConfig(index, config), 1000);
      } else {
        await sendMspRequestWithPayload(MSP.SET_SERVO_CONFIGURATION, serializeServoConfiguration(index, config), 1000);
      }
      ctx.sendLog('info', `Servo ${index} config updated`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ctx.sendLog('error', `Failed to set servo ${index} config`, msg);
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

  const mixerConfig = await getInavMixerConfig();
  const slotCount = (mixerConfig?.numberOfServos ?? 0) * 2;

  return withConfigLock(async () => {
    try {
      // Try iNav MSP2 command first
      const payload = await sendMspV2Request(MSP2.INAV_SERVO_MIXER, 1000);
      return activeServoMixerRules(deserializeServoMixerRules(payload), slotCount);
    } catch (error) {
      // MSP2 servo mixer not supported on old iNav - this is expected
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('rejected by the flight controller') && !msg.includes('CLI mode')) {
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
 * Write the whole servo mixer: every rule slot the board has (numberOfServos * 2, as the
 * configurator's ServoMixerRuleCollection), with unused slots cleared to the empty rule.
 */
export async function setServoMixerRules(rules: MSPServoMixerRule[]): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;
  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Servo mixer rules are only available on iNav'); // i18n-exempt
    return false;
  }

  const mixerConfig = await getInavMixerConfig();
  if (!mixerConfig || mixerConfig.numberOfServos <= 0) {
    ctx.sendLog('error', 'Servo mixer not saved', 'Could not read the servo count from the flight controller'); // i18n-exempt
    return false;
  }

  let payloads: Uint8Array[];
  try {
    payloads = buildServoMixerSlotPayloads(rules, mixerConfig.numberOfServos * 2);
  } catch (error) {
    ctx.sendLog('error', 'Servo mixer not saved', error instanceof Error ? error.message : String(error)); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    for (let i = 0; i < payloads.length; i++) {
      try {
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_SERVO_MIXER, payloads[i]!, 1000);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        ctx.sendLog('error', `Failed to set servo mixer rule ${i}`, msg);
        return false;
      }
    }
    ctx.sendLog('info', 'Servo mixer written', `${payloads.length} slots written`); // i18n-exempt
    return true;
  });
}
