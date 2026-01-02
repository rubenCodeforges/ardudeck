/**
 * MSP Protocol Serializer
 *
 * Builds MSP v1 and v2 request packets for sending to flight controllers.
 */

import {
  MSP_V1_HEADER,
  MSP_V2_HEADER,
  MSP_DIRECTION_REQUEST,
  MSP_V1_MAX_PAYLOAD,
  MSP_V2_MAX_PAYLOAD,
} from './constants.js';
import { mspV1Checksum, crc8DvbS2 } from './crc.js';

// =============================================================================
// MSP v1 Packet Building
// =============================================================================

/**
 * Build an MSP v1 request packet (no payload)
 *
 * Packet format: [$] [M] [<] [length] [command] [checksum]
 *
 * @param command MSP command ID
 * @returns Complete packet ready to send
 */
export function buildMspV1Request(command: number): Uint8Array {
  const packet = new Uint8Array(6);
  packet[0] = MSP_V1_HEADER[0]; // $
  packet[1] = MSP_V1_HEADER[1]; // M
  packet[2] = MSP_DIRECTION_REQUEST; // <
  packet[3] = 0; // length
  packet[4] = command;
  packet[5] = mspV1Checksum([0, command]); // checksum of length ^ command

  return packet;
}

/**
 * Build an MSP v1 request packet with payload
 *
 * Packet format: [$] [M] [<] [length] [command] [payload...] [checksum]
 *
 * @param command MSP command ID
 * @param payload Payload data
 * @returns Complete packet ready to send
 */
export function buildMspV1RequestWithPayload(
  command: number,
  payload: Uint8Array | number[]
): Uint8Array {
  const payloadArray = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

  if (payloadArray.length > MSP_V1_MAX_PAYLOAD) {
    throw new Error(`Payload too large for MSP v1: ${payloadArray.length} > ${MSP_V1_MAX_PAYLOAD}`);
  }

  const packet = new Uint8Array(6 + payloadArray.length);
  packet[0] = MSP_V1_HEADER[0]; // $
  packet[1] = MSP_V1_HEADER[1]; // M
  packet[2] = MSP_DIRECTION_REQUEST; // <
  packet[3] = payloadArray.length; // length
  packet[4] = command;
  packet.set(payloadArray, 5); // payload

  // Calculate checksum: XOR of length, command, and payload
  const checksumData = new Uint8Array(2 + payloadArray.length);
  checksumData[0] = payloadArray.length;
  checksumData[1] = command;
  checksumData.set(payloadArray, 2);
  packet[5 + payloadArray.length] = mspV1Checksum(checksumData);

  return packet;
}

// =============================================================================
// MSP v2 Packet Building
// =============================================================================

/**
 * Build an MSP v2 request packet (no payload)
 *
 * Packet format: [$] [X] [<] [flag] [cmd_lo] [cmd_hi] [len_lo] [len_hi] [crc]
 *
 * @param command MSP command ID (can be > 255 for v2 extended commands)
 * @param flag Optional flag byte (default 0)
 * @returns Complete packet ready to send
 */
export function buildMspV2Request(command: number, flag: number = 0): Uint8Array {
  const packet = new Uint8Array(9);
  packet[0] = MSP_V2_HEADER[0]; // $
  packet[1] = MSP_V2_HEADER[1]; // X
  packet[2] = MSP_DIRECTION_REQUEST; // <
  packet[3] = flag;
  packet[4] = command & 0xff;
  packet[5] = (command >> 8) & 0xff;
  packet[6] = 0; // length low
  packet[7] = 0; // length high

  // CRC covers: flag, cmd_lo, cmd_hi, len_lo, len_hi
  const crcData = new Uint8Array([flag, command & 0xff, (command >> 8) & 0xff, 0, 0]);
  packet[8] = crc8DvbS2(crcData);

  return packet;
}

/**
 * Build an MSP v2 request packet with payload
 *
 * Packet format: [$] [X] [<] [flag] [cmd_lo] [cmd_hi] [len_lo] [len_hi] [payload...] [crc]
 *
 * @param command MSP command ID
 * @param payload Payload data
 * @param flag Optional flag byte (default 0)
 * @returns Complete packet ready to send
 */
export function buildMspV2RequestWithPayload(
  command: number,
  payload: Uint8Array | number[],
  flag: number = 0
): Uint8Array {
  const payloadArray = payload instanceof Uint8Array ? payload : new Uint8Array(payload);

  if (payloadArray.length > MSP_V2_MAX_PAYLOAD) {
    throw new Error(`Payload too large for MSP v2: ${payloadArray.length} > ${MSP_V2_MAX_PAYLOAD}`);
  }

  const packet = new Uint8Array(9 + payloadArray.length);
  packet[0] = MSP_V2_HEADER[0]; // $
  packet[1] = MSP_V2_HEADER[1]; // X
  packet[2] = MSP_DIRECTION_REQUEST; // <
  packet[3] = flag;
  packet[4] = command & 0xff;
  packet[5] = (command >> 8) & 0xff;
  packet[6] = payloadArray.length & 0xff;
  packet[7] = (payloadArray.length >> 8) & 0xff;
  packet.set(payloadArray, 8);

  // CRC covers: flag, cmd_lo, cmd_hi, len_lo, len_hi, payload
  const crcData = new Uint8Array(5 + payloadArray.length);
  crcData[0] = flag;
  crcData[1] = command & 0xff;
  crcData[2] = (command >> 8) & 0xff;
  crcData[3] = payloadArray.length & 0xff;
  crcData[4] = (payloadArray.length >> 8) & 0xff;
  crcData.set(payloadArray, 5);
  packet[8 + payloadArray.length] = crc8DvbS2(crcData);

  return packet;
}

// =============================================================================
// Auto-Select Version
// =============================================================================

