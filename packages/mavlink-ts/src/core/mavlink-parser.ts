/**
 * MAVLink Stream Parser
 * Async generator that parses MAVLink packets from a byte stream
 * Reference: MissionPlanner/ExtLibs/Mavlink/MavlinkParse.cs
 */

import {
  MAVLINK_STX_V2,
  MAVLINK_STX_V1,
  MAVLINK_IFLAG_SIGNED,
  MAVLINK_SIGNATURE_BLOCK_LEN,
  MAVLINK_NUM_HEADER_BYTES_V2,
  MAVLINK_NUM_HEADER_BYTES_V1,
} from './constants.js';
import { crcCalculateWithExtra } from './crc.js';
import { parsePacket, calculatePacketLength } from './mavlink-packet.js';
import type { MAVLinkPacket, ParserStats, MessageInfo } from './types.js';

/**
 * MAVLink stream parser
 * Buffers incoming bytes and yields complete, validated packets
 */
export class MAVLinkParser {
  private buffer: Uint8Array = new Uint8Array(0);
  private stats: ParserStats = {
    packetsReceived: 0,
    badCRC: 0,
    badLength: 0,
    unknownMessage: 0,
    bytesReceived: 0,
  };

  private messageRegistry: Map<number, MessageInfo> = new Map();

  /**
   * Register a message type for CRC validation and deserialization
   */
  registerMessage(info: MessageInfo): void {
    this.messageRegistry.set(info.msgid, info);
  }

  /**
   * Register multiple message types
   */
  registerMessages(infos: MessageInfo[]): void {
    for (const info of infos) {
      this.registerMessage(info);
    }
  }

  /**
   * Get current parser statistics
   */
  getStats(): ParserStats {
    return { ...this.stats };
  }

  /**
   * Reset parser state and statistics
   */
  reset(): void {
    this.buffer = new Uint8Array(0);
    this.stats = {
      packetsReceived: 0,
      badCRC: 0,
      badLength: 0,
      unknownMessage: 0,
      bytesReceived: 0,
    };
  }

  /**
   * Get message info by ID
   */
  getMessageInfo(msgid: number): MessageInfo | undefined {
    return this.messageRegistry.get(msgid);
  }

  /**
   * Parse incoming data and yield complete packets
   * Reference: MavlinkParse.cs ReadPacket method (lines 128-234)
   */
  async *parse(data: Uint8Array): AsyncGenerator<MAVLinkPacket> {
    // Append new data to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;
    this.stats.bytesReceived += data.length;

    while (true) {
      // Find start byte (STX)
      let startIdx = -1;
      for (let i = 0; i < this.buffer.length; i++) {
        if (
          this.buffer[i] === MAVLINK_STX_V2 ||
          this.buffer[i] === MAVLINK_STX_V1
        ) {
          startIdx = i;
          break;
        }
      }

      // No start byte found, clear buffer
      if (startIdx === -1) {
        this.buffer = new Uint8Array(0);
        return;
      }

      // Discard bytes before start marker
      if (startIdx > 0) {
        this.buffer = this.buffer.slice(startIdx);
      }

      const header = this.buffer[0];
      const isMavlink2 = header === MAVLINK_STX_V2;
      const headerLen = isMavlink2
        ? MAVLINK_NUM_HEADER_BYTES_V2
        : MAVLINK_NUM_HEADER_BYTES_V1;

      // Wait for complete header
      if (this.buffer.length < headerLen) {
        return;
      }

      // Read payload length and flags
      const payloadLength = this.buffer[1];
      const incompatFlags = isMavlink2 ? this.buffer[2] : 0;

      // Calculate total packet length
      const packetLength = calculatePacketLength(
        header,
        payloadLength,
        incompatFlags
      );

      // Wait for complete packet
      if (this.buffer.length < packetLength) {
        return;
      }

      // Extract packet bytes
      const packetBytes = this.buffer.slice(0, packetLength);
      this.buffer = this.buffer.slice(packetLength);

      // Parse packet structure
      const packet = parsePacket(packetBytes);

      // Look up message info for CRC validation
      const msgInfo = this.messageRegistry.get(packet.msgid);
      if (!msgInfo) {
        this.stats.unknownMessage++;
        // Still yield the packet, but without CRC validation
        // This allows handling of unknown messages
        this.stats.packetsReceived++;
        yield packet;
        continue;
      }

      // Validate payload length
      if (
        packet.payloadLength < msgInfo.minLength ||
        packet.payloadLength > msgInfo.maxLength
      ) {
        this.stats.badLength++;
        continue;
      }

      // Calculate and validate CRC
      const crcLength = isMavlink2
        ? 10 + payloadLength
        : 6 + payloadLength;

      const expectedCrc = crcCalculateWithExtra(
        packetBytes,
        crcLength,
        msgInfo.crcExtra
      );

      if (packet.crc16 !== expectedCrc) {
        this.stats.badCRC++;
        continue;
      }

      this.stats.packetsReceived++;
      yield packet;
    }
  }
}

/**
 * Create a parser with registered message types
 */
export function createParser(messages?: MessageInfo[]): MAVLinkParser {
  const parser = new MAVLinkParser();
  if (messages) {
    parser.registerMessages(messages);
  }
  return parser;
}
