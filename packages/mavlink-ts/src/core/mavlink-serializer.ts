/**
 * MAVLink Packet Serialization
 * Reference: MissionPlanner/ExtLibs/Mavlink/MavlinkParse.cs
 */

import {
  MAVLINK_STX_V2,
  MAVLINK_STX_V1,
  MAVLINK_IFLAG_SIGNED,
} from './constants.js';
import { crcCalculateWithExtra, crcToBytes } from './crc.js';
import { createSignature } from './signing.js';
import type { SerializeOptions, MessageInfo } from './types.js';

// Global sequence counter
let globalSequence = 0;

/**
 * Get and increment the global sequence number
 */
export function getNextSequence(): number {
  const seq = globalSequence;
  globalSequence = (globalSequence + 1) & 0xff;
  return seq;
}

/**
 * Reset the global sequence counter
 */
export function resetSequence(value = 0): void {
  globalSequence = value & 0xff;
}

/**
 * Serialize a MAVLink v2 packet
 * Reference: MavlinkParse.cs GenerateMAVLinkPacket20 (lines 279-387)
 */
export function serializeV2(
  msgid: number,
  payload: Uint8Array,
  crcExtra: number,
  options: SerializeOptions = {}
): Uint8Array {
  const {
    sysid = 255,
    compid = 190, // MAV_COMP_ID_MISSIONPLANNER
    sequence = getNextSequence(),
    sign = false,
    signingKey,
    linkId = 0,
  } = options;

  // Trim trailing zeros from payload (MAVLink v2 optimization)
  let trimmedLength = payload.length;
  while (trimmedLength > 1 && payload[trimmedLength - 1] === 0) {
    trimmedLength--;
  }

  const signatureLen = sign && signingKey ? 13 : 0;
  const packetLen = 10 + trimmedLength + 2 + signatureLen;
  const packet = new Uint8Array(packetLen);

  // Header
  packet[0] = MAVLINK_STX_V2;
  packet[1] = trimmedLength;
  packet[2] = sign && signingKey ? MAVLINK_IFLAG_SIGNED : 0; // incompat flags
  packet[3] = 0; // compat flags
  packet[4] = sequence & 0xff;
  packet[5] = sysid & 0xff;
  packet[6] = compid & 0xff;

  // 24-bit message ID, little-endian
  packet[7] = msgid & 0xff;
  packet[8] = (msgid >> 8) & 0xff;
  packet[9] = (msgid >> 16) & 0xff;

  // Payload
  packet.set(payload.slice(0, trimmedLength), 10);

  // CRC
  const crc = crcCalculateWithExtra(packet, 10 + trimmedLength, crcExtra);
  const [crcLo, crcHi] = crcToBytes(crc);
  packet[10 + trimmedLength] = crcLo;
  packet[11 + trimmedLength] = crcHi;

  // Signature (if signing)
  if (sign && signingKey) {
    const signature = createSignature(
      signingKey,
      packet.slice(0, 12 + trimmedLength), // header + payload + CRC
      linkId
    );
    packet.set(signature, 12 + trimmedLength);
  }

  return packet;
}

/**
 * Serialize a MAVLink v1 packet
 * Reference: MavlinkParse.cs GenerateMAVLinkPacket10 (lines 236-276)
 */
export function serializeV1(
  msgid: number,
  payload: Uint8Array,
  crcExtra: number,
  options: SerializeOptions = {}
): Uint8Array {
  const {
    sysid = 255,
    compid = 190,
    sequence = getNextSequence(),
  } = options;

  // v1 only supports 8-bit message IDs
  if (msgid > 255) {
    throw new Error(`Message ID ${msgid} too large for MAVLink v1`);
  }

  const packetLen = 6 + payload.length + 2;
  const packet = new Uint8Array(packetLen);

  // Header
  packet[0] = MAVLINK_STX_V1;
  packet[1] = payload.length;
  packet[2] = sequence & 0xff;
  packet[3] = sysid & 0xff;
  packet[4] = compid & 0xff;
  packet[5] = msgid & 0xff;

  // Payload
  packet.set(payload, 6);

  // CRC
  const crc = crcCalculateWithExtra(packet, 6 + payload.length, crcExtra);
  const [crcLo, crcHi] = crcToBytes(crc);
  packet[6 + payload.length] = crcLo;
  packet[7 + payload.length] = crcHi;

  return packet;
}

/**
 * Serialize a message using the message info registry
 */
export function serializeMessage<T>(
  msgInfo: MessageInfo,
  message: T,
  options: SerializeOptions = {}
): Uint8Array {
  const payload = msgInfo.serialize(message);
  const { useMavlink2 = true } = options;

  if (useMavlink2) {
    return serializeV2(msgInfo.msgid, payload, msgInfo.crcExtra, options);
  } else {
    return serializeV1(msgInfo.msgid, payload, msgInfo.crcExtra, options);
  }
}
