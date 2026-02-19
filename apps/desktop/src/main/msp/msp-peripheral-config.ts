/**
 * MSP Peripheral Config
 *
 * Failsafe, GPS rescue, filter, VTX, OSD, RX config.
 */

import {
  MSP,
  deserializeFailsafeConfig,
  serializeFailsafeConfig,
  deserializeGpsRescueConfig,
  serializeGpsRescueConfig,
  deserializeGpsRescuePids,
  serializeGpsRescuePids,
  deserializeFilterConfig,
  serializeFilterConfig,
  deserializeVtxConfig,
  serializeVtxConfig,
  deserializeOsdConfig,
  deserializeRxConfig,
  serializeRxConfig,
  SERIALRX_PROVIDER_NAMES,
  type MSPFailsafeConfig,
  type MSPGpsRescueConfig,
  type MSPGpsRescuePids,
  type MSPFilterConfig,
  type MSPVtxConfig,
  type OsdConfigData,
  type MSPRxConfig,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspRequest,
  sendMspRequestWithPayload,
  withConfigLock,
} from './msp-transport.js';

// =============================================================================
// Failsafe Configuration
// =============================================================================

export async function getFailsafeConfig(): Promise<MSPFailsafeConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.FAILSAFE_CONFIG, 1000);
      const config = deserializeFailsafeConfig(payload);
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get failsafe config failed:', msg);
      return null;
    }
  });
}

export async function setFailsafeConfig(config: MSPFailsafeConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeFailsafeConfig(config);
      await sendMspRequestWithPayload(MSP.SET_FAILSAFE_CONFIG, payload, 2000);
      ctx.sendLog('info', 'Failsafe config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_FAILSAFE_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set failsafe config', msg);
      return false;
    }
  });
}

// =============================================================================
// GPS Rescue Configuration (Betaflight)
// =============================================================================

export async function getGpsRescueConfig(): Promise<MSPGpsRescueConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.GPS_RESCUE, 1000);
      const config = deserializeGpsRescueConfig(payload);
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get GPS Rescue config failed:', msg);
      return null;
    }
  });
}

export async function setGpsRescueConfig(config: MSPGpsRescueConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeGpsRescueConfig(config);
      await sendMspRequestWithPayload(MSP.SET_GPS_RESCUE, payload, 2000);
      ctx.sendLog('info', 'GPS Rescue config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_GPS_RESCUE failed:', msg);
      ctx.sendLog('error', 'Failed to set GPS Rescue config', msg);
      return false;
    }
  });
}

export async function getGpsRescuePids(): Promise<MSPGpsRescuePids | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.GPS_RESCUE_PIDS, 1000);
      const pids = deserializeGpsRescuePids(payload);
      return pids;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get GPS Rescue PIDs failed:', msg);
      return null;
    }
  });
}

export async function setGpsRescuePids(pids: MSPGpsRescuePids): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeGpsRescuePids(pids);
      await sendMspRequestWithPayload(MSP.SET_GPS_RESCUE_PIDS, payload, 2000);
      ctx.sendLog('info', 'GPS Rescue PIDs updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_GPS_RESCUE_PIDS failed:', msg);
      ctx.sendLog('error', 'Failed to set GPS Rescue PIDs', msg);
      return false;
    }
  });
}

// =============================================================================
// Filter Configuration (Betaflight)
// =============================================================================

export async function getFilterConfig(): Promise<MSPFilterConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.FILTER_CONFIG, 1000);
      const config = deserializeFilterConfig(payload);
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get filter config failed:', msg);
      return null;
    }
  });
}

export async function setFilterConfig(config: MSPFilterConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeFilterConfig(config);
      await sendMspRequestWithPayload(MSP.SET_FILTER_CONFIG, payload, 2000);
      ctx.sendLog('info', 'Filter config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_FILTER_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set filter config', msg);
      return false;
    }
  });
}

// =============================================================================
// VTX Configuration
// =============================================================================

export async function getVtxConfig(): Promise<MSPVtxConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const response = await sendMspRequest(MSP.VTX_CONFIG, 2000);
      const config = deserializeVtxConfig(response);
      console.log('[MSP] VTX_CONFIG:', config);
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] VTX_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to get VTX config', msg);
      return null;
    }
  });
}

