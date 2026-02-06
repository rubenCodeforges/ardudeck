/**
 * MSP PID & Rates
 *
 * PID get/set + RC tuning get/set + CLI fallbacks.
 */

import {
  MSP,
  MSP2,
  deserializePid,
  serializePid,
  deserializeRcTuning,
  deserializeRcTuningInav,
  serializeRcTuning,
  serializeRcTuningInav,
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
import { stopMspTelemetry, startMspTelemetry } from './msp-telemetry.js';

export async function getPid(): Promise<MSPPid | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      ctx.sendLog('info', 'Reading PIDs from FC...');

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
          ctx.sendLog('info', 'Reading current PIDs before saving...');
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
        ctx.sendLog('error', 'Failed to set PIDs (MSP2)', msg);
        return false;
      }
    });
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializePid(pid);
      ctx.sendLog('info', `Sending PIDs (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_PID, payload, 2000);
      ctx.sendLog('info', 'PIDs sent to FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_PID failed:', msg);
      if (msg.includes('not supported')) {
        ctx.sendLog('warn', 'MSP SET_PID not supported, trying CLI...');
        return null;
      }
      ctx.sendLog('error', 'Failed to set PIDs', msg);
      return false;
    }
  });

  if (mspSuccess !== null) return mspSuccess;
  return await setPidViaCli(pid);
}

export async function setPidViaCli(pid: MSPPid): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    if (!ctx.tuningCliModeActive) {
      ctx.tuningCliModeActive = true;
      stopMspTelemetry();

      for (const [, pending] of ctx.pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      ctx.pendingResponses.clear();

      await new Promise(r => setTimeout(r, 100));

      if (!ctx.currentTransport?.isOpen) {
        ctx.tuningCliModeActive = false;
        startMspTelemetry();
        return false;
      }

      ctx.tuningCliResponse = '';
      ctx.tuningCliListener = (data: Uint8Array) => {
        const text = new TextDecoder().decode(data);
        ctx.tuningCliResponse += text;
      };
      ctx.currentTransport.on('data', ctx.tuningCliListener);

      ctx.sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');
      await ctx.currentTransport.write(new Uint8Array([0x23]));
      await new Promise(r => setTimeout(r, 1000));

      if (ctx.tuningCliResponse.includes('CLI') || ctx.tuningCliResponse.includes('#')) {
      } else {
        console.warn('[MSP] CLI mode entry not confirmed, response:', ctx.tuningCliResponse.slice(0, 100));
      }
    }

    const isFixedWing = ctx.currentPlatformType === 1;
    const prefix = isFixedWing ? 'fw' : 'mc';
    const dTerm = isFixedWing ? 'ff' : 'd';

    const commands = [
      `set ${prefix}_p_roll = ${pid.roll.p}`,
      `set ${prefix}_i_roll = ${pid.roll.i}`,
      `set ${prefix}_${dTerm}_roll = ${pid.roll.d}`,
      `set ${prefix}_p_pitch = ${pid.pitch.p}`,
      `set ${prefix}_i_pitch = ${pid.pitch.i}`,
      `set ${prefix}_${dTerm}_pitch = ${pid.pitch.d}`,
      `set ${prefix}_p_yaw = ${pid.yaw.p}`,
      `set ${prefix}_i_yaw = ${pid.yaw.i}`,
      `set ${prefix}_${dTerm}_yaw = ${pid.yaw.d}`,
    ];

    for (const cmd of commands) {
      ctx.tuningCliResponse = '';
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 300));

      if (ctx.tuningCliResponse.includes('Invalid') || ctx.tuningCliResponse.includes('error')) {
        console.error('[MSP] CLI command failed:', ctx.tuningCliResponse);
        ctx.sendLog('error', 'CLI command failed', cmd);
      }
    }

    ctx.sendLog('info', 'PIDs set via CLI', `${isFixedWing ? 'Fixed-wing' : 'Multirotor'} - call save to persist`);
    return true;
  } catch (error) {
    console.error('[MSP] CLI PID set failed:', error);
    ctx.sendLog('error', 'CLI PID set failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function getRcTuning(): Promise<MSPRcTuning | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspV2Request(MSP2.INAV_RATE_PROFILE, 2000);
      const inavProfile = deserializeInavRateProfile(payload);
      const rcTuning = inavRateProfileToRcTuning(inavProfile);
      ctx.sendLog('info', `Rates loaded (iNav): roll=${rcTuning.rollRate} pitch=${rcTuning.pitchRate} yaw=${rcTuning.yawRate}`);
      return rcTuning;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
    }

    try {
      ctx.sendLog('info', 'Reading rates from FC...');
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

  if (ctx.tuningCliModeActive) {
    return await setRcTuningViaCli(rcTuning);
  }

  if (ctx.isInavFirmware) {
    const msp2Success = await withConfigLock(async () => {
      try {
        const inavProfile = rcTuningToInavRateProfile(rcTuning);
        const payload = serializeInavRateProfile(inavProfile);
        ctx.sendLog('info', `Sending rates via MSP2 0x2008 (${payload.length} bytes)...`);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_RATE_PROFILE, payload, 2000);
        ctx.sendLog('info', 'Rates sent to FC (iNav MSP2)');
        return true;
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] INAV_SET_RATE_PROFILE failed:', msg);
        if (msg.includes('not supported')) {
          ctx.sendLog('warn', 'MSP2 not supported, trying MSP1...');
          return null;
        }
        ctx.sendLog('error', 'Failed to set rates', msg);
        return false;
      }
    });

    if (msp2Success !== null) return msp2Success;
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = ctx.isInavFirmware ? serializeRcTuningInav(rcTuning) : serializeRcTuning(rcTuning);
      ctx.sendLog('info', `Sending rates via MSP 204 (${payload.length} bytes)...`);
      await sendMspRequestWithPayload(MSP.SET_RC_TUNING, payload, 2000);
      ctx.sendLog('info', 'Rates sent to FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_RC_TUNING failed:', msg);
      if (msg.includes('not supported')) {
        ctx.sendLog('warn', 'MSP not supported, trying CLI...');
        return null;
      }
      ctx.sendLog('error', 'Failed to set rates', msg);
      return false;
    }
  });

  if (mspSuccess !== null) return mspSuccess;
  return await setRcTuningViaCli(rcTuning);
}

export async function setRcTuningViaCli(rcTuning: MSPRcTuning): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    if (!ctx.tuningCliModeActive) {
      ctx.tuningCliModeActive = true;
      stopMspTelemetry();

      for (const [, pending] of ctx.pendingResponses) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('MSP cancelled - entering CLI mode'));
      }
      ctx.pendingResponses.clear();

      await new Promise(r => setTimeout(r, 100));

      if (!ctx.currentTransport?.isOpen) {
        ctx.tuningCliModeActive = false;
        startMspTelemetry();
        return false;
      }

      ctx.tuningCliResponse = '';
      ctx.tuningCliListener = (data: Uint8Array) => {
        ctx.tuningCliResponse += new TextDecoder().decode(data);
      };
      ctx.currentTransport.on('data', ctx.tuningCliListener);

      ctx.sendLog('info', 'CLI mode', 'Entering CLI for legacy tuning');
      await ctx.currentTransport.write(new Uint8Array([0x23]));
      await new Promise(r => setTimeout(r, 1000));
    }

    const rollRateDegSec = rcTuning.rollRate || rcTuning.rollPitchRate || 70;
    const pitchRateDegSec = rcTuning.pitchRate || rcTuning.rollPitchRate || 70;
    const yawRateDegSec = rcTuning.yawRate || 70;

    const rollRateStored = Math.max(4, Math.min(100, Math.round(rollRateDegSec / 10)));
    const pitchRateStored = Math.max(4, Math.min(100, Math.round(pitchRateDegSec / 10)));
    const yawRateStored = Math.max(4, Math.min(100, Math.round(yawRateDegSec / 10)));

    const commands: Array<{ cmd: string; critical?: boolean }> = [
      { cmd: `set rc_expo = ${rcTuning.rcExpo || 0}` },
      { cmd: `set rc_yaw_expo = ${rcTuning.rcYawExpo || 0}` },
      { cmd: `set roll_rate = ${rollRateStored}`, critical: true },
      { cmd: `set pitch_rate = ${pitchRateStored}`, critical: true },
      { cmd: `set yaw_rate = ${yawRateStored}` },
      { cmd: `set thr_mid = ${rcTuning.throttleMid || 50}` },
      { cmd: `set thr_expo = ${rcTuning.throttleExpo || 0}` },
    ];

    const altRateCommands = [
      { cmd: `set roll_rate = ${rollRateDegSec}`, name: 'roll_rate (full)' },
      { cmd: `set pitch_rate = ${pitchRateDegSec}`, name: 'pitch_rate (full)' },
      { cmd: `set mc_p_roll = ${rollRateStored}`, name: 'mc_p_roll' },
      { cmd: `set mc_p_pitch = ${pitchRateStored}`, name: 'mc_p_pitch' },
      { cmd: `set fw_p_roll = ${rollRateStored}`, name: 'fw_p_roll' },
      { cmd: `set fw_p_pitch = ${pitchRateStored}`, name: 'fw_p_pitch' },
    ];

    let rollRateFailed = false;
    let pitchRateFailed = false;

    for (const { cmd, critical } of commands) {
      ctx.tuningCliResponse = '';
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 300));

      const response = ctx.tuningCliResponse.trim();
      const failed = ctx.tuningCliResponse.includes('Invalid') || ctx.tuningCliResponse.includes('error');
      if (failed) {
        console.warn('[MSP] CLI command FAILED:', cmd);
        ctx.sendLog('warn', 'CLI command failed', `${cmd}: ${response.split('\n')[0]}`);
        if (critical && cmd.includes('roll_rate')) rollRateFailed = true;
        if (critical && cmd.includes('pitch_rate')) pitchRateFailed = true;
      }
    }

    if (rollRateFailed || pitchRateFailed) {
      ctx.sendLog('info', 'Trying alternative CLI commands...');

      for (const { cmd, name } of altRateCommands) {
        if (!rollRateFailed && cmd.includes('roll')) continue;
        if (!pitchRateFailed && cmd.includes('pitch')) continue;

        ctx.tuningCliResponse = '';
        await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
        await new Promise(r => setTimeout(r, 300));

        const failed = ctx.tuningCliResponse.includes('Invalid') || ctx.tuningCliResponse.includes('error');
        if (!failed) {
          ctx.sendLog('info', `Alternative worked: ${name}`);
          if (cmd.includes('roll')) rollRateFailed = false;
          if (cmd.includes('pitch')) pitchRateFailed = false;
        }
      }
    }

    if (rollRateFailed || pitchRateFailed) {
      ctx.sendLog('warn', 'Some rate commands failed', 'Check CLI parameter names for your firmware');
    } else {
      ctx.sendLog('info', 'Rates set via CLI', 'Call save to persist');
    }
    return true;
  } catch (error) {
    console.error('[MSP] CLI rates set failed:', error);
    ctx.sendLog('error', 'CLI rates set failed', error instanceof Error ? error.message : String(error));
    return false;
  }
}
