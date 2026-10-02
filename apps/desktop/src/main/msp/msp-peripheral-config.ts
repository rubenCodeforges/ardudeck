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
  deserializeInavVtxConfig,
  serializeInavVtxConfig,
  deserializeOsdConfig,
  serializeOsdElementPosition,
  serializeOsdCharWrite,
  INAV_SERIALRX_PROVIDER_NAMES,
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
import { saveEeprom } from './msp-commands.js';
import { t } from '../../shared/i18n/index.js';

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
      ctx.sendLog('info', 'Failsafe config updated'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_FAILSAFE_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set failsafe config', msg); // i18n-exempt
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
      ctx.sendLog('error', 'Failed to set GPS Rescue config', msg); // i18n-exempt
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
      ctx.sendLog('error', 'Failed to set GPS Rescue PIDs', msg); // i18n-exempt
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
  // The payload is Betaflight's MSP_SET_FILTER_CONFIG layout; iNav's differs.
  if (ctx.isInavFirmware) {
    ctx.sendLog('warn', 'Filter config not sent', 'This filter layout is Betaflight-only'); // i18n-exempt
    return false;
  }

  return withConfigLock(async () => {
    try {
      const payload = serializeFilterConfig(config);
      await sendMspRequestWithPayload(MSP.SET_FILTER_CONFIG, payload, 2000);
      ctx.sendLog('info', 'Filter config updated'); // i18n-exempt
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_FILTER_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set filter config', msg); // i18n-exempt
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
      const config = ctx.isInavFirmware ? deserializeInavVtxConfig(response) : deserializeVtxConfig(response);
      console.log('[MSP] VTX_CONFIG:', config);
      return config;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] VTX_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to get VTX config', msg); // i18n-exempt
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
      const payload = ctx.isInavFirmware ? serializeInavVtxConfig(config) : serializeVtxConfig(config);
      await sendMspRequestWithPayload(MSP.SET_VTX_CONFIG, payload, 2000);
      ctx.sendLog('info', 'VTX config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_VTX_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to set VTX config', msg); // i18n-exempt
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
      if (!msg.includes('rejected by the flight controller')) {
        console.error('[MSP] OSD_CONFIG failed:', msg);
      }
      return null;
    }
  });
}

/** One element position to write to the FC's OSD layout. */
export interface OsdElementWrite {
  /** Betaflight element index (DISPLAY_FIELDS order). */
  index: number;
  x: number;
  y: number;
  visible: boolean;
}

/**
 * Upload OSD element positions to the flight controller.
 *
 * Betaflight/iNav apply MSP_SET_OSD_CONFIG one element at a time
 * ([index:u8, position:u16]), so we send one frame per element and then persist
 * to EEPROM. Returns the number of elements successfully written.
 */
export async function setOsdConfig(
  elements: OsdElementWrite[],
): Promise<{ success: boolean; written: number; total: number; error?: string }> {
  if (!ctx.currentTransport?.isOpen) {
    return { success: false, written: 0, total: elements.length, error: t('main:msp.notConnected') };
  }

  return withConfigLock(async () => {
    let written = 0;
    try {
      for (const el of elements) {
        const payload = serializeOsdElementPosition(el.index, el.x, el.y, el.visible);
        await sendMspRequestWithPayload(MSP.SET_OSD_CONFIG, payload, 2000);
        written++;
      }
      await saveEeprom();
      ctx.sendLog('info', `OSD layout uploaded (${written} elements)`);
      return { success: true, written, total: elements.length };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET_OSD_CONFIG failed:', msg);
      ctx.sendLog('error', 'Failed to upload OSD layout', msg); // i18n-exempt
      return { success: false, written, total: elements.length, error: msg };
    }
  });
}

/** One MAX7456 font character to upload: NVM address + its 54 pixel bytes. */
export interface OsdFontChar {
  address: number;
  bytes: number[];
}

/**
 * Upload a custom MCM font to a MAX7456 (analog) flight controller via
 * MSP_OSD_CHAR_WRITE, one character at a time. MAX7456 NVM writes are slow, so
 * we pace them. The FC typically needs a reboot afterwards for the new glyphs to
 * take effect. Returns how many characters were written.
 */
export async function uploadOsdFont(
  chars: OsdFontChar[],
): Promise<{ success: boolean; written: number; total: number; error?: string }> {
  if (!ctx.currentTransport?.isOpen) {
    return { success: false, written: 0, total: chars.length, error: t('main:msp.notConnected') };
  }
  return withConfigLock(async () => {
    let written = 0;
    try {
      for (const c of chars) {
        await sendMspRequestWithPayload(MSP.OSD_CHAR_WRITE, serializeOsdCharWrite(c.address, c.bytes), 2000);
        written++;
        // Pace NVM writes (MAX7456 char-write commit is ~12ms).
        await new Promise((r) => setTimeout(r, 15));
      }
      ctx.sendLog('info', `OSD font uploaded (${written} characters) — reboot the FC to apply`);
      return { success: true, written, total: chars.length };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] OSD_CHAR_WRITE failed:', msg);
      ctx.sendLog('error', 'Failed to upload OSD font', msg); // i18n-exempt
      return { success: false, written, total: chars.length, error: msg };
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
      const base = deserializeRxConfig(response, ctx.isInavFirmware ? 'inav' : 'betaflight');

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
      if (!msg.includes('rejected by the flight controller')) {
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
      const currentConfig = deserializeRxConfig(response, ctx.isInavFirmware ? 'inav' : 'betaflight');
      const names = ctx.isInavFirmware ? INAV_SERIALRX_PROVIDER_NAMES : SERIALRX_PROVIDER_NAMES;
      console.log('[MSP] RX_CONFIG read for modify:', {
        currentProvider: currentConfig.serialrxProviderName,
        newProvider: names[newProvider] ?? newProvider,
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
      ctx.sendLog('error', 'Failed to set RX config', msg); // i18n-exempt
      return false;
    }
  });
}
