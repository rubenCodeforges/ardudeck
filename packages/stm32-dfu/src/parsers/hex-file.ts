/**
 * Intel HEX File Parser
 *
 * Parses Intel HEX format (.hex) files commonly used for firmware.
 *
 * Record format: :LLAAAARR[DD...]CC
 * - : = Start code
 * - LL = Byte count
 * - AAAA = 16-bit address
 * - RR = Record type
 * - DD = Data bytes
 * - CC = Checksum
 *
 * Record types:
 * - 00 = Data
 * - 01 = End of File
 * - 02 = Extended Segment Address
 * - 03 = Start Segment Address
 * - 04 = Extended Linear Address
 * - 05 = Start Linear Address
 */

import { STM32_FLASH_START } from '../constants.js';
import type { FirmwareImage, MemorySegment } from '../types.js';
import { ParseError } from '../types.js';

interface HexRecord {
  byteCount: number;
  address: number;
  type: number;
  data: Uint8Array;
  checksum: number;
}

/**
 * Parse a single Intel HEX record line
 */
function parseRecord(line: string, lineNum: number): HexRecord | null {
  line = line.trim();

  // Skip empty lines
  if (line.length === 0) {
    return null;
  }

  // Must start with :
  if (line[0] !== ':') {
    throw new ParseError(`Line ${lineNum}: Missing start code ':'`);
  }

  // Minimum length: :LLAAAATTCC = 11 characters
  if (line.length < 11) {
    throw new ParseError(`Line ${lineNum}: Record too short`);
  }

  // Parse fields
  const byteCount = parseInt(line.substring(1, 3), 16);
  const address = parseInt(line.substring(3, 7), 16);
  const type = parseInt(line.substring(7, 9), 16);

  // Check line length matches byte count
  const expectedLength = 11 + byteCount * 2;
  if (line.length < expectedLength) {
    throw new ParseError(`Line ${lineNum}: Record truncated, expected ${expectedLength} chars`);
  }

  // Parse data bytes
  const data = new Uint8Array(byteCount);
  for (let i = 0; i < byteCount; i++) {
    const offset = 9 + i * 2;
    data[i] = parseInt(line.substring(offset, offset + 2), 16);
  }

  // Parse and verify checksum
  const checksum = parseInt(line.substring(9 + byteCount * 2, 11 + byteCount * 2), 16);

  // Calculate checksum (two's complement of sum of all bytes)
  let sum = byteCount + (address >> 8) + (address & 0xFF) + type;
  for (const byte of data) {
    sum += byte;
  }
  const computedChecksum = (~sum + 1) & 0xFF;

  if (computedChecksum !== checksum) {
    throw new ParseError(
      `Line ${lineNum}: Checksum mismatch, computed 0x${computedChecksum.toString(16)}, got 0x${checksum.toString(16)}`,
    );
  }

  return {
    byteCount,
    address,
    type,
    data,
    checksum,
  };
}

/**
 * Parse Intel HEX file content
 * @param content HEX file content as string
 * @returns FirmwareImage
 */
export function parseHexFile(content: string): FirmwareImage {
  const lines = content.split(/\r?\n/);

  // Extended address state
  let extendedAddress = 0;
  let startAddress: number | undefined;

  // Collect all data with addresses
  const dataMap = new Map<number, number>(); // address -> byte value

  for (let i = 0; i < lines.length; i++) {
    const record = parseRecord(lines[i]!, i + 1);
    if (!record) {
      continue;
    }

    switch (record.type) {
      case 0x00: // Data record
        for (let j = 0; j < record.data.length; j++) {
          const fullAddress = extendedAddress + record.address + j;
          dataMap.set(fullAddress, record.data[j]!);
        }
        break;

      case 0x01: // End of File
        break;

      case 0x02: // Extended Segment Address (shifts left 4 bits)
        if (record.byteCount !== 2) {
          throw new ParseError(`Line ${i + 1}: Extended segment address must be 2 bytes`);
        }
        extendedAddress = ((record.data[0]! << 8) | record.data[1]!) << 4;
        break;

      case 0x03: // Start Segment Address (CS:IP for 8086)
        // Ignored for ARM
        break;

      case 0x04: // Extended Linear Address (upper 16 bits)
        if (record.byteCount !== 2) {
          throw new ParseError(`Line ${i + 1}: Extended linear address must be 2 bytes`);
        }
        extendedAddress = ((record.data[0]! << 8) | record.data[1]!) << 16;
        break;

      case 0x05: // Start Linear Address (32-bit address)
        if (record.byteCount !== 4) {
          throw new ParseError(`Line ${i + 1}: Start linear address must be 4 bytes`);
        }
        startAddress =
          (record.data[0]! << 24) |
          (record.data[1]! << 16) |
          (record.data[2]! << 8) |
          record.data[3]!;
        break;

      default:
        // Ignore unknown record types
        break;
    }
  }

  if (dataMap.size === 0) {
    throw new ParseError('No data records found in HEX file');
  }

  // Convert map to sorted array of addresses
  const addresses = Array.from(dataMap.keys()).sort((a, b) => a - b);

  // Coalesce into contiguous segments
  const segments: MemorySegment[] = [];
  let currentSegmentStart = addresses[0]!;
  let currentData: number[] = [dataMap.get(addresses[0]!)!];
  let expectedNext = addresses[0]! + 1;

  for (let i = 1; i < addresses.length; i++) {
    const addr = addresses[i]!;

    if (addr === expectedNext) {
      // Contiguous - add to current segment
      currentData.push(dataMap.get(addr)!);
      expectedNext = addr + 1;
    } else {
      // Gap - save current segment and start new one
      segments.push({
        address: currentSegmentStart,
        data: new Uint8Array(currentData),
      });
      currentSegmentStart = addr;
      currentData = [dataMap.get(addr)!];
      expectedNext = addr + 1;
    }
  }

  // Save final segment
  segments.push({
    address: currentSegmentStart,
    data: new Uint8Array(currentData),
  });

  const totalSize = segments.reduce((sum, seg) => sum + seg.data.length, 0);

  return {
    segments,
    totalSize,
  };
}

/**
 * Check if content appears to be an Intel HEX file
 * @param content File content
 * @returns true if it looks like Intel HEX
 */
export function isHexFile(content: string): boolean {
  const firstLine = content.trim().split(/\r?\n/)[0];
  return firstLine !== undefined && firstLine.startsWith(':');
}
