/**
 * MSP Navigation
 *
 * Waypoints, mission, nav config, GPS config.
 */

import {
  MSP,
  MSP2,
  deserializeMissionInfo,
  deserializeWaypoint,
  serializeWaypoint,
  MSP_WP_ACTION,
  MSP_WP_FLAG,
  deserializeGpsConfig,
  serializeGpsConfig,
  INAV_NAV_SETTING_NAMES,
  INAV_GPS_SETTING_NAMES,
  navConfigFromSettings,
  navConfigToSettingWrites,
  gpsConfigFromInav,
  planInavGpsWrite,
  type InavSettingValue,
  type MSPWaypoint,
  type MSPMissionInfo,
  type MSPNavConfig,
  type MSPGpsConfig,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspRequest,
  sendMspRequestWithPayload,
  sendMspV2Request,
  sendMspV2RequestWithPayload,
  withConfigLock,
} from './msp-transport.js';
import { getSetting, setSetting } from './msp-settings.js';

/**
 * Get mission info (waypoint count, validity)
 * Uses MSP_WP_GETINFO (20)
 */
export async function getMissionInfo(): Promise<MSPMissionInfo | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  if (!ctx.isInavFirmware) {
    return null;
  }

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.WP_GETINFO, 1000);
      const info = deserializeMissionInfo(payload);
      return info;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.warn('[MSP] Get mission info failed:', msg);
      return null;
    }
  });
}

/**
 * Get all waypoints from FC
 * Reads each waypoint sequentially using MSP_WP (118)
 */
export async function getWaypoints(): Promise<MSPWaypoint[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Waypoints only supported on iNav'); // i18n-exempt
    return null;
  }

  return withConfigLock(async () => {
    try {
      const infoPayload = await sendMspRequest(MSP.WP_GETINFO, 1000);
      const info = deserializeMissionInfo(infoPayload);
      ctx.sendLog('info', `Mission info: ${info.waypointCount} waypoints, valid=${info.isValid}, max=${info.waypointListMaximum}`);

      if (info.waypointCount === 0) {
        ctx.sendLog('info', 'No waypoints on FC'); // i18n-exempt
        return [];
      }

      const waypoints: MSPWaypoint[] = [];

      for (let i = 1; i <= info.waypointCount; i++) {
        const requestPayload = new Uint8Array([i]);
        const wpPayload = await sendMspRequestWithPayload(MSP.WP, requestPayload, 1000);
        const wp = deserializeWaypoint(wpPayload);
        waypoints.push(wp);
        await new Promise(r => setTimeout(r, 20));
      }

      ctx.sendLog('info', `Downloaded ${waypoints.length} waypoints from FC`);
      return waypoints;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to download waypoints', msg); // i18n-exempt
      return null;
    }
  });
}

/**
 * Set a single waypoint on FC
 * Uses MSP_SET_WP (209)
 */
export async function setWaypoint(wp: MSPWaypoint): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Waypoints only supported on iNav'); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeWaypoint(wp);
      await sendMspRequestWithPayload(MSP.SET_WP, payload, 1000);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error(`[MSP] Set waypoint ${wp.wpNo} failed:`, msg);
      ctx.sendLog('error', `Failed to set waypoint ${wp.wpNo}`, msg);
      return false;
    }
  });
}

/**
 * Upload all waypoints to FC
 * Writes each waypoint sequentially and saves to EEPROM
 */
export async function uploadWaypoints(waypoints: MSPWaypoint[]): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Waypoints only supported on iNav'); // i18n-exempt
    return false;
  }

  if (waypoints.length === 0) {
    ctx.sendLog('info', 'No waypoints to upload'); // i18n-exempt
    return true;
  }

  return withConfigLock(async () => {
    try {
      ctx.sendLog('info', `Uploading ${waypoints.length} waypoints...`);

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i]!;
        const wpWithNo: MSPWaypoint = { ...wp, wpNo: i + 1 };
        if (i === waypoints.length - 1) {
          wpWithNo.flag = MSP_WP_FLAG.LAST;
        } else {
          wpWithNo.flag = MSP_WP_FLAG.NORMAL;
        }

        const payload = serializeWaypoint(wpWithNo);
        await sendMspRequestWithPayload(MSP.SET_WP, payload, 1000);
        await new Promise(r => setTimeout(r, 50));
      }

      ctx.sendLog('info', `${waypoints.length} waypoints uploaded to FC`);
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Upload waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to upload waypoints', msg); // i18n-exempt
      return false;
    }
  });
}

/**
 * Save waypoints to NVRAM/EEPROM
 * Uses MSP_WP_MISSION_SAVE (19)
 */
export async function saveWaypoints(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Waypoints only supported on iNav'); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = new Uint8Array([0]);
      await sendMspRequestWithPayload(MSP.WP_MISSION_SAVE, payload, 3000);
      ctx.sendLog('info', 'Mission saved to EEPROM'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Save waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to save mission to EEPROM', msg); // i18n-exempt
      return false;
    }
  });
}

