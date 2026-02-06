/**
 * MSP Motor Mixer
 *
 * Motor mixer MSP + CLI readers (mmix/smix).
 */

import {
  MSP2,
  deserializeMotorMixerRules,
  serializeMotorMixerRule,
  type MSPMotorMixerRule,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspV2Request,
  sendMspV2RequestWithPayload,
  withConfigLock,
} from './msp-transport.js';
import { startMspTelemetry, stopMspTelemetry } from './msp-telemetry.js';
import { getInavMixerConfig } from './msp-mixer.js';

/**
 * Set motor mixer rules via CLI for legacy iNav boards.
 * Uses: mmix <index> <throttle> <roll> <pitch> <yaw>
 */
export async function setMotorMixerRulesViaCli(
  rules: Array<{ motorIndex: number; throttle: number; roll: number; pitch: number; yaw: number }>
): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    // BSOD Prevention: Stop telemetry before CLI operations
    stopMspTelemetry();
    await new Promise(r => setTimeout(r, 500));

    // Set up response listener to verify CLI entry
    let response = '';
    const dataListener = (data: Uint8Array) => {
      response += new TextDecoder().decode(data);
    };
    ctx.currentTransport.on('data', dataListener);

    // Enter CLI mode with multiple # characters
    await ctx.currentTransport.write(new Uint8Array([0x23, 0x23, 0x23])); // '###'
    await new Promise(r => setTimeout(r, 1000));

    // Check if we got CLI prompt
    const gotCliPrompt = response.includes('CLI') || response.includes('#');
    if (!gotCliPrompt) {
      await ctx.currentTransport.write(new Uint8Array([0x0D, 0x0A, 0x23])); // CR LF #
      await new Promise(r => setTimeout(r, 800));
    }

    // Clear response buffer
    response = '';

    // Reset existing mmix rules first
    await ctx.currentTransport.write(new TextEncoder().encode('mmix reset\n'));
    await new Promise(r => setTimeout(r, 300));

    // Send each motor mixer rule
    for (const rule of rules) {
      const cmd = `mmix ${rule.motorIndex} ${rule.throttle.toFixed(3)} ${rule.roll.toFixed(3)} ${rule.pitch.toFixed(3)} ${rule.yaw.toFixed(3)}`;
      console.log(`[MSP] Sending: ${cmd}`);
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 300));
    }

    // Remove listener
    ctx.currentTransport.removeListener('data', dataListener);

    // Exit CLI mode properly - 'exit' does NOT reboot
    await ctx.currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 500));

    ctx.sendLog('info', 'Motor mixer rules set via CLI', `${rules.length} rules`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI motor mixer failed:', error);
    ctx.sendLog('error', 'CLI motor mixer failed', error instanceof Error ? error.message : String(error));
    return false;
  } finally {
    startMspTelemetry();
  }
}

/**
 * Set servo mixer rules via CLI for legacy iNav boards.
 * Uses: smix <index> <target> <input> <rate> <speed> <min> <max> <box>
 */
