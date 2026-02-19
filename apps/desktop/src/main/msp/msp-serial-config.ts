/**
 * MSP Serial Config, RX Map, and RC Deadband handlers.
 *
 * Serial config uses MSP2 COMMON_CF_SERIAL_CONFIG (0x1009 / 0x100A).
 * RX map uses MSP_RX_MAP (64) / MSP_SET_RX_MAP (65).
 * RC deadband uses MSP_RC_DEADBAND (125) / MSP_SET_RC_DEADBAND (218).
 */

import {
  MSP,
  MSP2,
  deserializeSerialConfig,
  serializeSerialConfig,
  deserializeRxMap,
  deserializeRcDeadband,
  serializeRcDeadband,
  type MSPSerialConfig,
  type MSPRcDeadband,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import {
  sendMspRequest,
  sendMspRequestWithPayload,
  sendMspV2Request,
  sendMspV2RequestWithPayload,
  withConfigLock,
} from './msp-transport.js';

// =============================================================================
// Serial Port Configuration
// =============================================================================

export async function getSerialConfig(): Promise<MSPSerialConfig | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      // Try MSP2 first (iNav 2.0+, modern BF)
      const payload = await sendMspV2Request(MSP2.COMMON_CF_SERIAL_CONFIG, 2000);
      return deserializeSerialConfig(payload);
    } catch {
      try {
        // Fall back to MSP1 (54) - same binary format
        const payload = await sendMspRequest(MSP.CF_SERIAL_CONFIG, 2000);
        return deserializeSerialConfig(payload);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        console.error('[MSP] Get serial config failed:', msg);
        return null;
      }
    }
  });
}

export async function setSerialConfig(config: MSPSerialConfig): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const payload = serializeSerialConfig(config);
      // Try MSP2 first
      try {
        await sendMspV2RequestWithPayload(MSP2.COMMON_SET_CF_SERIAL_CONFIG, payload, 2000);
      } catch {
        // Fall back to MSP1 (55)
        await sendMspRequestWithPayload(MSP.SET_CF_SERIAL_CONFIG, payload, 2000);
      }
      ctx.sendLog('info', 'Serial config updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET serial config failed:', msg);
      ctx.sendLog('error', 'Failed to set serial config', msg);
      return false;
    }
  });
}

// =============================================================================
// RX Map (Channel Mapping)
// =============================================================================

export async function getRxMap(): Promise<number[] | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.RX_MAP, 1000);
      const rxMapData = deserializeRxMap(payload);
      return rxMapData.rxMap;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get RX map failed:', msg);
      return null;
    }
  });
}

export async function setRxMap(map: number[]): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const payload = new Uint8Array(map);
      await sendMspRequestWithPayload(MSP.SET_RX_MAP, payload, 1000);
      ctx.sendLog('info', 'RX map updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET RX map failed:', msg);
      ctx.sendLog('error', 'Failed to set RX map', msg);
      return false;
    }
  });
}

// =============================================================================
// RC Deadband
// =============================================================================

export async function getRcDeadband(): Promise<MSPRcDeadband | null> {
  if (!ctx.currentTransport?.isOpen) return null;

  return withConfigLock(async () => {
    try {
      const payload = await sendMspRequest(MSP.RC_DEADBAND, 1000);
      return deserializeRcDeadband(payload);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] Get RC deadband failed:', msg);
      return null;
    }
  });
}

export async function setRcDeadband(config: MSPRcDeadband): Promise<boolean> {
  if (!ctx.currentTransport?.isOpen) return false;

  return withConfigLock(async () => {
    try {
      const payload = serializeRcDeadband(config);
      await sendMspRequestWithPayload(MSP.SET_RC_DEADBAND, payload, 1000);
      ctx.sendLog('info', 'RC deadband updated');
      return true;
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      console.error('[MSP] SET RC deadband failed:', msg);
      ctx.sendLog('error', 'Failed to set RC deadband', msg);
      return false;
    }
  });
}
