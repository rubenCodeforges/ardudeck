/**
 * MSP Detection
 *
 * tryMspDetection - detect MSP protocol on an open transport.
 */

import { BrowserWindow } from 'electron';
import type { Transport } from '@ardudeck/comms';
import {
  MSPParser,
  MSP,
  deserializeApiVersion,
  deserializeFcVariant,
  deserializeFcVersion,
  deserializeBoardInfo,
} from '@ardudeck/msp-ts';
import { ctx } from './msp-context.js';
import { sendMspRequest, handleMspResponse } from './msp-transport.js';
import { setCliTransport, isCliModeActive } from '../cli/cli-handlers.js';

/**
 * Try to detect MSP protocol on an already-open transport.
 * Returns board info if MSP is detected, null otherwise.
 */
export async function tryMspDetection(
  transport: Transport,
  window: BrowserWindow
): Promise<{
  fcVariant: string;
  fcVersion: string;
  boardId: string;
  apiVersion: string;
} | null> {
  ctx.mainWindow = window;
  ctx.currentTransport = transport;
  ctx.mspParser = new MSPParser();

  // Reset all CLI mode flags to ensure clean state
  ctx.servoCliModeActive = false;
  ctx.tuningCliModeActive = false;

  // Share transport with CLI handlers
  setCliTransport(transport);

  ctx.sendLog('info', 'Trying MSP protocol detection...');

  // Setup data handler for MSP
  const dataHandler = (data: Uint8Array) => {
    // Skip MSP parsing when in CLI mode - CLI handler processes raw text
    if (isCliModeActive()) return;
    if (!ctx.mspParser) return;
    const packets = ctx.mspParser.parseSync(data);
    for (const packet of packets) {
      if (packet.direction === 'response') {
        handleMspResponse(packet.command, packet.payload);
      } else if (packet.direction === 'error') {
        // Handle error response - reject pending promise immediately
        const pending = ctx.pendingResponses.get(packet.command);
        if (pending) {
          clearTimeout(pending.timeout);
          ctx.pendingResponses.delete(packet.command);
          pending.reject(new Error(`MSP command ${packet.command} not supported by this board`));
        }
        // Track unsupported commands (only log once to avoid spam)
        if (!ctx.unsupportedCommands.has(packet.command)) {
          ctx.unsupportedCommands.add(packet.command);
        }
      }
    }
  };

  transport.on('data', dataHandler);

  try {
    // Try to get API version - this is the most reliable MSP detection
    const apiPayload = await sendMspRequest(MSP.API_VERSION, 1500);
    const api = deserializeApiVersion(apiPayload);
    ctx.sendLog('info', `MSP API version: ${api.apiMajor}.${api.apiMinor}`);

    // If we got here, it's MSP! Get more info
    let fcVariant = '';
    let fcVersion = '';
    let boardId = '';

    try {
      const variantPayload = await sendMspRequest(MSP.FC_VARIANT, 1000);
      const variant = deserializeFcVariant(variantPayload);
      fcVariant = variant.variant;
    } catch { /* ignore */ }

    try {
      const versionPayload = await sendMspRequest(MSP.FC_VERSION, 1000);
      const version = deserializeFcVersion(versionPayload);
      fcVersion = version.version;
    } catch { /* ignore */ }

    try {
      const boardPayload = await sendMspRequest(MSP.BOARD_INFO, 1000);
      const board = deserializeBoardInfo(boardPayload);
      // Prefer full target name, then board name, fall back to 4-char ID
      boardId = board.targetName || board.boardName || board.boardId;
      ctx.sendLog('info', `MSP BOARD_INFO: id=${board.boardId}, target=${board.targetName}, name=${board.boardName}`);
    } catch { /* ignore */ }

    ctx.sendLog('info', `MSP detected: ${fcVariant} ${fcVersion}`, `Board: ${boardId}`);

    // Track firmware type for protocol decisions
    ctx.isInavFirmware = fcVariant === 'INAV';
    ctx.inavVersion = ctx.isInavFirmware ? fcVersion : '';

    return {
      fcVariant,
      fcVersion,
      boardId,
      apiVersion: `${api.apiMajor}.${api.apiMinor}`,
    };
  } catch (error) {
    // Not MSP
    ctx.sendLog('info', 'MSP detection failed', error instanceof Error ? error.message : 'No response');
    transport.off('data', dataHandler as (...args: unknown[]) => void);
    ctx.mspParser = null;
    ctx.currentTransport = null;
    return null;
  }
}
