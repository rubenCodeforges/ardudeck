/**
 * MAVLink Packet Parsing
 * Reference: MissionPlanner/ExtLibs/Mavlink/MAVLinkMessage.cs
 */

import {
  MAVLINK_STX_V2,
  MAVLINK_STX_V1,
  MAVLINK_IFLAG_SIGNED,
  MAVLINK_SIGNATURE_BLOCK_LEN,
} from './constants.js';
import type { MAVLinkPacket } from './types.js';

/**
 * Safely get a byte from buffer with default fallback
 */
function getByte(buffer: Uint8Array, index: number): number {
  return buffer[index] ?? 0;
}

/**
 * Parse a complete packet buffer into a MAVLinkPacket structure
 * Reference: MAVLinkMessage.cs lines 160-209
 */
export function parsePacket(
  buffer: Uint8Array,
  rxtime: Date = new Date()
): MAVLinkPacket {
  if (buffer.length < 8) {
    throw new Error('Buffer too short for MAVLink packet');
  }

  const header = getByte(buffer, 0);
  const isMavlink2 = header === MAVLINK_STX_V2;

  if (isMavlink2) {
    return parseV2Packet(buffer, rxtime);
  } else if (header === MAVLINK_STX_V1) {
    return parseV1Packet(buffer, rxtime);
  } else {
    throw new Error(`Invalid packet header: 0x${header.toString(16)}`);
  }
}

/**
 * Parse MAVLink v2 packet
 * Header layout (10 bytes):
 *   [0] STX (0xFD)
 *   [1] Payload length
 *   [2] Incompatibility flags
 *   [3] Compatibility flags
 *   [4] Sequence
 *   [5] System ID
 *   [6] Component ID
 *   [7-9] Message ID (24-bit, little-endian)
 */
function parseV2Packet(buffer: Uint8Array, rxtime: Date): MAVLinkPacket {
  const payloadLength = getByte(buffer, 1);
  const incompatFlags = getByte(buffer, 2);
  const compatFlags = getByte(buffer, 3);
  const seq = getByte(buffer, 4);
  const sysid = getByte(buffer, 5);
  const compid = getByte(buffer, 6);

  // 24-bit message ID, little-endian
  const msgid = getByte(buffer, 7) | (getByte(buffer, 8) << 8) | (getByte(buffer, 9) << 16);

  // Payload starts at offset 10
  const payload = buffer.slice(10, 10 + payloadLength);

  // CRC is after payload
  const crcOffset = 10 + payloadLength;
  const crc16 = getByte(buffer, crcOffset) | (getByte(buffer, crcOffset + 1) << 8);

  // Check for signature
  const isSigned = (incompatFlags & MAVLINK_IFLAG_SIGNED) !== 0;
  const signature = isSigned
    ? buffer.slice(crcOffset + 2, crcOffset + 2 + MAVLINK_SIGNATURE_BLOCK_LEN)
    : undefined;

  return {
    buffer,
    rxtime,
    header: MAVLINK_STX_V2,
    payloadLength,
    incompatFlags,
    compatFlags,
    seq,
    sysid,
    compid,
    msgid,
    payload,
    crc16,
    signature,
    isMavlink2: true,
    isSigned,
  };
}

/**
 * Parse MAVLink v1 packet
 * Header layout (6 bytes):
 *   [0] STX (0xFE)
 *   [1] Payload length
 *   [2] Sequence
 *   [3] System ID
 *   [4] Component ID
 *   [5] Message ID (8-bit)
 */
function parseV1Packet(buffer: Uint8Array, rxtime: Date): MAVLinkPacket {
  const payloadLength = getByte(buffer, 1);
  const seq = getByte(buffer, 2);
  const sysid = getByte(buffer, 3);
  const compid = getByte(buffer, 4);
  const msgid = getByte(buffer, 5);

  // Payload starts at offset 6
  const payload = buffer.slice(6, 6 + payloadLength);

  // CRC is after payload
  const crcOffset = 6 + payloadLength;
  const crc16 = getByte(buffer, crcOffset) | (getByte(buffer, crcOffset + 1) << 8);

  return {
    buffer,
    rxtime,
    header: MAVLINK_STX_V1,
    payloadLength,
    incompatFlags: 0,
    compatFlags: 0,
    seq,
    sysid,
    compid,
    msgid,
    payload,
    crc16,
    isMavlink2: false,
    isSigned: false,
  };
}

/**
 * Calculate expected packet length based on header bytes
 */
export function calculatePacketLength(
  header: number,
  payloadLength: number,
  incompatFlags: number
): number {
  if (header === MAVLINK_STX_V2) {
    const isSigned = (incompatFlags & MAVLINK_IFLAG_SIGNED) !== 0;
    return 10 + payloadLength + 2 + (isSigned ? MAVLINK_SIGNATURE_BLOCK_LEN : 0);
  } else {
    return 6 + payloadLength + 2;
  }
}
