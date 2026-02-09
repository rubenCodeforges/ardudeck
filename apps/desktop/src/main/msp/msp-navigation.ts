/**
 * MSP Navigation
 *
 * Waypoints, mission, nav config, GPS config + CLI fallbacks.
 */

import {
  MSP,
  MSP2,
  deserializeMissionInfo,
  deserializeWaypoint,
  serializeWaypoint,
  MSP_WP_ACTION,
  MSP_WP_FLAG,
  deserializeNavConfig,
  serializeNavConfig,
  deserializeGpsConfig,
  serializeGpsConfig,
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
import { stopMspTelemetry } from './msp-telemetry.js';

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
    ctx.sendLog('warn', 'Waypoints only supported on iNav');
    return null;
  }

  return withConfigLock(async () => {
    try {
      const infoPayload = await sendMspRequest(MSP.WP_GETINFO, 1000);
      const info = deserializeMissionInfo(infoPayload);
      ctx.sendLog('info', `Mission info: ${info.waypointCount} waypoints, valid=${info.isValid}, max=${info.waypointListMaximum}`);

      if (info.waypointCount === 0) {
        ctx.sendLog('info', 'No waypoints on FC');
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
      ctx.sendLog('error', 'Failed to download waypoints', msg);
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
    ctx.sendLog('warn', 'Waypoints only supported on iNav');
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
    ctx.sendLog('warn', 'Waypoints only supported on iNav');
    return false;
  }

  if (waypoints.length === 0) {
    ctx.sendLog('info', 'No waypoints to upload');
    return true;
  }

  return withConfigLock(async () => {
    try {
      ctx.sendLog('info', `Uploading ${waypoints.length} waypoints...`);

      for (let i = 0; i < waypoints.length; i++) {
        const wp = waypoints[i];
        const wpWithNo = { ...wp, wpNo: i + 1 };
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
      ctx.sendLog('error', 'Failed to upload waypoints', msg);
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
    ctx.sendLog('warn', 'Waypoints only supported on iNav');
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = new Uint8Array([0]);
      await sendMspRequestWithPayload(MSP.WP_MISSION_SAVE, payload, 3000);
      ctx.sendLog('info', 'Mission saved to EEPROM');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Save waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to save mission to EEPROM', msg);
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
    ctx.sendLog('warn', 'Waypoints only supported on iNav');
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

      ctx.sendLog('info', 'Mission cleared from FC');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Clear waypoints failed:', msg);
      ctx.sendLog('error', 'Failed to clear mission', msg);
      return false;
    }
  });
}

// =============================================================================
// Navigation Configuration (iNav)
// =============================================================================

export async function getNavConfig(): Promise<Partial<MSPNavConfig> | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      try {
        const payload = await sendMspV2Request(MSP2.INAV_RTH_AND_LAND_CONFIG, 1000);
        return deserializeNavConfig(payload);
      } catch {
        return null;
      }
    } catch (error) {
      console.error('[MSP] Get Nav Config failed:', error);
      return null;
    }
  });
}

export async function setNavConfig(config: Partial<MSPNavConfig>): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeNavConfig(config);
      await sendMspV2RequestWithPayload(MSP2.INAV_SET_RTH_AND_LAND_CONFIG, payload, 2000);
      ctx.sendLog('info', 'Navigation config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_NAV_CONFIG failed:', msg);
      if (msg.includes('not supported') || msg.includes('timed out')) {
        ctx.sendLog('warn', 'MSP2 nav config not supported, trying CLI...');
        return null;
      }
      ctx.sendLog('error', 'Failed to set nav config', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  return await setNavConfigViaCli(config);
}

async function setNavConfigViaCli(config: Partial<MSPNavConfig>): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    ctx.sendLog('info', 'CLI fallback', 'Setting nav config via CLI');

    stopMspTelemetry();
    await ctx.currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    const commands: string[] = [];

    if (config.rthAltitude !== undefined) {
      commands.push(`set nav_rth_altitude = ${config.rthAltitude}`);
    }
    if (config.rthAllowLanding !== undefined) {
      const landingModes = ['NEVER', 'ALWAYS', 'FS_ONLY'];
      commands.push(`set nav_rth_allow_landing = ${landingModes[config.rthAllowLanding] || 'ALWAYS'}`);
    }
    if (config.landDescendRate !== undefined) {
      commands.push(`set nav_land_descend_rate = ${config.landDescendRate}`);
    }
    if (config.landSlowdownMinAlt !== undefined) {
      commands.push(`set nav_land_slowdown_minalt = ${config.landSlowdownMinAlt}`);
    }
    if (config.landSlowdownMaxAlt !== undefined) {
      commands.push(`set nav_land_slowdown_maxalt = ${config.landSlowdownMaxAlt}`);
    }
    if (config.emergencyDescendRate !== undefined) {
      commands.push(`set nav_emerg_landing_speed = ${config.emergencyDescendRate}`);
    }

    for (const cmd of commands) {
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }

    return true;
  } catch (error) {
    console.error('[MSP] CLI nav config failed:', error);
    return false;
  }
}

export async function getGpsConfig(): Promise<MSPGpsConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.GPS_CONFIG, 1000);
      return deserializeGpsConfig(payload);
    } catch (error) {
      console.error('[MSP] Get GPS Config failed:', error);
      return null;
    }
  });
}

export async function setGpsConfig(config: MSPGpsConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  const mspSuccess = await withConfigLock(async () => {
    try {
      const payload = serializeGpsConfig(config);
      await sendMspRequestWithPayload(MSP.SET_GPS_CONFIG, payload, 2000);
      ctx.sendLog('info', 'GPS config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_GPS_CONFIG failed:', msg);
      if (msg.includes('not supported')) {
        ctx.sendLog('warn', 'MSP SET_GPS_CONFIG not supported, trying CLI...');
        return null;
      }
      ctx.sendLog('error', 'Failed to set GPS config', msg);
      return false;
    }
  });

  if (mspSuccess !== null) {
    return mspSuccess;
  }

  return await setGpsConfigViaCli(config);
}

async function setGpsConfigViaCli(config: MSPGpsConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  try {
    ctx.sendLog('info', 'CLI fallback', 'Setting GPS config via CLI');

    stopMspTelemetry();
    await ctx.currentTransport.write(new Uint8Array([0x23])); // '#'
    await new Promise(r => setTimeout(r, 500));

    const providerNames = ['NMEA', 'UBLOX', 'MSP', 'FAKE'];
    const sbasNames = ['AUTO', 'EGNOS', 'WAAS', 'MSAS', 'GAGAN', 'NONE'];

    const commands = [
      `set gps_provider = ${providerNames[config.provider] || 'UBLOX'}`,
      `set gps_sbas_mode = ${sbasNames[config.sbasMode] || 'AUTO'}`,
      `set gps_auto_config = ${config.autoConfig ? 'ON' : 'OFF'}`,
      `set gps_auto_baud = ${config.autoBaud ? 'ON' : 'OFF'}`,
    ];

    for (const cmd of commands) {
      await ctx.currentTransport.write(new TextEncoder().encode(cmd + '\n'));
      await new Promise(r => setTimeout(r, 100));
    }

    return true;
  } catch (error) {
    console.error('[MSP] CLI GPS config failed:', error);
    return false;
  }
}