export async function setVtxConfig(config: Partial<MSPVtxConfig>): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) {
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeVtxConfig(config);
      await sendMspRequestWithPayload(MSP.SET_VTX_CONFIG, payload, 2000);
      ctx.sendLog('info', 'VTX config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_VTX_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set VTX config', msg);
      return false;
    }
  });
}

// =============================================================================
// OSD Configuration
// =============================================================================

export async function getOsdConfig(): Promise<OsdConfigData | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const response = await sendMspRequest(MSP.OSD_CONFIG, 2000);
      const config = deserializeOsdConfig(response);
      console.log('[MSP] OSD_CONFIG:', {
        flags: config.flags,
        videoSystem: config.videoSystem,
        elementCount: config.elements.length,
      });
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('not supported')) {
        console.error('[MSP] OSD_CONFIG failed:', msg);
      }
      return null;
    }
  });
}

// =============================================================================
// RX Config
// =============================================================================

/** Extended RX config with iNav receiver_type (byte 23) */
export interface RxConfigResult {
  serialrxProvider: number;
  serialrxProviderName: string;
  receiverType: number | null;
  receiverTypeName: string | null;
  rawPayload: Uint8Array;
}

// iNav receiver_type enum (byte 23 of RX_CONFIG)
const RECEIVER_TYPE_NAMES: Record<number, string> = {
  0: 'NONE', 1: 'SERIAL', 2: 'MSP', 3: 'SIM (SITL)',
};

export async function getRxConfig(): Promise<RxConfigResult | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const response = await sendMspRequest(MSP.RX_CONFIG, 2000);
      const base = deserializeRxConfig(response);

      // Parse receiver_type from byte 23 (iNav only, payload >= 24 bytes)
      let receiverType: number | null = null;
      let receiverTypeName: string | null = null;
      if (base.rawPayload.length >= 24) {
        const rt = base.rawPayload[23];
        if (rt !== undefined) {
          receiverType = rt;
          receiverTypeName = RECEIVER_TYPE_NAMES[rt] ?? 'UNKNOWN';
        }
      }

      const result: RxConfigResult = {
        serialrxProvider: base.serialrxProvider,
        serialrxProviderName: base.serialrxProviderName,
        receiverType,
        receiverTypeName,
        rawPayload: base.rawPayload,
      };

      console.log('[MSP] RX_CONFIG:', {
        serialrxProvider: result.serialrxProvider,
        serialrxProviderName: result.serialrxProviderName,
        receiverType: result.receiverType,
        receiverTypeName: result.receiverTypeName,
        payloadLength: result.rawPayload.length,
      });
      return result;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (!msg.includes('not supported')) {
        console.error('[MSP] RX_CONFIG failed:', msg);
      }
      return null;
    }
  });
}

export async function setRxConfig(newProvider: number, newReceiverType?: number): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      // Step 1: Read current config to get full payload
      const response = await sendMspRequest(MSP.RX_CONFIG, 2000);
      const currentConfig = deserializeRxConfig(response);
      console.log('[MSP] RX_CONFIG read for modify:', {
        currentProvider: currentConfig.serialrxProviderName,
        newProvider: SERIALRX_PROVIDER_NAMES[newProvider] ?? newProvider,
        newReceiverType,
        payloadLength: currentConfig.rawPayload.length,
      });

      // Step 2: Modify serialrx_provider (byte 0) and optionally receiver_type (byte 23)
      const newPayload = serializeRxConfig(currentConfig.rawPayload, newProvider);
      // serializeRxConfig in compiled msp-ts may not support byte 23 — write it directly
      if (newReceiverType !== undefined && newPayload.length >= 24) {
        newPayload[23] = newReceiverType;
      }

      // Step 3: Write back via MSP_SET_RX_CONFIG (45)
      await sendMspRequestWithPayload(MSP.SET_RX_CONFIG, newPayload, 2000);
      console.log('[MSP] SET_RX_CONFIG sent successfully');

      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_RX_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set RX config', msg);
      return false;
    }
  });
}
