/**
 * DfuSe Protocol - ST's extensions to USB DFU for STM32 devices
 *
 * DfuSe uses block 0 for special commands:
 * - SET_ADDRESS: Set flash pointer before download
 * - ERASE_PAGE: Erase flash sector
 * - READ_UNPROTECT: Remove read protection (mass erases flash)
 */

import type { Device } from 'usb';
import {
  DFUSE_COMMAND_SET_ADDRESS,
  DFUSE_COMMAND_ERASE_PAGE,
  DFUSE_COMMAND_READ_UNPROTECT,
  DFUSE_COMMAND_BLOCK,
  DfuState,
  ERASE_TIMEOUT,
  DFU_TRANSFER_SIZE,
} from './constants.js';
import {
  dfuDownload,
  dfuUpload,
  dfuGetStatus,
  dfuWaitForState,
  dfuResetToIdle,
} from './dfu-protocol.js';
import type { MemoryLayout, MemoryLayoutSegment, ProgressCallback } from './types.js';
import { DfuError } from './types.js';

/**
 * Set flash address pointer for subsequent download operations
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param address Target address
 */
export async function dfuseSetAddress(device: Device, interfaceNumber: number, address: number): Promise<void> {
  // Command format: [0x21, addr_byte0, addr_byte1, addr_byte2, addr_byte3]
  const cmd = new Uint8Array([
    DFUSE_COMMAND_SET_ADDRESS,
    address & 0xFF,
    (address >> 8) & 0xFF,
    (address >> 16) & 0xFF,
    (address >> 24) & 0xFF,
  ]);

  await dfuDownload(device, interfaceNumber, DFUSE_COMMAND_BLOCK, cmd);
  await dfuWaitForState(device, interfaceNumber, [DfuState.dfuDNLOAD_IDLE]);
}

/**
 * Erase a flash sector/page
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param address Address within sector to erase
 */
export async function dfuseEraseSector(device: Device, interfaceNumber: number, address: number): Promise<void> {
  // Command format: [0x41, addr_byte0, addr_byte1, addr_byte2, addr_byte3]
  const cmd = new Uint8Array([
    DFUSE_COMMAND_ERASE_PAGE,
    address & 0xFF,
    (address >> 8) & 0xFF,
    (address >> 16) & 0xFF,
    (address >> 24) & 0xFF,
  ]);

  await dfuDownload(device, interfaceNumber, DFUSE_COMMAND_BLOCK, cmd);

  // Erase can take a while, wait with extended timeout
  await dfuWaitForState(device, interfaceNumber, [DfuState.dfuDNLOAD_IDLE], ERASE_TIMEOUT);
}

/**
 * Mass erase flash (removes read protection, erases all flash)
 * WARNING: This erases ALL flash contents!
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuseMassErase(device: Device, interfaceNumber: number): Promise<void> {
  // Just the erase command byte, no address
  const cmd = new Uint8Array([DFUSE_COMMAND_ERASE_PAGE]);

  await dfuDownload(device, interfaceNumber, DFUSE_COMMAND_BLOCK, cmd);
  await dfuWaitForState(device, interfaceNumber, [DfuState.dfuDNLOAD_IDLE], ERASE_TIMEOUT * 2);
}

/**
 * Remove read protection (triggers mass erase!)
 * WARNING: This erases ALL flash contents!
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuseReadUnprotect(device: Device, interfaceNumber: number): Promise<void> {
  const cmd = new Uint8Array([DFUSE_COMMAND_READ_UNPROTECT]);

  await dfuDownload(device, interfaceNumber, DFUSE_COMMAND_BLOCK, cmd);

  // Device will reset after this, so we can't wait for status
  // Just wait a bit for the operation to complete
  await new Promise(resolve => setTimeout(resolve, 2000));
}

/**
 * Leave DFU mode and jump to application
 * Sends empty download with block 0 which triggers manifest
 * @param device USB device
 * @param interfaceNumber Interface number
 */