/**
 * Clear all waypoints from FC
 */
export async function clearWaypoints(): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Waypoints only supported on iNav'); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    try {
      const emptyWp: MSPWaypoint = {
        wpNo: 1,
        action: MSP_WP_ACTION.RTH,
        lat: 0,
        lon: 0,
        altitude: 0,
        p1: 0,
        p2: 0,
        p3: 0,
        flag: MSP_WP_FLAG.LAST,
      };
      const payload = serializeWaypoint(emptyWp);
      await sendMspRequestWithPayload(MSP.SET_WP, payload, 1000);

      const savePayload = new Uint8Array([0]);
      await sendMspRequestWithPayload(MSP.WP_MISSION_SAVE, savePayload, 3000);

      ctx.sendLog('info', 'Mission cleared from FC'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Clear waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to clear mission', msg); // i18n-exempt
      return false;
    }
  });
}

// =============================================================================
// Navigation Configuration (iNav) - named settings, as inav-configurator does
// =============================================================================

async function readSettingValues(names: string[]): Promise<Record<string, InavSettingValue>> {
  const values: Record<string, InavSettingValue> = {};
  for (const name of names) {
    const result = await getSetting(name);
    values[name] = result ? result.value : null;
  }
  return values;
}

async function writeSettingValues(writes: Record<string, string | number>): Promise<string | null> {
  for (const [name, value] of Object.entries(writes)) {
    if (!(await setSetting(name, value))) return name;
  }
  return null;
}

export async function getNavConfig(): Promise<Partial<MSPNavConfig> | null> {
  if (!ctx.currentTransport?.isOpen || !ctx.isInavFirmware) return null;

  return withConfigLock(async () => {
    try {
      const values = await readSettingValues(INAV_NAV_SETTING_NAMES);
      if (Object.values(values).every(v => v === null)) return null;
      return navConfigFromSettings(values);
    } catch (error) {
      console.error('[MSP] Get Nav Config failed:', error);
      return null;
    }
  });
}

export async function setNavConfig(config: Partial<MSPNavConfig>): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;
  if (!ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Navigation config is only available on iNav'); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    try {
      const current = await readSettingValues(INAV_NAV_SETTING_NAMES);
      const { writes, unsupported } = navConfigToSettingWrites(config, current);
      if (unsupported.length > 0) {
        ctx.sendLog('error', 'Nav config not saved', `The flight controller has no setting for: ${unsupported.join(', ')}`); // i18n-exempt
        return false;
      }
      const failed = await writeSettingValues(writes);
      if (failed) {
        ctx.sendLog('error', 'Failed to set nav config', `${failed} was rejected by the flight controller`); // i18n-exempt
        return false;
      }
      ctx.sendLog('info', 'Navigation config updated', `${Object.keys(writes).length} settings changed`); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      ctx.sendLog('error', 'Failed to set nav config', msg); // i18n-exempt
      return false;
    }
  });
}

// =============================================================================
// GPS Configuration
// =============================================================================

export async function getGpsConfig(): Promise<MSPGpsConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      if (ctx.isInavFirmware) {
        const misc = await sendMspV2Request(MSP2.INAV_MISC, 1000);
        const values = await readSettingValues(INAV_GPS_SETTING_NAMES);
        return gpsConfigFromInav(misc, values);
      }
      const payload = await sendMspRequest(MSP.GPS_CONFIG, 1000);
      return deserializeGpsConfig(payload);
    } catch (error) {
      console.error('[MSP] Get GPS Config failed:', error);
      return null;
    }
  });
}

export async function setGpsConfig(config: MSPGpsConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      if (!ctx.isInavFirmware) {
        await sendMspRequestWithPayload(MSP.SET_GPS_CONFIG, serializeGpsConfig(config), 2000);
        ctx.sendLog('info', 'GPS config updated');
        return true;
      }

      const currentMisc = await sendMspV2Request(MSP2.INAV_MISC, 1000);
      const current = await readSettingValues(INAV_GPS_SETTING_NAMES);
      const plan = planInavGpsWrite(config, currentMisc, current);
      if (plan.unsupported.length > 0) {
        ctx.sendLog('error', 'GPS config not saved', `Not available on this flight controller: ${plan.unsupported.join(', ')}`);
        return false;
      }
      if (plan.misc) {
        await sendMspV2RequestWithPayload(MSP2.INAV_SET_MISC, plan.misc, 2000);
      }
      const failed = await writeSettingValues(plan.writes);
      if (failed) {
        ctx.sendLog('error', 'Failed to set GPS config', `${failed} was rejected by the flight controller`); // i18n-exempt
        return false;
      }
      ctx.sendLog('info', 'GPS config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Set GPS config failed:', msg);
      ctx.sendLog('error', 'Failed to set GPS config', msg); // i18n-exempt
      return false;
    }
  });
}
