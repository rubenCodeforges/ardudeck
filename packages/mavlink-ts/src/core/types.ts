/**
 * Core MAVLink type definitions
 */

/**
 * Message information for the registry
 */
export interface MessageInfo {
  /** Unique message ID */
  msgid: number;
  /** Human-readable message name */
  name: string;
  /** CRC extra byte for validation */
  crcExtra: number;
  /** Minimum payload length */
  minLength: number;
  /** Maximum payload length */
  maxLength: number;
  /** Deserialize payload bytes to message object */
  deserialize: (payload: Uint8Array) => unknown;
  /** Serialize message object to payload bytes */
  serialize: (msg: unknown) => Uint8Array;
}

/**
 * Parsed MAVLink packet
 */
export interface MAVLinkPacket {
  /** Raw packet bytes */
  readonly buffer: Uint8Array;
  /** Time packet was received */
  readonly rxtime: Date;
  /** Start marker (0xFD for v2, 0xFE for v1) */
  readonly header: number;
  /** Payload length in bytes */
  readonly payloadLength: number;
  /** Incompatibility flags (v2 only) */
  readonly incompatFlags: number;
  /** Compatibility flags (v2 only) */
  readonly compatFlags: number;
  /** Packet sequence number (0-255) */
  readonly seq: number;
  /** System ID of sender */
  readonly sysid: number;
  /** Component ID of sender */
  readonly compid: number;
  /** Message ID */
  readonly msgid: number;
  /** Raw payload bytes */
  readonly payload: Uint8Array;
  /** 16-bit CRC */
  readonly crc16: number;
  /** Signature bytes (v2 with signing only) */
  readonly signature?: Uint8Array;
  /** True if MAVLink v2 packet */
  readonly isMavlink2: boolean;
  /** True if packet is signed */
  readonly isSigned: boolean;
}

/**
 * Parser statistics for monitoring
 */
export interface ParserStats {
  packetsReceived: number;
  badCRC: number;
  badLength: number;
  unknownMessage: number;
  bytesReceived: number;
}

/**
 * Options for serializing messages
 */
export interface SerializeOptions {
  /** System ID (default: 255) */
  sysid?: number;
  /** Component ID (default: 190 - MAV_COMP_ID_MISSIONPLANNER) */
  compid?: number;
  /** Sequence number (auto-incremented if not provided) */
  sequence?: number;
  /** Use MAVLink v2 format (default: true) */
  useMavlink2?: boolean;
  /** Sign the packet */
  sign?: boolean;
  /** 32-byte signing key (required if sign=true) */
  signingKey?: Uint8Array;
  /** Link ID for signing (default: 0) */
  linkId?: number;
}

/**
 * Signing configuration
 */
export interface SigningConfig {
  /** 32-byte secret key */
  secretKey: Uint8Array;
  /** Link ID (0-255) */
  linkId: number;
  /** Accept unsigned packets */
  acceptUnsigned: boolean;
  /** Accept packets with old timestamps */
  allowOldTimestamps: boolean;
}