export async function dfuseLeave(device: Device, interfaceNumber: number): Promise<void> {
  try {
    // Send empty download to trigger manifest state
    await dfuDownload(device, interfaceNumber, DFUSE_COMMAND_BLOCK, new Uint8Array(0));

    // Try to get status - device may reset before responding
    const status = await dfuGetStatus(device, interfaceNumber);

    // Wait for manifest to complete
    if (status.state === DfuState.dfuMANIFEST_SYNC ||
        status.state === DfuState.dfuMANIFEST) {
      // Wait for manifest phase
      await new Promise(resolve => setTimeout(resolve, status.pollTimeout || 100));

      // Device should reset - try to get final status
      try {
        await dfuGetStatus(device, interfaceNumber);
      } catch {
        // Expected - device has reset
      }
    }
  } catch {
    // Expected if device resets quickly
  }
}

/**
 * Download data to flash at specified address
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param address Starting flash address
 * @param data Data to write
 * @param transferSize Block size for transfers
 * @param onProgress Optional progress callback
 */
export async function dfuseDownload(
  device: Device,
  interfaceNumber: number,
  address: number,
  data: Uint8Array,
  transferSize: number = DFU_TRANSFER_SIZE,
  onProgress?: ProgressCallback,
): Promise<void> {
  // First, set the address pointer
  await dfuseSetAddress(device, interfaceNumber, address);

  const totalBlocks = Math.ceil(data.length / transferSize);
  let offset = 0;
  let blockNum = 2; // DfuSe starts data blocks at 2 (0 = commands, 1 = reserved)

  for (let i = 0; i < totalBlocks; i++) {
    const end = Math.min(offset + transferSize, data.length);
    const block = data.slice(offset, end);

    // Download block
    await dfuDownload(device, interfaceNumber, blockNum, block);

    // Wait for download to complete
    await dfuWaitForState(device, interfaceNumber, [DfuState.dfuDNLOAD_IDLE]);

    // BSOD FIX: Add delay between download blocks to prevent USB driver stress
    await new Promise(resolve => setTimeout(resolve, 10));

    offset = end;
    blockNum++;

    // Report progress
    if (onProgress) {
      onProgress({
        phase: 'download',
        current: offset,
        total: data.length,
        percent: Math.round((offset / data.length) * 100),
      });
    }
  }
}

/**
 * Upload (read) data from flash
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param address Starting flash address
 * @param length Number of bytes to read
 * @param transferSize Block size for transfers
 * @returns Read data
 */
export async function dfuseUpload(
  device: Device,
  interfaceNumber: number,
  address: number,
  length: number,
  transferSize: number = DFU_TRANSFER_SIZE,
): Promise<Uint8Array> {
  // Set address pointer
  await dfuseSetAddress(device, interfaceNumber, address);

  // Now read using regular DFU upload
  const result = new Uint8Array(length);
  let offset = 0;
  let blockNum = 2;

  while (offset < length) {
    const readSize = Math.min(transferSize, length - offset);
    const block = await dfuUpload(device, interfaceNumber, blockNum, readSize);

    result.set(new Uint8Array(block), offset);
    offset += block.length;
    blockNum++;

    // Short read means end of data
    if (block.length < readSize) {
      break;
    }
  }

  // Return to idle
  await dfuResetToIdle(device, interfaceNumber);

  return result.slice(0, offset);
}

/**
 * Parse DfuSe memory layout from interface string
 * Format: "@Internal Flash /0x08000000/04*016Kg,01*064Kg,07*128Kg"
 * @param interfaceString Interface alternate setting string
 * @returns Parsed memory layout or null
 */
export function parseMemoryLayout(interfaceString: string): MemoryLayout | null {
  // Match pattern: @Name /0xAddress/segments
  const match = interfaceString.match(/@([^/]+)\s*\/0x([0-9A-Fa-f]+)\/(.+)/);
  if (!match || !match[1] || !match[2] || !match[3]) {
    return null;
  }

  const name = match[1].trim();
  const startAddress = parseInt(match[2], 16);
  const segmentStr = match[3];

  // Parse segments like "04*016Kg,01*064Kg"
  const segments: MemoryLayoutSegment[] = [];
  const segmentParts = segmentStr.split(',');

  let currentAddress = startAddress;
  let totalSize = 0;

  for (const part of segmentParts) {
    // Match pattern: count*sizeModifier
    // Modifiers: B=bytes, K=KB, M=MB, a/b/c/d/e/f/g = readable/erasable/writable
    const segMatch = part.trim().match(/(\d+)\*(\d+)([BKM])([a-g]*)/i);
    if (!segMatch || !segMatch[1] || !segMatch[2] || !segMatch[3]) {
      continue;
    }

    const pageCount = parseInt(segMatch[1], 10);
    let pageSize = parseInt(segMatch[2], 10);
    const sizeModifier = segMatch[3].toUpperCase();
    const memoryType = segMatch[4] || '';

    // Apply size modifier
    switch (sizeModifier) {
      case 'K':
        pageSize *= 1024;
        break;
      case 'M':
        pageSize *= 1024 * 1024;
        break;
      // 'B' is bytes, no change needed
    }

    segments.push({
      address: currentAddress,
      pageCount,
      pageSize,
      memoryType,
    });

    const segmentSize = pageCount * pageSize;
    currentAddress += segmentSize;
    totalSize += segmentSize;
  }

  return {
    name,
    segments,
    totalSize,
  };
}

