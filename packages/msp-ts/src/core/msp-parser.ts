/**
 * MSP Protocol Parser
 *
 * Async stream parser for MSP v1 and v2 packets.
 * Follows the same pattern as mavlink-parser.ts.
 */

import {
  MSP_V1_HEADER,
  MSP_V2_HEADER,
  MSP_DIRECTION_REQUEST,
  MSP_DIRECTION_RESPONSE,
  MSP_DIRECTION_ERROR,
  MSP_V1_MIN_PACKET_SIZE,
  MSP_V2_MIN_PACKET_SIZE,
  MSP_V1_MAX_PAYLOAD,
  MSP_V2_MAX_PAYLOAD,
} from './constants.js';
import { mspV1Checksum, crc8DvbS2 } from './crc.js';
import type { MSPPacket, MSPDirection, MSPParserStats, MSPMessageInfo } from './types.js';

// Parser state machine states
enum ParserState {
  IDLE,
  HEADER_M,
  HEADER_DIRECTION,
  V1_LENGTH,
  V1_COMMAND,
  V1_PAYLOAD,
  V1_CHECKSUM,
  V2_FLAG,
  V2_COMMAND_LO,
  V2_COMMAND_HI,
  V2_LENGTH_LO,
  V2_LENGTH_HI,
  V2_PAYLOAD,
  V2_CRC,
}

/**
 * MSP Protocol Parser
 *
 * Parses both MSP v1 and v2 packets from byte streams.
 * Yields parsed packets via async generator.
 */
export class MSPParser {
  private state: ParserState = ParserState.IDLE;
  private buffer: Uint8Array = new Uint8Array(0);
  private messageRegistry: Map<number, MSPMessageInfo> = new Map();

  // Current packet being parsed
  private version: 1 | 2 = 1;
  private direction: MSPDirection = 'response';
  private flag: number = 0;
  private command: number = 0;
  private payloadLength: number = 0;
  private payload: Uint8Array = new Uint8Array(0);
  private payloadOffset: number = 0;

  // Statistics
  private stats: MSPParserStats = {
    packetsReceived: 0,
    packetsV1: 0,
    packetsV2: 0,
    badChecksum: 0,
    badLength: 0,
    errors: 0,
    bytesReceived: 0,
  };

  /**
   * Register a message definition for enhanced parsing
   */
  registerMessage(info: MSPMessageInfo): void {
    this.messageRegistry.set(info.command, info);
  }

  /**
   * Register multiple message definitions
   */
  registerMessages(infos: MSPMessageInfo[]): void {
    for (const info of infos) {
      this.registerMessage(info);
    }
  }

  /**
   * Get registered message info
   */
  getMessageInfo(command: number): MSPMessageInfo | undefined {
    return this.messageRegistry.get(command);
  }

  /**
   * Get parser statistics
   */
  getStats(): MSPParserStats {
    return { ...this.stats };
  }

