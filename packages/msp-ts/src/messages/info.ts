/**
 * MSP Info Messages
 *
 * FC_VARIANT, FC_VERSION, BOARD_INFO, BUILD_INFO, API_VERSION, NAME
 */

import { MSP } from '../core/constants.js';
import { PayloadReader, PayloadBuilder } from '../core/msp-serializer.js';
import type {
  MSPMessageInfo,
  MSPApiVersion,
  MSPFcVariant,
  MSPFcVersion,
  MSPBoardInfo,
  MSPBuildInfo,
  MSPName,
} from '../core/types.js';

// =============================================================================
// Deserializers
// =============================================================================

/**
 * Deserialize MSP_API_VERSION response
 */
export function deserializeApiVersion(payload: Uint8Array): MSPApiVersion {
  const reader = new PayloadReader(payload);
  return {
    protocol: reader.readU8(),
    apiMajor: reader.readU8(),
    apiMinor: reader.readU8(),
  };
}

/**
 * Deserialize MSP_FC_VARIANT response
 */
export function deserializeFcVariant(payload: Uint8Array): MSPFcVariant {
  const reader = new PayloadReader(payload);
  return {
    variant: reader.readString(4),
  };
}

/**
 * Deserialize MSP_FC_VERSION response
 */
export function deserializeFcVersion(payload: Uint8Array): MSPFcVersion {
  const reader = new PayloadReader(payload);
  const major = reader.readU8();
  const minor = reader.readU8();
  const patch = reader.readU8();
  return {
    major,
    minor,
    patch,
    version: `${major}.${minor}.${patch}`,
  };
}

/**
 * Deserialize MSP_BOARD_INFO response
 *
 * Response format varies by firmware and version:
 * - Basic: boardId (4 bytes)
 * - Extended: + hardwareRevision, boardType, targetCapabilities, targetName, boardName, etc.
 */
export function deserializeBoardInfo(payload: Uint8Array): MSPBoardInfo {
  const reader = new PayloadReader(payload);

  // Basic fields (always present)
  const boardId = reader.readString(4);

  // Default values for optional fields
  let hardwareRevision = 0;
  let boardType = 0;
  let targetCapabilities = 0;
  let targetName = '';
  let boardName = '';
  let manufacturerId = '';
  let signature = new Uint8Array(0);
  let mcuTypeId = 0;
  let configurationState = 0;
  let sampleRateHz = 0;
  let configurationProblems = 0;

  // Extended fields (if present)
  if (reader.remaining() >= 2) {
    hardwareRevision = reader.readU16();
  }

  if (reader.remaining() >= 1) {
    boardType = reader.readU8();
  }

  if (reader.remaining() >= 1) {
    targetCapabilities = reader.readU8();
  }

  // Target name (length-prefixed string)
  if (reader.remaining() >= 1) {
    const targetNameLength = reader.readU8();
    if (reader.remaining() >= targetNameLength) {
      targetName = reader.readString(targetNameLength);
    }
  }

  // Board name (length-prefixed string)
  if (reader.remaining() >= 1) {
    const boardNameLength = reader.readU8();
    if (reader.remaining() >= boardNameLength) {
      boardName = reader.readString(boardNameLength);
    }
  }

  // Manufacturer ID (length-prefixed string)
  if (reader.remaining() >= 1) {
    const manufacturerIdLength = reader.readU8();
    if (reader.remaining() >= manufacturerIdLength) {
      manufacturerId = reader.readString(manufacturerIdLength);
    }
  }

  // Signature (32 bytes)
  if (reader.remaining() >= 32) {
    signature = reader.readBytes(32) as Uint8Array<ArrayBuffer>;
  }

  // MCU type
  if (reader.remaining() >= 1) {
    mcuTypeId = reader.readU8();
  }

  // Configuration state
  if (reader.remaining() >= 1) {
    configurationState = reader.readU8();
  }

  // Sample rate
  if (reader.remaining() >= 2) {
    sampleRateHz = reader.readU16();
  }

  // Configuration problems
  if (reader.remaining() >= 4) {
    configurationProblems = reader.readU32();
  }

  return {
    boardId,
    hardwareRevision,
    boardType,
    targetCapabilities,
    targetName,
    boardName,
    manufacturerId,
    signature,
    mcuTypeId,
    configurationState,
    sampleRateHz,
    configurationProblems,
  };
}

/**
 * Deserialize MSP_BUILD_INFO response
 */
export function deserializeBuildInfo(payload: Uint8Array): MSPBuildInfo {
  const reader = new PayloadReader(payload);
  return {
    buildDate: reader.readString(11), // "MMM DD YYYY"
    buildTime: reader.readString(8), // "HH:MM:SS"
    gitRevision: reader.readString(7), // 7-char git hash
  };
}

/**
 * Deserialize MSP_NAME response
 */
export function deserializeName(payload: Uint8Array): MSPName {
  const reader = new PayloadReader(payload);
  return {
    name: reader.readRemainingString(),
  };
}

// =============================================================================
// Serializers (for SET commands)
// =============================================================================

/**
 * Serialize MSP_SET_NAME payload
 */
export function serializeName(name: string, maxLength: number = 16): Uint8Array {
  const builder = new PayloadBuilder();
  // Truncate name to maxLength
  const truncatedName = name.slice(0, maxLength);
  builder.writeString(truncatedName, truncatedName.length);
  return builder.build();
}

// =============================================================================
// Message Info Registry
// =============================================================================

export const INFO_MESSAGES: MSPMessageInfo[] = [
  {
    command: MSP.API_VERSION,
    name: 'API_VERSION',
    minLength: 3,
    maxLength: 3,
    deserialize: deserializeApiVersion,
  },
  {
    command: MSP.FC_VARIANT,
    name: 'FC_VARIANT',
    minLength: 4,
    maxLength: 4,
    deserialize: deserializeFcVariant,
  },
  {
    command: MSP.FC_VERSION,
    name: 'FC_VERSION',
    minLength: 3,
    maxLength: 3,
    deserialize: deserializeFcVersion,
  },
  {
    command: MSP.BOARD_INFO,
    name: 'BOARD_INFO',
    minLength: 4,
    maxLength: 256,
    deserialize: deserializeBoardInfo,
  },
  {
    command: MSP.BUILD_INFO,
    name: 'BUILD_INFO',
    minLength: 26,
    maxLength: 26,
    deserialize: deserializeBuildInfo,
  },
  {
    command: MSP.NAME,
    name: 'NAME',
    minLength: 0,
    maxLength: 16,
    deserialize: deserializeName,
  },
];

// =============================================================================
// FC Variant Utilities
// =============================================================================

/**
 * FC variant code to human-readable name
 */
export function getFirmwareTypeName(variant: string): string {
  const names: Record<string, string> = {
    BTFL: 'Betaflight',
    INAV: 'iNav',
    CLFL: 'Cleanflight',
    EMUF: 'EmuFlight',
    QUIK: 'Quicksilver',
  };
  return names[variant] ?? variant;
}

/**
 * Check if variant is Betaflight
 */
export function isBetaflight(variant: string): boolean {
  return variant === 'BTFL';
}

/**
 * Check if variant is iNav
 */
export function isInav(variant: string): boolean {
  return variant === 'INAV';
}
