/**
 * DfuSe File Parser
 *
 * Parses .dfu files in ST's DfuSe format.
 *
 * File structure:
 * - Prefix (11 bytes): signature, version, file size, target count
 * - Targets: one or more target images
 *   - Target header (274 bytes): signature, alt setting, name, size, element count
 *   - Elements: one or more memory segments
 *     - Element header (8 bytes): address, size
 *     - Element data
 * - Suffix (16 bytes): device info, DFU version, signature, CRC
 */

import {
  DFUSE_SIGNATURE,
  DFUSE_PREFIX_LENGTH,
  DFUSE_SUFFIX_LENGTH,
} from '../constants.js';
import type {
  FirmwareImage,
  MemorySegment,
  DfusePrefix,
  DfuseSuffix,
  DfuseTargetHeader,
  DfuseElement,
} from '../types.js';
import { ParseError } from '../types.js';
import { crc32 } from '../utils/crc.js';

/**
 * Parse DfuSe file prefix (11 bytes)
 */
function parsePrefix(data: Buffer): DfusePrefix {
  if (data.length < DFUSE_PREFIX_LENGTH) {
    throw new ParseError(`File too small for DfuSe prefix: ${data.length} bytes`);
  }

  const signature = data.toString('ascii', 0, 5);
  if (signature !== DFUSE_SIGNATURE) {
    throw new ParseError(`Invalid DfuSe signature: "${signature}"`);
  }

  const version = data.readUInt8(5);
  const dfuImageSize = data.readUInt32LE(6);
  const targetCount = data.readUInt8(10);

  return {
    signature,
    version,
    dfuImageSize,
    targetCount,
  };
}

/**
 * Parse DfuSe file suffix (16 bytes)
 */
function parseSuffix(data: Buffer): DfuseSuffix {
  const offset = data.length - DFUSE_SUFFIX_LENGTH;
  if (offset < 0) {
    throw new ParseError(`File too small for DfuSe suffix`);
  }

  const suffix = data.slice(offset);

  // Read fields (note: little-endian)
  const deviceVersion = suffix.readUInt16LE(0);
  const productId = suffix.readUInt16LE(2);
  const vendorId = suffix.readUInt16LE(4);
  const dfuSpecVersion = suffix.readUInt16LE(6);
  const signature = suffix.toString('ascii', 8, 11);
  const length = suffix.readUInt8(11);
  const crc = suffix.readUInt32LE(12);

  // Validate signature (UFD reversed = DFU)
  if (signature !== 'UFD') {
    throw new ParseError(`Invalid DfuSe suffix signature: "${signature}"`);
  }

  return {
    deviceVersion,
    productId,
    vendorId,
    dfuSpecVersion,
    signature,
    length,
    crc,
  };
}

/**
 * Parse target header (274 bytes)
 */
function parseTargetHeader(data: Buffer, offset: number): { header: DfuseTargetHeader; nextOffset: number } {
  if (offset + 274 > data.length) {
    throw new ParseError('Unexpected end of file in target header');
  }

  const signature = data.toString('ascii', offset, offset + 6);
  if (signature !== 'Target') {
    throw new ParseError(`Invalid target signature: "${signature}"`);
  }

  const alternateSetting = data.readUInt8(offset + 6);
  const isNamed = data.readUInt32LE(offset + 7) === 1;

  let name: string | undefined;
  if (isNamed) {
    // Name is 255 bytes, null-terminated
    const nameBytes = data.slice(offset + 11, offset + 266);
    const nullIdx = nameBytes.indexOf(0);
    name = nameBytes.toString('ascii', 0, nullIdx >= 0 ? nullIdx : 255);
  }

  const targetSize = data.readUInt32LE(offset + 266);
  const elementCount = data.readUInt32LE(offset + 270);

  return {
    header: {
      signature,
      alternateSetting,
      isNamed,
      name,
      targetSize,
      elementCount,
    },
    nextOffset: offset + 274,
  };
}

/**
 * Parse element (8 byte header + data)
 */
function parseElement(data: Buffer, offset: number): { element: DfuseElement; nextOffset: number } {
  if (offset + 8 > data.length) {
    throw new ParseError('Unexpected end of file in element header');
  }

  const address = data.readUInt32LE(offset);
  const size = data.readUInt32LE(offset + 4);

  if (offset + 8 + size > data.length) {
    throw new ParseError(`Element size exceeds file: ${size} bytes at offset ${offset}`);
  }

  const elementData = new Uint8Array(data.slice(offset + 8, offset + 8 + size));

  return {
    element: {
      address,
      data: elementData,
    },
    nextOffset: offset + 8 + size,
  };
}

/**
 * Parse a DfuSe .dfu file
 * @param buffer File contents
 * @returns FirmwareImage
 */
export function parseDfuFile(buffer: Buffer): FirmwareImage {
  // Validate minimum size
  if (buffer.length < DFUSE_PREFIX_LENGTH + DFUSE_SUFFIX_LENGTH) {
    throw new ParseError(`File too small to be valid DfuSe: ${buffer.length} bytes`);
  }

  // Parse and validate prefix
  const prefix = parsePrefix(buffer);

  // Validate file size
  if (prefix.dfuImageSize !== buffer.length) {
    throw new ParseError(
      `File size mismatch: header says ${prefix.dfuImageSize}, actual is ${buffer.length}`,
    );
  }

  // Parse and validate suffix
  const suffix = parseSuffix(buffer);

  // Verify CRC (CRC32 of all bytes except last 4)
  const computedCrc = crc32(buffer.slice(0, buffer.length - 4));
  if (computedCrc !== suffix.crc) {
    throw new ParseError(
      `CRC mismatch: computed 0x${computedCrc.toString(16)}, file has 0x${suffix.crc.toString(16)}`,
    );
  }

  // Parse targets and elements
  const segments: MemorySegment[] = [];
  let offset = DFUSE_PREFIX_LENGTH;
  let targetName: string | undefined;
  let targetAlt: number | undefined;

  for (let t = 0; t < prefix.targetCount; t++) {
    const { header, nextOffset } = parseTargetHeader(buffer, offset);
    offset = nextOffset;

    // Use first target's info
    if (t === 0) {
      targetName = header.name;
      targetAlt = header.alternateSetting;
    }

    // Parse elements for this target
    for (let e = 0; e < header.elementCount; e++) {
      const { element, nextOffset: elemNext } = parseElement(buffer, offset);
      offset = elemNext;

      segments.push({
        address: element.address,
        data: element.data,
      });
    }
  }

  // Calculate total size
  const totalSize = segments.reduce((sum, seg) => sum + seg.data.length, 0);

  return {
    segments,
    totalSize,
    targetName,
    targetAlt,
  };
}

/**
 * Check if buffer appears to be a DfuSe file
 * @param buffer File buffer
 * @returns true if it looks like a DfuSe file
 */
export function isDfuFile(buffer: Buffer): boolean {
  if (buffer.length < DFUSE_PREFIX_LENGTH) {
    return false;
  }
  const signature = buffer.toString('ascii', 0, 5);
  return signature === DFUSE_SIGNATURE;
}
