/**
 * MSP Mixer
 *
 * Mixer/platform config, autoConfigSitl, getMspVehicleType.
 */

import {
  MSP,
  MSP2,
  INAV_PLATFORM_TYPE,
  deserializeMixerConfig,
  serializeMixerConfig,
  deserializeInavMixerConfig,
  serializeInavMixerConfig,
  isMultirotorMixer,
  getMixerName,
  type MSPInavMixerConfig,
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
import { saveEeprom, reboot } from './msp-commands.js';

export async function getInavMixerConfig(): Promise<MSPInavMixerConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    if (!ctx.isInavFirmware) {
      try {
        const payload = await sendMspRequest(MSP.MIXER_CONFIG, 500);
        const legacyConfig = deserializeMixerConfig(payload);
        const isMultirotor = isMultirotorMixer(legacyConfig.mixer);
        const platformType = isMultirotor ? 0 : 1;
        ctx.currentPlatformType = platformType;

        const platformNames = ['MULTIROTOR', 'AIRPLANE'];
        ctx.sendLog('info', `Platform: ${platformNames[platformType]}`, `Mixer type: ${legacyConfig.mixer}`);

        return {
          yawMotorDirection: 1, yawJumpPreventionLimit: 200, motorStopOnLow: 0,
          platformType, hasFlaps: 0, appliedMixerPreset: legacyConfig.mixer,
          numberOfMotors: 0, numberOfServos: 0,
        };
      } catch (err) {
        if (!isCliModeBlockedError(err)) {
          console.error('[MSP] Betaflight mixer config failed:', err);
        }
        return null;
      }
    }

    // INAV answers the legacy MSP_MIXER_CONFIG with a fixed Quad-X, so it can't tell an
    // airplane from a quad; only MSP2_INAV_MIXER can. Retry once for a busy serial link.
    let lastError: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const payload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
        const config = deserializeInavMixerConfig(payload);
        ctx.currentPlatformType = config.platformType;

        const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
        const platformName = platformNames[config.platformType] ?? `UNKNOWN(${config.platformType})`;
        ctx.sendLog('info', `Platform: ${platformName}`, `Mixer: ${config.appliedMixerPreset}, Servos: ${config.numberOfServos}`);

        return config;
      } catch (err) {
        if (isCliModeBlockedError(err)) return null;
        lastError = err;
      }
    }
    const msg = lastError instanceof Error ? lastError.message : String(lastError);
    ctx.sendLog('warn', 'Could not read the platform type (MSP2_INAV_MIXER)', msg); // i18n-exempt
    return null;
  });
}

export async function autoConfigureSitlPlatform(profileName: string | null): Promise<boolean> {
  if (ctx.skipSitlAutoConfig) return false;
  if (!profileName) return false;

  const profileLower = profileName.toLowerCase();
  let expectedPlatform: number | null = null;

  if (profileLower.includes('airplane') || profileLower.includes('plane') || profileLower.includes('wing')) {
    expectedPlatform = INAV_PLATFORM_TYPE.AIRPLANE;
  } else if (profileLower.includes('quad') || profileLower.includes('copter') || profileLower.includes('multi')) {
    expectedPlatform = INAV_PLATFORM_TYPE.MULTIROTOR;
  } else if (profileLower.includes('tri')) {
    expectedPlatform = INAV_PLATFORM_TYPE.TRICOPTER;
  } else if (profileLower.includes('heli')) {
    expectedPlatform = INAV_PLATFORM_TYPE.HELICOPTER;
  }

  if (expectedPlatform === null) return false;

  const mixerConfig = await getInavMixerConfig();
  if (!mixerConfig) return false;

  const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];

  if (mixerConfig.platformType === expectedPlatform) return false;

  ctx.sendLog('info', `Auto-configuring SITL as ${platformNames[expectedPlatform]}`, `Profile: ${profileName}`);

  const success = await setInavPlatformType(expectedPlatform, undefined, true);
  if (success) {
    await saveEeprom();
    await new Promise(r => setTimeout(r, 200));
    reboot().catch(() => {});
    ctx.sendLog('info', 'SITL platform configured', 'Board will reboot - reconnect in a few seconds');
    return true;
  }

  console.error('[MSP] SITL auto-config: failed to set platform type');
  return false;
}

