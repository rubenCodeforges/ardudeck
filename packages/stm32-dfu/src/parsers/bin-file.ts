/**
 * Binary File Loader
 *
 * Loads raw binary firmware files (.bin).
 * Binary files need a base address to be specified since they contain no metadata.
 */

import { STM32_FLASH_START } from '../constants.js';
import type { FirmwareImage, MemorySegment } from '../types.js';
import { ParseError } from '../types.js';

/**
 * Load a raw binary file
 * @param buffer Binary file contents
 * @param baseAddress Starting flash address (default: STM32 flash start)
 * @returns FirmwareImage
 */
export function loadBinFile(
  buffer: Buffer | Uint8Array,
  baseAddress: number = STM32_FLASH_START,
): FirmwareImage {
  if (buffer.length === 0) {
    throw new ParseError('Binary file is empty');
  }

  // Ensure we have a Uint8Array
  const data = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);

  const segment: MemorySegment = {
    address: baseAddress,
    data,
  };

  return {
    segments: [segment],
    totalSize: data.length,
  };
}

/**
 * Load binary file with address autodetection from filename
 *
 * Supports filename patterns like:
 * - firmware_0x08000000.bin
 * - bootloader@0x08000000.bin
 * - app_08004000.bin
 *
 * @param buffer Binary file contents
 * @param filename Optional filename to extract address from
 * @param defaultAddress Address to use if not in filename
 * @returns FirmwareImage
 */
export function loadBinFileWithAutoAddress(
  buffer: Buffer | Uint8Array,
  filename?: string,
  defaultAddress: number = STM32_FLASH_START,
): FirmwareImage {
  let address = defaultAddress;

  if (filename) {
    // Try to extract address from filename
    // Patterns: 0x12345678, @0x12345678, _0x12345678, _12345678
    const match = filename.match(/[_@]?0?x?([0-9A-Fa-f]{8})/);
    if (match) {
      const extracted = parseInt(match[1]!, 16);
      // Sanity check - should be in reasonable flash range
      if (extracted >= 0x08000000 && extracted < 0x20000000) {
        address = extracted;
      }
    }
  }

  return loadBinFile(buffer, address);
}

/**
 * Merge multiple binary segments into contiguous regions
 * Fills gaps with 0xFF (erased flash value)
 * @param segments Array of memory segments
 * @returns Merged segments with gaps filled
 */
export function mergeSegments(segments: MemorySegment[]): MemorySegment[] {
  if (segments.length === 0) {
    return [];
  }

  if (segments.length === 1) {
    return segments;
  }

  // Sort by address
  const sorted = [...segments].sort((a, b) => a.address - b.address);

  const merged: MemorySegment[] = [];
  let current = sorted[0]!;

  for (let i = 1; i < sorted.length; i++) {
    const next = sorted[i]!;
    const currentEnd = current.address + current.data.length;

    if (next.address <= currentEnd) {
      // Overlapping or adjacent - merge
      const newEnd = Math.max(currentEnd, next.address + next.data.length);
      const newData = new Uint8Array(newEnd - current.address);

      // Copy current data
      newData.set(current.data, 0);

      // Copy next data (may overwrite if overlapping)
      newData.set(next.data, next.address - current.address);

      current = {
        address: current.address,
        data: newData,
      };
    } else {
      // Gap - check if we should fill or keep separate
      const gap = next.address - currentEnd;

      // If gap is small (< 64KB), fill with 0xFF
      if (gap < 65536) {
        const newEnd = next.address + next.data.length;
        const newData = new Uint8Array(newEnd - current.address);

        // Fill with 0xFF (erased flash)
        newData.fill(0xFF);

        // Copy current data
        newData.set(current.data, 0);

        // Copy next data
        newData.set(next.data, next.address - current.address);

        current = {
          address: current.address,
          data: newData,
        };
      } else {
        // Large gap - keep as separate segments
        merged.push(current);
        current = next;
      }
    }
  }

  merged.push(current);

  return merged;
}

/**
 * Pad binary data to alignment
 * @param data Data to pad
 * @param alignment Alignment in bytes
 * @param fillValue Fill value for padding
 * @returns Padded data
 */
export function padToAlignment(
  data: Uint8Array,
  alignment: number,
  fillValue: number = 0xFF,
): Uint8Array {
  const remainder = data.length % alignment;
  if (remainder === 0) {
    return data;
  }

  const padding = alignment - remainder;
  const padded = new Uint8Array(data.length + padding);
  padded.set(data, 0);
  padded.fill(fillValue, data.length);

  return padded;
}
