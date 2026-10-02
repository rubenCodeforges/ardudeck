/**
 * MSP PID & Rates
 *
 * PID get/set + RC tuning get/set.
 */

import {
  MSP,
  MSP2,
  deserializePid,
  serializePid,
  deserializeRcTuning,
  deserializeRcTuningInav,
  serializeRcTuning,
  deserializeInavRateProfile,
  serializeInavRateProfile,
  rcTuningToInavRateProfile,
  inavRateProfileToRcTuning,
  deserializeInavPid,
  serializeInavPid,
  inavPidToPid,
  pidToInavPid,
  mergeInavPid,
  type MSPPid,
  type MSPRcTuning,
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

export async function getPid(): Promise<MSPPid | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      ctx.sendLog('info', 'Reading PIDs from FC...'); // i18n-exempt

      if (ctx.usesMsp2Pid()) {
        const payload = await sendMspV2Request(MSP2.INAV_PID, 2000);
        const inavPid = deserializeInavPid(payload);
        ctx.cachedInavPid = inavPid;
        const pid = inavPidToPid(inavPid);
        ctx.sendLog('info', `PIDs loaded: Roll P=${pid.roll.p} I=${pid.roll.i} D=${pid.roll.d}`);
        return pid;
      }

      const payload = await sendMspRequest(MSP.PID, 2000);
      const pid = deserializePid(payload);
      ctx.sendLog('info', `PIDs loaded: Roll P=${pid.roll.p} I=${pid.roll.i} D=${pid.roll.d}`);
      return pid;
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] Get PID failed:', msg);
        ctx.sendLog('error', 'Get PID failed', msg);
      }
      return null;
    }
  });
}

export async function setPid(pid: MSPPid): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    ctx.sendLog('error', 'Cannot set PIDs - not connected');
    return false;
  }

  if (ctx.usesMsp2Pid()) {
    return withConfigLock(async () => {
      try {
        if (!ctx.cachedInavPid) {
          ctx.sendLog('info', 'Reading current PIDs before saving...'); // i18n-exempt
          const payload = await sendMspV2Request(MSP2.INAV_PID, 2000);
          ctx.cachedInavPid = deserializeInavPid(payload);
        }

        const partialUpdates = pidToInavPid(pid);
        const fullPid = mergeInavPid(ctx.cachedInavPid, partialUpdates);
        ctx.cachedInavPid = fullPid;

        const payload = serializeInavPid(fullPid);
        ctx.sendLog('info', `Sending PIDs via MSP2 (${payload.length} bytes)...`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_PID, payload, 2000);
        ctx.sendLog('info', 'PIDs sent to FC (MSP2)');
        return true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] SET_INAV_PID failed:', msg);
        ctx.sendLog('error', 'Failed to set PIDs (MSP2)', msg); // i18n-exempt
        return false;
      }
    });
  }

  return withConfigLock(async () => {
    try {
      const payload = serializePid(pid);
      ctx.sendLog('info', `Sending PIDs (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_PID, payload, 2000);
      ctx.sendLog('info', 'PIDs sent to FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_PID failed:', msg);
      ctx.sendLog('error', 'Failed to set PIDs', msg); // i18n-exempt
      return false;
    }
  });
}

export async function getRcTuning(): Promise<MSPRcTuning | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspV2Request(MSP2.INAV_RATE_PROFILE, 2000);
      const inavProfile = deserializeInavRateProfile(payload);
      ctx.cachedInavRateProfile = inavProfile;
      const rcTuning = inavRateProfileToRcTuning(inavProfile);
      ctx.sendLog('info', `Rates loaded (iNav): roll=${rcTuning.rollRate} pitch=${rcTuning.pitchRate} yaw=${rcTuning.yawRate}`);
      return rcTuning;
    } catch (error) {
      if (isCliModeBlockedError(error)) return null;
    }

    try {
      ctx.sendLog('info', 'Reading rates from FC...'); // i18n-exempt
      const payload = await sendMspRequest(MSP.RC_TUNING, 2000);
      const rcTuning = ctx.isInavFirmware ? deserializeRcTuningInav(payload) : deserializeRcTuning(payload);
      ctx.sendLog('info', `Rates loaded: roll=${rcTuning.rollRate} pitch=${rcTuning.pitchRate} yaw=${rcTuning.yawRate}`);
      return rcTuning;
    } catch (error) {
      if (!isCliModeBlockedError(error)) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] Get RC_TUNING failed:', msg);
        ctx.sendLog('error', 'Get rates failed', msg);
      }
      return null;
    }
  });
}

export async function setRcTuning(rcTuning: MSPRcTuning): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    ctx.sendLog('error', 'Cannot set rates - not connected');
    return false;
  }

  if (ctx.isInavFirmware) {
    return withConfigLock(async () => {
      try {
        // MSPRcTuning cannot carry MANUAL rates, so merge onto the profile read from the FC.
        if (!ctx.cachedInavRateProfile) {
          const current = await sendMspV2Request(MSP2.INAV_RATE_PROFILE, 2000);
          ctx.cachedInavRateProfile = deserializeInavRateProfile(current);
        }
        const inavProfile = rcTuningToInavRateProfile(rcTuning, ctx.cachedInavRateProfile);
        const payload = serializeInavRateProfile(inavProfile);
        ctx.sendLog('info', `Sending rates via MSP2 0x2008 (${payload.length} bytes)...`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_RATE_PROFILE, payload, 2000);
        ctx.cachedInavRateProfile = inavProfile;
        ctx.sendLog('info', 'Rates sent to FC (iNav MSP2)'); // i18n-exempt
        return true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] INAV_SET_RATE_PROFILE failed:', msg);
        ctx.sendLog('error', 'Failed to set rates', msg); // i18n-exempt
        return false;
      }
    });
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeRcTuning(rcTuning);
      ctx.sendLog('info', `Sending rates via MSP 204 (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_RC_TUNING, payload, 2000);
      ctx.sendLog('info', 'Rates sent to FC'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_RC_TUNING failed:', msg);
      ctx.sendLog('error', 'Failed to set rates', msg); // i18n-exempt
      return false;
    }
  });
}
