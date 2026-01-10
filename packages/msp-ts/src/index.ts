/**
 * @ardudeck/msp-ts
 *
 * TypeScript MSP protocol library for Betaflight/iNav/Cleanflight flight controllers
 */

// =============================================================================
// Core
// =============================================================================

export * from './core/constants.js';
export * from './core/types.js';
export * from './core/crc.js';
export { MSPParser, parseMspPacket } from './core/msp-parser.js';
export {
  buildMspV1Request,
  buildMspV1RequestWithPayload,
  buildMspV2Request,
  buildMspV2RequestWithPayload,
  buildMspRequest,
  PayloadBuilder,
  PayloadReader,
} from './core/msp-serializer.js';

// =============================================================================
// Messages
// =============================================================================

export * from './messages/info.js';
export * from './messages/telemetry.js';
export * from './messages/config.js';

// =============================================================================
// OSD
// =============================================================================

export * from './osd/mcm-parser.js';

// =============================================================================
// Convenience: All Message Registrations
// =============================================================================

import { INFO_MESSAGES } from './messages/info.js';
import { TELEMETRY_MESSAGES } from './messages/telemetry.js';
import type { MSPMessageInfo } from './core/types.js';

/**
 * All registered MSP message definitions
 */
export const ALL_MESSAGES: MSPMessageInfo[] = [...INFO_MESSAGES, ...TELEMETRY_MESSAGES];

import { MSPParser } from './core/msp-parser.js';

/**
 * Create a new parser with all messages pre-registered
 */
export function createMspParser(): MSPParser {
  const parser = new MSPParser();
  parser.registerMessages(ALL_MESSAGES);
  return parser;
}