export async function setServoMixerRulesViaCli(
  rules: Array<{ servoIndex: number; inputSource: number; rate: number }>
): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    // BSOD Prevention: Stop telemetry before CLI operations
    stopMspTelemetry();

    // Enter CLI mode
    await ctx.currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    // Reset existing smix rules first
    await ctx.currentTransport.write(new TextEncoder().encode('smix reset\n'));
    await new Promise(r => setTimeout(r, 200));

    // Send each servo mixer rule
    for (let i = 0; i < rules.length; i++) {
      const rule = rules[i];
      const cmd = `smix ${i} ${rule.servoIndex} ${rule.inputSource} ${rule.rate} 0 0 100 0`;
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 200));
    }

    // DO NOT exit CLI mode - save needs to happen in CLI mode!
    ctx.servoCliModeActive = true;

    ctx.sendLog('info', 'Servo mixer rules set via CLI', `${rules.length} rules`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI servo mixer failed:', error);
    ctx.sendLog('error', 'CLI servo mixer failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Read current smix (servo mixer) configuration via CLI.
 * Returns parsed smix rules for preset detection.
 */
export async function readSmixViaCli(): Promise<Array<{ index: number; target: number; input: number; rate: number }> | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  try {
    // CRITICAL: Stop telemetry and wait for in-flight MSP responses to finish
    stopMspTelemetry();
    await new Promise(r => setTimeout(r, 500));

    if (!ctx.currentTransport?.isOpen) {
      startMspTelemetry();
      return null;
    }

    ctx.servoCliModeActive = true;

    let response = '';
    const dataListener = (data: Uint8Array) => {
      const chunk = new TextDecoder().decode(data);
      response += chunk;
    };
    ctx.currentTransport.on('data', dataListener);

    await ctx.currentTransport.write(new Uint8Array([0x23, 0x23, 0x23])); // '###'
    await new Promise(r => setTimeout(r, 1000));

    const gotCliPrompt = response.includes('CLI') || response.includes('#');
    if (!gotCliPrompt) {
      await ctx.currentTransport.write(new Uint8Array([0x0D, 0x0A, 0x23])); // CR LF #
      await new Promise(r => setTimeout(r, 800));
    }

    response = '';
    await ctx.currentTransport.write(new TextEncoder().encode('smix\n'));
    await new Promise(r => setTimeout(r, 1500));

    ctx.currentTransport.removeListener('data', dataListener);

    // Exit CLI without saving
    await ctx.currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 300));

    // Parse smix output
    const rules: Array<{ index: number; target: number; input: number; rate: number }> = [];
    const lines = response.split(/[\r\n]+/);

    for (const line of lines) {
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

    ctx.sendLog('info', 'CLI smix read', `${rules.length} rules found`);
    return rules.length > 0 ? rules : null;
  } catch (error) {
    console.error('[MSP] CLI smix read failed:', error);
    ctx.sendLog('error', 'CLI smix read failed', error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    ctx.servoCliModeActive = false;
  }
}

/**
 * Read current mmix (motor mixer) configuration via CLI.
 * Returns parsed mmix rules for verification.
 */
export async function readMmixViaCli(): Promise<Array<{ index: number; throttle: number; roll: number; pitch: number; yaw: number }> | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  try {
    stopMspTelemetry();
    await new Promise(r => setTimeout(r, 500));

    if (!ctx.currentTransport?.isOpen) {
      startMspTelemetry();
      return null;
    }

    ctx.servoCliModeActive = true;

    let response = '';
    const dataListener = (data: Uint8Array) => {
      const chunk = new TextDecoder().decode(data);
      response += chunk;
    };
    ctx.currentTransport.on('data', dataListener);

    await ctx.currentTransport.write(new Uint8Array([0x23, 0x23, 0x23])); // '###'
    await new Promise(r => setTimeout(r, 1000));

    const gotCliPrompt = response.includes('CLI') || response.includes('#');
    if (!gotCliPrompt) {
      await ctx.currentTransport.write(new Uint8Array([0x0D, 0x0A, 0x23])); // CR LF #
      await new Promise(r => setTimeout(r, 800));
    }

    response = '';
    await ctx.currentTransport.write(new TextEncoder().encode('mmix\n'));
    await new Promise(r => setTimeout(r, 1500));

    ctx.currentTransport.removeListener('data', dataListener);

    await ctx.currentTransport.write(new TextEncoder().encode('exit\n'));
    await new Promise(r => setTimeout(r, 500));

    // Parse mmix output
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

    ctx.sendLog('info', 'CLI mmix read', `${rules.length} rules found`);
    return rules.length > 0 ? rules : null;
  } catch (error) {
    console.error('[MSP] CLI mmix read failed:', error);
    ctx.sendLog('error', 'CLI mmix read failed', error instanceof Error ? error.message : String(error));
    return null;
  } finally {
    ctx.servoCliModeActive = false;
    startMspTelemetry();
  }
}

/**
 * Get motor mixer configuration via MSP2_COMMON_MOTOR_MIXER
 */
export async function getMotorMixer(): Promise<MSPMotorMixerRule[] | null> {
  if (!ctx.currentTransport?.isOpen || ctx.servoCliModeActive) return null;

  // First, get the actual motor count from mixer config
  const mixerConfig = await getInavMixerConfig();
  const expectedMotorCount = mixerConfig?.numberOfMotors ?? 0;

  if (expectedMotorCount === 0) {
    ctx.sendLog('info', 'Motor mixer: 0 motors configured');
    return [];
  }

  return withConfigLock(async () => {
    try {
      const payload = await sendMspV2Request(MSP2.COMMON_MOTOR_MIXER, 1000);
      const rules = deserializeMotorMixerRules(payload);

      // CRITICAL: Limit to expected motor count (prevents garbage data)
      const limitedRules = rules.slice(0, expectedMotorCount);

      ctx.sendLog('info', 'Motor mixer loaded via MSP', `${limitedRules.length} motors (expected ${expectedMotorCount})`);
      return limitedRules;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[MSP] Get Motor Mixer failed:', msg);
      return [];
    }
  });
}

/**
 * Set motor mixer rules via MSP2_COMMON_SET_MOTOR_MIXER (0x1006)
 */
export async function setMotorMixer(rules: MSPMotorMixerRule[]): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (rules.length === 0) {
    ctx.sendLog('info', 'Motor mixer: no rules to set');
    return true;
  }

  ctx.sendLog('info', 'Setting motor mixer via MSP', `${rules.length} motors`);

  for (let i = 0; i < rules.length; i++) {
    const rule = rules[i];
    const payload = serializeMotorMixerRule(i, rule);

    try {
      await sendMspV2RequestWithPayload(MSP2.COMMON_SET_MOTOR_MIXER, payload, 1000);
      ctx.sendLog('info', `Motor ${i} set`, `T=${rule.throttle} R=${rule.roll} P=${rule.pitch} Y=${rule.yaw}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MSP] Failed to set motor ${i}:`, msg);
      return false;
    }
  }

  ctx.sendLog('info', 'Motor mixer rules set via MSP', `${rules.length} motors`);
  return true;
}
