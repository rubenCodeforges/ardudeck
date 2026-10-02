/**
 * MSP Commands
 *
 * saveEeprom, calibrate, reboot, resetMspCliFlags, resetSitlAutoConfig.
 */

import { MSP, deserializeCalibrationData, type MSPCalibrationData } from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import { sendMspRequest, withConfigLock } from './msp-transport.js';
import { stopMspTelemetry } from './msp-telemetry.js';
import { cleanupMspConnection } from './msp-cleanup.js';
import { enterCliMode, isCliModeActive } from '../cli/cli-handlers.js';
import { t } from '../../shared/i18n/index.js';

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
    ctx.sendLog('info', 'In CLI mode, will use CLI save'); // i18n-exempt
    return await saveEepromViaCli();
  }

  return withConfigLock(async () => {
    try {
      ctx.sendLog('info', 'Saving to EEPROM...'); // i18n-exempt
      await sendMspRequest(MSP.EEPROM_WRITE, 5000);
      ctx.sendLog('info', 'Settings saved to EEPROM'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] EEPROM_WRITE failed:', msg);
      ctx.sendLog('error', 'EEPROM save failed', msg);
      return false;
    }
  });
}

export async function saveEepromViaCli(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    ctx.sendLog('info', 'CLI fallback', 'Saving via CLI (board will reboot)'); // i18n-exempt

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
        reason: 'Saving configuration', // i18n-exempt
        delayMs: 4000,
        timeoutMs: 6000,
        maxAttempts: 12,
      });
    }

    await ctx.currentTransport.write(new TextEncoder().encode('save\n'));

    ctx.sendLog('info', 'Settings saved via CLI', 'Board will reboot'); // i18n-exempt

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

export async function readCalibrationData(): Promise<MSPCalibrationData | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  try {
    const payload = await sendMspRequest(MSP.CALIBRATION_DATA, 2000);
    return deserializeCalibrationData(payload);
  } catch (error) {
    console.error('[MSP] Read calibration data failed:', error);
    return null;
  }
}

/**
 * Save calibration data to bootloader persistent storage (INAV only).
 * Uses CLI command `cali_save` which writes to a special flash partition
 * that survives firmware updates.
 *
 * Flow: enter CLI -> send `cali_save` -> read response -> exit CLI (reboots board)
 */
export async function saveCalibrationPersistent(): Promise<{ success: boolean; error?: string }> {
  if (!ctx.currentTransport?.isOpen) {
    return { success: false, error: t('main:msp.notConnected') };
  }

  const wasInCliMode = isCliModeActive();

  try {
    // Enter CLI mode if not already
    if (!wasInCliMode) {
      const entered = await enterCliMode();
      if (!entered) {
        return { success: false, error: t('main:cliHandlers.enterCliFailed') };
      }
    }

    // Use the same pattern as getCliDump: temporarily capture transport data
    // enterCliMode sets up its own listener that forwards to renderer, so we
    // need to intercept at the transport level to read the response
    let response = '';
    let lastDataTime = Date.now();
    const responseListener = (data: Uint8Array) => {
      response += new TextDecoder().decode(data);
      lastDataTime = Date.now();
    };

    if (!ctx.currentTransport?.isOpen) {
      return { success: false, error: t('main:cliHandlers.transportClosedDuringSetup') };
    }

    // Add a second listener (CLI handler's listener still runs for terminal display)
    ctx.currentTransport.on('data', responseListener);

    // Send cali_save command
    await ctx.currentTransport.write(new TextEncoder().encode('cali_save\n'));

    // Wait for response (cali_save is quick)
    const startTime = Date.now();
    const maxWait = 5000;
    const idleTimeout = 500;

    while (Date.now() - startTime < maxWait) {
      await new Promise(r => setTimeout(r, 200));
      if (Date.now() - lastDataTime > idleTimeout && response.length > 0) {
        break;
      }
    }

    // Remove our listener
    if (ctx.currentTransport?.isOpen) {
      ctx.currentTransport.off('data', responseListener as (...args: unknown[]) => void);
    }

    // Check for error in response
    const responseLower = response.toLowerCase();
    if (responseLower.includes('unknown command') || responseLower.includes('invalid')) {
      // Exit CLI if we entered it
      if (!wasInCliMode) {
        const { exitCliMode } = await import('../cli/cli-handlers.js');
        await exitCliMode();
      }
      return { success: false, error: 'Board does not support cali_save — persistent storage may not be available on this board' };
    }

    // Exit CLI mode if we entered it (sends 'exit' which reboots)
    if (!wasInCliMode) {
      const { exitCliMode } = await import('../cli/cli-handlers.js');
      await exitCliMode();
    }

    ctx.sendLog('info', 'Calibration saved to persistent storage'); // i18n-exempt
    return { success: true };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    ctx.sendLog('error', 'Failed to save calibration to persistent storage', msg); // i18n-exempt

    // Try to exit CLI mode on error
    if (!wasInCliMode && isCliModeActive()) {
      try {
        const { exitCliMode } = await import('../cli/cli-handlers.js');
        await exitCliMode();
      } catch {
        // Ignore cleanup errors
      }
    }

    return { success: false, error: msg };
  }
}

export async function reboot(autoReconnect = true): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    if (autoReconnect) {
      const scheduleReconnect = (globalThis as Record<string, unknown>).__ardudeck_scheduleReconnect as
        ((options: { reason: string; delayMs: number; timeoutMs?: number; maxAttempts?: number }) => void) | undefined;

      if (scheduleReconnect) {
        scheduleReconnect({
          reason: 'Rebooting board', // i18n-exempt
          delayMs: 3000,
          timeoutMs: 60000,
          maxAttempts: 30,
        });
      }
    }

    await sendMspRequest(MSP.REBOOT, 1000);
    return true;
  } catch {
    return true;
  }
}
