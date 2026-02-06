/**
 * MSP Modes
 *
 * Mode ranges, box names/IDs, features, status, active boxes.
 */

import {
  MSP,
  MSP2,
  deserializeModeRanges,
  serializeModeRange,
  deserializeBoxNames,
  deserializeBoxIds,
  deserializeFeatureConfig,
  serializeFeatureConfig,
  deserializeStatus,
  deserializeInavStatus,
  type MSPModeRange,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspRequest,
  sendMspRequestWithPayload,
  sendMspV2Request,
  withConfigLock,
  isCliModeBlockedError,
} from './msp-transport.js';
import { stopMspTelemetry, startMspTelemetry } from './msp-telemetry.js';

export async function getModeRanges(): Promise<MSPModeRange[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const timeout = ctx.isInavFirmware ? 2000 : 500;
      const payload = await sendMspRequest(MSP.MODE_RANGES, timeout);
      const modes = deserializeModeRanges(payload);
      const activeModes = modes.filter(m => m.rangeEnd > m.rangeStart);
      ctx.unsupportedCommands.delete(MSP.MODE_RANGES);
      return activeModes;
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] getModeRanges failed:', errorMsg);
        if (!ctx.unsupportedCommands.has(MSP.MODE_RANGES)) {
          ctx.unsupportedCommands.add(MSP.MODE_RANGES);
        }
      }
      return null;
    }
  });
}

export async function getBoxNames(): Promise<string[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.BOXNAMES, 2000);
      return deserializeBoxNames(payload);
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        console.error('[MSP] getBoxNames failed:', error);
      }
      return null;
    }
  });
}

export async function getBoxIds(): Promise<number[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.BOXIDS, 2000);
      return deserializeBoxIds(payload);
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        console.error('[MSP] getBoxIds failed:', error);
      }
      return null;
    }
  });
}

export async function setModeRange(index: number, mode: MSPModeRange): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    ctx.sendLog('error', 'Cannot set mode - not connected');
    return false;
  }

  if (ctx.tuningCliModeActive) {
    return await setModeRangeViaCli(index, mode);
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeModeRange(index, mode);
      if (mode.rangeEnd > mode.rangeStart) {
        ctx.sendLog('info', `Setting mode ${index}: boxId=${mode.boxId} aux=${mode.auxChannel} range=${mode.rangeStart}-${mode.rangeEnd}`);
      }
      await sendMspRequestWithPayload(MSP.SET_MODE_RANGE, payload, 2000);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MSP] SET_MODE_RANGE[${index}] failed:`, msg);
      if (msg.includes('not supported') || msg.includes('timed out') || msg.includes('timeout')) {
        ctx.sendLog('warn', `MSP SET_MODE_RANGE failed (${msg}), trying CLI...`);
        return null;
      }
      ctx.sendLog('error', `Failed to set mode ${index}`, msg);
      return false;
    }
  });

  if (mspSuccess !== null) return mspSuccess;
  return await setModeRangeViaCli(index, mode);
}

export async function setModeRangeViaCli(index: number, mode: MSPModeRange): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    if (!ctx.tuningCliModeActive) {
      ctx.tuningCliModeActive = true;
      stopMspTelemetry();
      ctx.sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');
      await ctx.currentTransport.write(new Uint8Array([0x23]));
      await new Promise(r => setTimeout(r, 500));
      if (!ctx.currentTransport?.isOpen) {
        ctx.tuningCliModeActive = false;
        startMspTelemetry();
        return false;
      }
    }

    const startStep = Math.round((mode.rangeStart - 900) / 25);
    const endStep = Math.round((mode.rangeEnd - 900) / 25);
    const cmd = `aux ${index} ${mode.boxId} ${mode.auxChannel} ${startStep} ${endStep} 0`;
    await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
    await new Promise(r => setTimeout(r, 100));
    return true;
  } catch (error) {
    console.error('[MSP] CLI mode set failed:', error);
    return false;
  }
}

export async function getFeatures(): Promise<number | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.FEATURE_CONFIG, 1000);
      const config = deserializeFeatureConfig(payload);
      console.log('[MSP] getFeatures:', config.features, 'binary:', config.features.toString(2).padStart(32, '0'));
      return config.features;
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        console.error('[MSP] getFeatures failed:', error);
      }
      return null;
    }
  });
}

export async function setFeatures(features: number): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const payload = serializeFeatureConfig({ features });
      await sendMspRequestWithPayload(MSP.SET_FEATURE_CONFIG, payload, 1000);
      await new Promise(r => setTimeout(r, 50));
      const verifyPayload = await sendMspRequest(MSP.FEATURE_CONFIG, 1000);
      const verified = deserializeFeatureConfig(verifyPayload);
      if (verified.features !== features) {
        console.error('[MSP] setFeatures failed: wrote', features, 'but read back', verified.features);
        return false;
      }
      return true;
    } catch (error) {
      console.error('[MSP] setFeatures failed:', error);
      return false;
    }
  });
}

export async function getStatus(): Promise<{ activeSensors: number; armingFlags: number; flightModeFlags: number } | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      if (ctx.isInavFirmware) {
        const payload = await sendMspV2Request(MSP2.INAV_STATUS, 1000);
        const status = deserializeInavStatus(payload);
        return { activeSensors: status.activeSensors, armingFlags: status.armingDisableFlags, flightModeFlags: status.flightModeFlags };
      } else {
        const payload = await sendMspRequest(MSP.STATUS, 500);
        const status = deserializeStatus(payload);
        return { activeSensors: status.activeSensors, armingFlags: status.armingDisableFlags || 0, flightModeFlags: status.flightModeFlags };
      }
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        console.error('[MSP] getStatus failed:', error);
      }
      return null;
    }
  });
}

export async function getActiveBoxes(): Promise<{ boxModes: number } | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  try {
    await sendMspRequest(MSP.BOXIDS, 200);
    const statusPayload = await sendMspRequest(MSP.STATUS, 200);
    const status = deserializeStatus(statusPayload);
    return { boxModes: status.flightModeFlags };
  } catch (error) {
    console.error('[MSP] getActiveBoxes failed:', error);
    return null;
  }
}