export async function getMspVehicleType(fcVariant: string): Promise<string | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  const INAV_PLATFORM_NAMES = ['Multirotor', 'Airplane', 'Helicopter', 'Tricopter', 'Rover', 'Boat'];

  if (fcVariant === 'INAV') {
    const mixerConfig = await getInavMixerConfig();
    if (mixerConfig) {
      return INAV_PLATFORM_NAMES[mixerConfig.platformType] ?? 'Unknown';
    }
  } else {
    const mixerConfig = await getMixerConfig();
    if (mixerConfig) {
      return mixerConfig.isMultirotor ? 'Multirotor' : 'Fixed-wing';
    }
  }

  return null;
}

export async function getMixerConfig(): Promise<{ mixer: number; isMultirotor: boolean } | null> {
  if (!ctx.currentTransport?.isOpen) return null;
  if (ctx.servoCliModeActive || ctx.tuningCliModeActive) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.MIXER_CONFIG, 2000);
      const config = deserializeMixerConfig(payload);
      const isMultirotor = isMultirotorMixer(config.mixer);
      return { mixer: config.mixer, isMultirotor };
    } catch (error) {
      console.error('[MSP] Get Mixer Config failed:', error);
      return null;
    }
  });
}

export async function setInavPlatformType(platformType: number, mixerType?: number, isAutoConfig = false): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (!isAutoConfig) {
    ctx.skipSitlAutoConfig = true;
  }

  const platformNames = ['MULTIROTOR', 'AIRPLANE', 'HELICOPTER', 'TRICOPTER', 'ROVER', 'BOAT'];
  const platformName = platformNames[platformType] ?? `UNKNOWN`;

  if (ctx.isLegacyInav() && mixerType !== undefined) {
    ctx.pendingMixerType = mixerType;
    ctx.sendLog('info', 'Legacy iNav', 'Mixer will be set when saving'); // i18n-exempt
    return true;
  }

  let msp2Success = false;
  try {
    msp2Success = await withConfigLock(async () => {
      ctx.sendLog('info', `Setting platform to: ${platformName}`);

      let currentConfig: MSPInavMixerConfig | null = null;
      try {
        const payload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
        currentConfig = deserializeInavMixerConfig(payload);
      } catch (readErr) {
        console.warn('[MSP] Could not read current iNav mixer config:', readErr);
        return false;
      }

      if (!currentConfig) return false;

      const newConfig: MSPInavMixerConfig = { ...currentConfig, platformType };

      try {
        const payload = serializeInavMixerConfig(newConfig);
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_MIXER, payload, 2000);
      } catch (writeErr) {
        console.warn('[MSP] MSP2 write failed:', writeErr);
        return false;
      }

      await new Promise(r => setTimeout(r, 100));

      try {
        const verifyPayload = await sendMspV2Request(MSP2.INAV_MIXER, 2000);
        const verified = deserializeInavMixerConfig(verifyPayload);

        if (verified.platformType !== platformType) {
          ctx.sendLog('warn', 'MSP2 write did not change platform',
            `Expected ${platformName}, got ${platformNames[verified.platformType] ?? verified.platformType}`);
          return false;
        }

        ctx.sendLog('info', `Platform verified: ${platformName}`, 'Save to EEPROM and reboot required'); // i18n-exempt
        return true;
      } catch (verifyErr) {
        console.warn('[MSP] Could not verify platform change:', verifyErr);
        return true;
      }
    });
  } catch (error) {
    console.error('[MSP] setInavPlatformType MSP2 failed:', error);
    msp2Success = false;
  }

  if (!msp2Success) {
    ctx.sendLog('error', `Platform not changed to ${platformName}`, 'The flight controller rejected or did not apply MSP2_INAV_SET_MIXER'); // i18n-exempt
    return false;
  }

  if (mixerType !== undefined) {
    const mixerTypeToName: Record<number, string> = {
      0: 'TRI', 3: 'QUADX', 5: 'GIMBAL', 8: 'FLYING_WING', 14: 'AIRPLANE', 24: 'CUSTOM_AIRPLANE',
    };
    const mixerName = mixerTypeToName[mixerType] ?? `MIXER_${mixerType}`;
    ctx.pendingMixerType = mixerType;
    ctx.sendLog('info', `Mixer ${mixerName} queued`, 'Will be applied when saving'); // i18n-exempt
  }

  return true;
}

export async function setMixerConfig(mixerType: number): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const mixerName = getMixerName(mixerType);
      ctx.sendLog('info', `Setting mixer to: ${mixerName} (${mixerType})`);

      const payload = serializeMixerConfig(mixerType);
      await sendMspRequestWithPayload(MSP.SET_MIXER_CONFIG, payload, 2000);

      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      ctx.sendLog('error', 'Failed to set mixer config', message); // i18n-exempt
      console.error('[MSP] Set Mixer Config failed:', error);
      return false;
    }
  });
}