  /**
   * Reset parser state
   */
  reset(): void {
    this.state = ParserState.IDLE;
    this.buffer = new Uint8Array(0);
    this.version = 1;
    this.direction = 'response';
    this.flag = 0;
    this.command = 0;
    this.payloadLength = 0;
    this.payload = new Uint8Array(0);
    this.payloadOffset = 0;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      packetsReceived: 0,
      packetsV1: 0,
      packetsV2: 0,
      badChecksum: 0,
      badLength: 0,
      errors: 0,
      bytesReceived: 0,
    };
  }

  /**
   * Parse incoming data and yield complete packets
   *
   * @param data Incoming byte data
   * @yields Parsed MSP packets
   */
  async *parse(data: Uint8Array): AsyncGenerator<MSPPacket> {
    this.stats.bytesReceived += data.length;

    // Append to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    // Process all available bytes
    let prevBufferLength = -1;
    while (this.buffer.length > 0 && this.buffer.length !== prevBufferLength) {
      prevBufferLength = this.buffer.length;
      const packet = this.processNextByte();
      if (packet) {
        yield packet;
      }
      // If we're in IDLE state and next byte is not '$', skip it
      if (this.state === ParserState.IDLE && this.buffer.length > 0 && this.buffer[0] !== 0x24) {
        this.buffer = this.buffer.slice(1);
        prevBufferLength = -1; // Reset to continue processing
      }
    }
  }

  /**
   * Synchronous parse - returns array of packets
   */
  parseSync(data: Uint8Array): MSPPacket[] {
    const packets: MSPPacket[] = [];
    this.stats.bytesReceived += data.length;

    // Append to buffer
    const newBuffer = new Uint8Array(this.buffer.length + data.length);
    newBuffer.set(this.buffer);
    newBuffer.set(data, this.buffer.length);
    this.buffer = newBuffer;

    // Process all available bytes
    let prevBufferLength = -1;
    while (this.buffer.length > 0 && this.buffer.length !== prevBufferLength) {
      prevBufferLength = this.buffer.length;
      const packet = this.processNextByte();
      if (packet) {
        packets.push(packet);
      }
      // If we're in IDLE state and next byte is not '$', skip it
      if (this.state === ParserState.IDLE && this.buffer.length > 0 && this.buffer[0] !== 0x24) {
        this.buffer = this.buffer.slice(1);
        prevBufferLength = -1; // Reset to continue processing
      }
    }

    return packets;
  }

  /**
   * Process next byte from buffer using state machine
   */
  private processNextByte(): MSPPacket | null {
    if (this.buffer.length === 0) {
      return null;
    }

    const byte = this.buffer[0]!;

    switch (this.state) {
      case ParserState.IDLE:
        if (byte === MSP_V1_HEADER[0]) {
          // Found '$' - start of packet
          this.state = ParserState.HEADER_M;
          this.buffer = this.buffer.slice(1);
        }
        return null;

      case ParserState.HEADER_M:
        if (byte === MSP_V1_HEADER[1]) {
          // MSP v1: $M
          this.version = 1;
          this.state = ParserState.HEADER_DIRECTION;
        } else if (byte === MSP_V2_HEADER[1]) {
          // MSP v2: $X
          this.version = 2;
          this.state = ParserState.HEADER_DIRECTION;
        } else {
          // Invalid - reset
          this.state = ParserState.IDLE;
          return null;
        }
        this.buffer = this.buffer.slice(1);
        return null;

      case ParserState.HEADER_DIRECTION:
        if (byte === MSP_DIRECTION_REQUEST) {
          this.direction = 'request';
        } else if (byte === MSP_DIRECTION_RESPONSE) {
          this.direction = 'response';
        } else if (byte === MSP_DIRECTION_ERROR) {
          this.direction = 'error';
          this.stats.errors++;
        } else {
          // Invalid direction - reset
          this.state = ParserState.IDLE;
          return null;
        }
        this.buffer = this.buffer.slice(1);
        this.state = this.version === 1 ? ParserState.V1_LENGTH : ParserState.V2_FLAG;
        return null;

      // MSP v1 states
      case ParserState.V1_LENGTH:
        this.payloadLength = byte;
        if (this.payloadLength > MSP_V1_MAX_PAYLOAD) {
          this.stats.badLength++;
          this.state = ParserState.IDLE;
          return null;
        }
        this.payload = new Uint8Array(this.payloadLength);
        this.payloadOffset = 0;
        this.state = ParserState.V1_COMMAND;
        this.buffer = this.buffer.slice(1);
        return null;

      case ParserState.V1_COMMAND:
        this.command = byte;
        this.buffer = this.buffer.slice(1);
        if (this.payloadLength === 0) {
          this.state = ParserState.V1_CHECKSUM;
        } else {
          this.state = ParserState.V1_PAYLOAD;
        }
        return null;

      case ParserState.V1_PAYLOAD:
        this.payload[this.payloadOffset++] = byte;
        this.buffer = this.buffer.slice(1);
        if (this.payloadOffset >= this.payloadLength) {
          this.state = ParserState.V1_CHECKSUM;
        }
        return null;

      case ParserState.V1_CHECKSUM: {
        const checksum = byte;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.IDLE;

        // Calculate expected checksum
        const checksumData = new Uint8Array(2 + this.payloadLength);
        checksumData[0] = this.payloadLength;
        checksumData[1] = this.command;
        checksumData.set(this.payload, 2);
        const expectedChecksum = mspV1Checksum(checksumData);

        if (checksum !== expectedChecksum) {
          this.stats.badChecksum++;
          return null;
        }

        // Valid packet
        this.stats.packetsReceived++;
        this.stats.packetsV1++;

        return {
          version: 1,
          direction: this.direction,
          flag: 0,
          command: this.command,
          payload: this.payload,
          checksum,
          timestamp: Date.now(),
        };
      }

      // MSP v2 states
      case ParserState.V2_FLAG:
        this.flag = byte;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.V2_COMMAND_LO;
        return null;

      case ParserState.V2_COMMAND_LO:
        this.command = byte;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.V2_COMMAND_HI;
        return null;

      case ParserState.V2_COMMAND_HI:
        this.command |= byte << 8;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.V2_LENGTH_LO;
        return null;

      case ParserState.V2_LENGTH_LO:
        this.payloadLength = byte;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.V2_LENGTH_HI;
        return null;

      case ParserState.V2_LENGTH_HI:
        this.payloadLength |= byte << 8;
        this.buffer = this.buffer.slice(1);
        if (this.payloadLength > MSP_V2_MAX_PAYLOAD) {
          this.stats.badLength++;
          this.state = ParserState.IDLE;
          return null;
        }
        this.payload = new Uint8Array(this.payloadLength);
        this.payloadOffset = 0;
        if (this.payloadLength === 0) {
          this.state = ParserState.V2_CRC;
        } else {
          this.state = ParserState.V2_PAYLOAD;
        }
        return null;

      case ParserState.V2_PAYLOAD:
        this.payload[this.payloadOffset++] = byte;
        this.buffer = this.buffer.slice(1);
        if (this.payloadOffset >= this.payloadLength) {
          this.state = ParserState.V2_CRC;
        }
        return null;

      case ParserState.V2_CRC: {
        const crc = byte;
        this.buffer = this.buffer.slice(1);
        this.state = ParserState.IDLE;

        // Calculate expected CRC
        const crcData = new Uint8Array(5 + this.payloadLength);
        crcData[0] = this.flag;
        crcData[1] = this.command & 0xff;
        crcData[2] = (this.command >> 8) & 0xff;
        crcData[3] = this.payloadLength & 0xff;
        crcData[4] = (this.payloadLength >> 8) & 0xff;
        crcData.set(this.payload, 5);
        const expectedCrc = crc8DvbS2(crcData);

        if (crc !== expectedCrc) {
          this.stats.badChecksum++;
          return null;
        }

        // Valid packet
        this.stats.packetsReceived++;
        this.stats.packetsV2++;

        return {
          version: 2,
          direction: this.direction,
          flag: this.flag,
          command: this.command,
          payload: this.payload,
          checksum: crc,
          timestamp: Date.now(),
        };
      }

      default:
        this.state = ParserState.IDLE;
        return null;
    }
  }
}

/**
 * Parse a single complete MSP packet from buffer
 * Useful for testing or when you know you have a complete packet
 */
export function parseMspPacket(buffer: Uint8Array): MSPPacket | null {
  const parser = new MSPParser();
  const packets = parser.parseSync(buffer);
  return packets[0] ?? null;
}