/**
 * Build an MSP request packet, automatically selecting v1 or v2
 *
 * - Uses v1 for commands <= 255 with small payloads
 * - Uses v2 for commands > 255 or large payloads
 *
 * @param command MSP command ID
 * @param payload Optional payload data
 * @param preferV2 Force v2 even for small commands
 * @returns Complete packet ready to send
 */
export function buildMspRequest(
  command: number,
  payload?: Uint8Array | number[],
  preferV2: boolean = false
): Uint8Array {
  const payloadArray = payload
    ? payload instanceof Uint8Array
      ? payload
      : new Uint8Array(payload)
    : undefined;

  // Use v2 if:
  // - Command ID > 255
  // - Payload > 255 bytes
  // - Explicitly requested
  const useV2 =
    preferV2 || command > 255 || (payloadArray && payloadArray.length > MSP_V1_MAX_PAYLOAD);

  if (useV2) {
    return payloadArray
      ? buildMspV2RequestWithPayload(command, payloadArray)
      : buildMspV2Request(command);
  } else {
    return payloadArray
      ? buildMspV1RequestWithPayload(command, payloadArray)
      : buildMspV1Request(command);
  }
}

// =============================================================================
// Payload Helpers
// =============================================================================

/**
 * Create a payload buffer and write helper
 */
export class PayloadBuilder {
  private buffer: number[] = [];

  /** Write unsigned 8-bit integer */
  writeU8(value: number): this {
    this.buffer.push(value & 0xff);
    return this;
  }

  /** Write signed 8-bit integer */
  writeS8(value: number): this {
    this.buffer.push(value < 0 ? (value + 256) & 0xff : value & 0xff);
    return this;
  }

  /** Write unsigned 16-bit integer (little-endian) */
  writeU16(value: number): this {
    this.buffer.push(value & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    return this;
  }

  /** Write signed 16-bit integer (little-endian) */
  writeS16(value: number): this {
    if (value < 0) value += 65536;
    this.buffer.push(value & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    return this;
  }

  /** Write unsigned 32-bit integer (little-endian) */
  writeU32(value: number): this {
    this.buffer.push(value & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    this.buffer.push((value >> 16) & 0xff);
    this.buffer.push((value >> 24) & 0xff);
    return this;
  }

  /** Write signed 32-bit integer (little-endian) */
  writeS32(value: number): this {
    if (value < 0) value += 4294967296;
    this.buffer.push(value & 0xff);
    this.buffer.push((value >> 8) & 0xff);
    this.buffer.push((value >> 16) & 0xff);
    this.buffer.push((value >> 24) & 0xff);
    return this;
  }

  /** Write string (fixed length, null-padded) */
  writeString(value: string, length: number): this {
    for (let i = 0; i < length; i++) {
      this.buffer.push(i < value.length ? value.charCodeAt(i) : 0);
    }
    return this;
  }

  /** Write raw bytes */
  writeBytes(bytes: Uint8Array | number[]): this {
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]!);
    }
    return this;
  }

  /** Get the built payload */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }

  /** Get current length */
  get length(): number {
    return this.buffer.length;
  }
}

/**
 * Payload reader helper
 */
export class PayloadReader {
  private offset: number = 0;

  constructor(private payload: Uint8Array) {}

  /** Read unsigned 8-bit integer */
  readU8(): number {
    return this.payload[this.offset++] ?? 0;
  }

  /** Read signed 8-bit integer */
  readS8(): number {
    const val = this.payload[this.offset++] ?? 0;
    return val > 127 ? val - 256 : val;
  }

  /** Read unsigned 16-bit integer (little-endian) */
  readU16(): number {
    const lo = this.payload[this.offset++] ?? 0;
    const hi = this.payload[this.offset++] ?? 0;
    return lo | (hi << 8);
  }

  /** Read signed 16-bit integer (little-endian) */
  readS16(): number {
    const val = this.readU16();
    return val > 32767 ? val - 65536 : val;
  }

  /** Read unsigned 32-bit integer (little-endian) */
  readU32(): number {
    const b0 = this.payload[this.offset++] ?? 0;
    const b1 = this.payload[this.offset++] ?? 0;
    const b2 = this.payload[this.offset++] ?? 0;
    const b3 = this.payload[this.offset++] ?? 0;
    return b0 | (b1 << 8) | (b2 << 16) | (b3 << 24);
  }

  /** Read signed 32-bit integer (little-endian) */
  readS32(): number {
    const val = this.readU32();
    return val > 2147483647 ? val - 4294967296 : val;
  }

  /** Read string (fixed length or null-terminated) */
  readString(length: number): string {
    let str = '';
    for (let i = 0; i < length && this.offset < this.payload.length; i++) {
      const byte = this.payload[this.offset++]!;
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }
    return str;
  }

  /** Read remaining bytes as string (null-terminated or to end) */
  readRemainingString(): string {
    let str = '';
    while (this.offset < this.payload.length) {
      const byte = this.payload[this.offset++]!;
      if (byte === 0) break;
      str += String.fromCharCode(byte);
    }
    return str;
  }

  /** Read raw bytes */
  readBytes(length: number): Uint8Array {
    const bytes = new Uint8Array(this.payload.buffer, this.payload.byteOffset + this.offset, length);
    this.offset += length;
    return new Uint8Array(bytes); // Create copy to ensure ArrayBuffer type
  }

  /** Get remaining bytes */
  remaining(): number {
    return this.payload.length - this.offset;
  }

  /** Check if at end */
  eof(): boolean {
    return this.offset >= this.payload.length;
  }

  /** Skip bytes */
  skip(count: number): this {
    this.offset += count;
    return this;
  }

  /** Get current offset */
  get position(): number {
    return this.offset;
  }
}
