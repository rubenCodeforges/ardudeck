/**
 * MSP Commands
 *
 * saveEeprom, calibrate, reboot, resetMspCliFlags, resetSitlAutoConfig.
 */

import { MSP } from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import { sendMspRequest, withConfigLock } from './msp-transport.js';
import { stopMspTelemetry } from './msp-telemetry.js';
import { cleanupMspConnection } from './msp-cleanup.js';

export function resetMspCliFlags(): void {
  console.log('[MSP] Resetting all CLI mode flags');
  ctx.servoCliModeActive = false;
  ctx.tuningCliModeActive = false;
}

export function resetSitlAutoConfig(): void {
  ctx.skipSitlAutoConfig = false;
}

export async function saveEeprom(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    ctx.sendLog('error', 'Cannot save to EEPROM - not connected');
    return false;
  }

  if (ctx.servoCliModeActive || ctx.tuningCliModeActive) {
    ctx.sendLog('info', 'In CLI mode, will use CLI save');
    return await saveEepromViaCli();
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      ctx.sendLog('info', 'Saving to EEPROM...');
      await sendMspRequest(MSP.EEPROM_WRITE, 5000);
      ctx.sendLog('info', 'Settings saved to EEPROM');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] EEPROM_WRITE failed:', msg);
      if (msg.includes('not supported')) {
        ctx.sendLog('warn', 'MSP EEPROM_WRITE not supported, trying CLI...');
        return null;
      }
      ctx.sendLog('error', 'EEPROM save failed', msg);
      return false;
    }
  });

  if (mspSuccess !== null) return mspSuccess;
  return await saveEepromViaCli();
}

export async function saveEepromViaCli(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    ctx.sendLog('info', 'CLI fallback', 'Saving via CLI (board will reboot)');

    stopMspTelemetry();

    if (!ctx.servoCliModeActive && !ctx.tuningCliModeActive) {
      await ctx.currentTransport.write(new Uint8Array([0x23]));
      await new Promise(r => setTimeout(r, 1000));
    }

    // Apply pending mixer type if set
    if (ctx.pendingMixerType !== null) {
      const mixerTypeToName: Record<number, string> = {
        0: 'TRI', 3: 'QUADX', 5: 'GIMBAL', 8: 'FLYING_WING', 14: 'AIRPLANE', 24: 'CUSTOM_AIRPLANE',
      };
      const mixerName = mixerTypeToName[ctx.pendingMixerType] ?? `MIXER_${ctx.pendingMixerType}`;

      ctx.sendLog('info', `CLI: Setting mixer ${mixerName}`);

      if (ctx.cliResponseListener && ctx.currentTransport) {
        ctx.currentTransport.off('data', ctx.cliResponseListener as (...args: unknown[]) => void);
        ctx.cliResponseListener = null;
      }
      if (ctx.tuningCliListener && ctx.currentTransport) {
        ctx.currentTransport.off('data', ctx.tuningCliListener as (...args: unknown[]) => void);
        ctx.tuningCliListener = null;
      }

      await ctx.currentTransport.write(new TextEncoder().encode('\n'));
      await new Promise(r => setTimeout(r, 300));

      const mixerCmd = `mixer ${mixerName}\n`;
      await ctx.currentTransport.write(new TextEncoder().encode(mixerCmd));
      await new Promise(r => setTimeout(r, 1000));

      ctx.pendingMixerType = null;
    }

    await new Promise(r => setTimeout(r, 500));

    const scheduleReconnect = (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect as
      ((options: { reason: string; delayMs: number; timeoutMs?: number; maxAttempts?: number }) => void) | undefined;

    if (scheduleReconnect) {
      scheduleReconnect({
        reason: 'Saving configuration',
        delayMs: 4000,
        timeoutMs: 6000,
        maxAttempts: 12,
      });
    }

    await ctx.currentTransport.write(new TextEncoder().encode('save\n'));

    ctx.sendLog('info', 'Settings saved via CLI', 'Board will reboot');

    await new Promise(r => setTimeout(r, 2000));

    if (ctx.tuningCliListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.tuningCliListener as (...args: unknown[]) => void);
      ctx.tuningCliListener = null;
    }
    ctx.tuningCliResponse = '';

    if (ctx.cliResponseListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.cliResponseListener as (...args: unknown[]) => void);
      ctx.cliResponseListener = null;
    }

    ctx.tuningCliModeActive = false;
    ctx.servoCliModeActive = false;

    cleanupMspConnection();

    return true;
  } catch (error) {
    console.error('[MSP] CLI EEPROM save failed:', error);
    ctx.sendLog('error', 'CLI save failed', error instanceof Error ? error.message : String(error));

    if (ctx.tuningCliListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.tuningCliListener as (...args: unknown[]) => void);
      ctx.tuningCliListener = null;
    }
    if (ctx.cliResponseListener && ctx.currentTransport) {
      ctx.currentTransport.off('data', ctx.cliResponseListener as (...args: unknown[]) => void);
      ctx.cliResponseListener = null;
    }
    ctx.tuningCliModeActive = false;
    ctx.servoCliModeActive = false;
    ctx.pendingMixerType = null;

    return false;
  }
}

export async function calibrateAcc(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    await sendMspRequest(MSP.ACC_CALIBRATION, 5000);
    return true;
  } catch (error) {
    console.error('[MSP] ACC calibration failed:', error);
    return false;
  }
}

export async function calibrateMag(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    await sendMspRequest(MSP.MAG_CALIBRATION, 5000);
    return true;
  } catch (error) {
    console.error('[MSP] MAG calibration failed:', error);
    return false;
  }
}

export const calibrateAccFromHandler = calibrateAcc;
export const calibrateMagFromHandler = calibrateMag;

export async function reboot(autoReconnect = true): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    if (autoReconnect) {
      const scheduleReconnect = (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect as
        ((options: { reason: string; delayMs: number; timeoutMs?: number; maxAttempts?: number }) => void) | undefined;

      if (scheduleReconnect) {
        scheduleReconnect({
          reason: 'Rebooting board',
          delayMs: 3000,
          timeoutMs: 5000,
          maxAttempts: 10,
        });
      }
    }

    await sendMspRequest(MSP.REBOOT, 1000);
    return true;
  } catch {
    return true;
  }
}