/**
 * Get sectors that need to be erased for a given address range
 * @param layout Memory layout
 * @param startAddress Start of data region
 * @param length Data length
 * @returns Array of sector start addresses to erase
 */
export function getSectorsToErase(
  layout: MemoryLayout,
  startAddress: number,
  length: number,
): number[] {
  const endAddress = startAddress + length;
  const sectors: number[] = [];

  for (const segment of layout.segments) {
    // Check if segment overlaps with our data range
    const segmentEnd = segment.address + (segment.pageCount * segment.pageSize);

    if (segment.address >= endAddress || segmentEnd <= startAddress) {
      // No overlap
      continue;
    }

    // Find which pages in this segment need erasing
    for (let i = 0; i < segment.pageCount; i++) {
      const pageStart = segment.address + (i * segment.pageSize);
      const pageEnd = pageStart + segment.pageSize;

      if (pageStart < endAddress && pageEnd > startAddress) {
        sectors.push(pageStart);
      }
    }
  }

  return sectors;
}

/**
 * Erase sectors for a given address range
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param layout Memory layout
 * @param startAddress Start of data region
 * @param length Data length
 * @param onProgress Optional progress callback
 */
export async function dfuseEraseRange(
  device: Device,
  interfaceNumber: number,
  layout: MemoryLayout,
  startAddress: number,
  length: number,
  onProgress?: ProgressCallback,
): Promise<void> {
  const sectors = getSectorsToErase(layout, startAddress, length);

  for (let i = 0; i < sectors.length; i++) {
    const sectorAddr = sectors[i]!;
    await dfuseEraseSector(device, interfaceNumber, sectorAddr);

    // BSOD FIX: Add delay between sector erases to let flash controller settle
    await new Promise(resolve => setTimeout(resolve, 50));

    if (onProgress) {
      onProgress({
        phase: 'erase',
        current: i + 1,
        total: sectors.length,
        percent: Math.round(((i + 1) / sectors.length) * 100),
        message: `Erasing sector at 0x${sectorAddr.toString(16).toUpperCase()}`,
      });
    }
  }
}

/**
 * Verify flash contents match expected data
 * @param device USB device
 * @param interfaceNumber Interface number
 * @param address Flash address
 * @param expected Expected data
 * @param transferSize Block size
 * @param onProgress Optional progress callback
 * @returns true if verification passed
 */
export async function dfuseVerify(
  device: Device,
  interfaceNumber: number,
  address: number,
  expected: Uint8Array,
  transferSize: number = DFU_TRANSFER_SIZE,
  onProgress?: ProgressCallback,
): Promise<boolean> {
  const actual = await dfuseUpload(device, interfaceNumber, address, expected.length, transferSize);

  if (actual.length !== expected.length) {
    throw new DfuError(
      `Verification failed: length mismatch (expected ${expected.length}, got ${actual.length})`,
    );
  }

  // Compare byte by byte
  for (let i = 0; i < expected.length; i++) {
    if (actual[i] !== expected[i]) {
      throw new DfuError(
        `Verification failed at offset 0x${i.toString(16)}: expected 0x${expected[i]!.toString(16)}, got 0x${actual[i]!.toString(16)}`,
      );
    }

    // Report progress periodically
    if (onProgress && i % transferSize === 0) {
      onProgress({
        phase: 'verify',
        current: i,
        total: expected.length,
        percent: Math.round((i / expected.length) * 100),
      });
    }
  }

  if (onProgress) {
    onProgress({
      phase: 'verify',
      current: expected.length,
      total: expected.length,
      percent: 100,
    });
  }

  return true;
}
