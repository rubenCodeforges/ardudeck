/**
 * MSP Transport Layer
 *
 * Low-level MSP request/response primitives, mutex, and config lock.
 */

import {
  MSP,
  buildMspV1Request,
  buildMspV1RequestWithPayload,
  buildMspV2Request,
  buildMspV2RequestWithPayload,
  deserializeRxMap,
} from '@ardudeck/msp-ts';
import { isCliModeActive } from '../cli/cli-handlers.js';
import { ctx } from './msp-context.js';

/**
 * Check if an error is due to CLI mode being active.
 * Used to suppress error logging for expected conditions.
 */
export function isCliModeBlockedError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes('CLI mode active');
}

/**
 * Acquire the request mutex. Returns a release function.
 * Ensures only one MSP request is in-flight at a time.
 */
export async function acquireMutex(): Promise<() => void> {
  await ctx.requestMutex;

  let release: () => void;
  ctx.requestMutex = new Promise(resolve => {
    release = resolve;
  });

  return release!;
}

/**
 * Run a config command with telemetry paused.
 * Prevents telemetry polling from interfering with config reads.
 */
export async function withConfigLock<T>(fn: () => Promise<T>): Promise<T> {
  ctx.configLockCount++;
  try {
    if (ctx.configLockCount === 1) {
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    return await fn();
  } finally {
    ctx.configLockCount--;
  }
}

export async function sendMspRequest(command: number, timeout: number = 1000): Promise<Uint8Array> {
  if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  if (ctx.servoCliModeActive || isCliModeActive()) {
    throw new Error('MSP blocked - CLI mode active');
  }

  const release = await acquireMutex();

  try {
    if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
      throw new Error('MSP transport closed while waiting');
    }

    const packet = buildMspV1Request(command);
    await ctx.currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        ctx.pendingResponses.delete(command);
        reject(new Error(`MSP command ${command} timed out`));
      }, timeout);

      ctx.pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

export async function sendMspRequestWithPayload(command: number, payload: Uint8Array, timeout: number = 1000): Promise<Uint8Array> {
  if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  if (ctx.servoCliModeActive || isCliModeActive()) {
    throw new Error('MSP blocked - CLI mode active');
  }

  const release = await acquireMutex();

  try {
    if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
      throw new Error('MSP transport closed while waiting');
    }

    const packet = buildMspV1RequestWithPayload(command, payload);
    await ctx.currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        ctx.pendingResponses.delete(command);
        reject(new Error(`MSP command ${command} timed out`));
      }, timeout);

      ctx.pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

/**
 * Send an MSP v2 request (for commands > 255 like iNav extensions)
 */
export async function sendMspV2Request(command: number, timeout: number = 1000): Promise<Uint8Array> {
  if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  if (ctx.servoCliModeActive || isCliModeActive()) {
    throw new Error('MSP blocked - CLI mode active');
  }

  const release = await acquireMutex();

  try {
    if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
      throw new Error('MSP transport closed while waiting');
    }

    const packet = buildMspV2Request(command);
    await ctx.currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        ctx.pendingResponses.delete(command);
        reject(new Error(`MSP2 command ${command.toString(16)} timed out`));
      }, timeout);

      ctx.pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

export async function sendMspV2RequestWithPayload(command: number, payload: Uint8Array, timeout: number = 1000): Promise<Uint8Array> {
  if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
    throw new Error('MSP transport not connected');
  }

  if (ctx.servoCliModeActive || isCliModeActive()) {
    throw new Error('MSP blocked - CLI mode active');
  }

  const release = await acquireMutex();

  try {
    if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
      throw new Error('MSP transport closed while waiting');
    }

    const packet = buildMspV2RequestWithPayload(command, payload);
    await ctx.currentTransport.write(packet);

    return await new Promise<Uint8Array>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        ctx.pendingResponses.delete(command);
        reject(new Error(`MSP2 command ${command.toString(16)} timed out`));
      }, timeout);

      ctx.pendingResponses.set(command, { resolve, reject, timeout: timeoutHandle });
    });
  } finally {
    release();
  }
}

export function handleMspResponse(command: number, payload: Uint8Array): void {
  const pending = ctx.pendingResponses.get(command);
  if (pending) {
    clearTimeout(pending.timeout);
    ctx.pendingResponses.delete(command);
    pending.resolve(payload);
  }
}

/**
 * Fetch RX channel mapping from flight controller.
 * Cached in ctx.cachedRxMap for reference.
 */
export async function fetchRxMap(): Promise<void> {
  if (!ctx.currentTransport || !ctx.currentTransport.isOpen) {
    return;
  }

  try {
    const payload = await sendMspRequest(MSP.RX_MAP, 500);
    const rxMapData = deserializeRxMap(payload);
    if (rxMapData.rxMap.length >= 4) {
      ctx.cachedRxMap = rxMapData.rxMap;
      console.log('[MSP] RX_MAP loaded:', ctx.cachedRxMap.slice(0, 4).join(','),
        '(AERT: Roll/Pitch/Yaw/Throttle → physical channel)');
    }
  } catch (err) {
    console.warn('[MSP] RX_MAP fetch failed, using default AETR:', err);
  }
}
