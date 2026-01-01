/**
 * CRC32 Calculation
 *
 * DfuSe files use CRC32 (polynomial 0xEDB88320, same as zlib/gzip)
 */

// Pre-computed CRC32 table (polynomial 0xEDB88320, reflected)
const CRC32_TABLE = new Uint32Array(256);

// Initialize table
(function initCrcTable() {
  for (let i = 0; i < 256; i++) {
    let crc = i;
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
    CRC32_TABLE[i] = crc >>> 0;
  }
})();

/**
 * Calculate CRC32 checksum
 * @param data Data to checksum
 * @param initial Initial CRC value (default: 0xFFFFFFFF)
 * @returns CRC32 value
 */
export function crc32(data: Buffer | Uint8Array, initial: number = 0xFFFFFFFF): number {
  let crc = initial >>> 0;

  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    crc = (CRC32_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)) >>> 0;
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Calculate CRC32 checksum with continuation
 * Allows calculating CRC over multiple buffers
 * @param data Data to add to checksum
 * @param previousCrc Previous CRC state (use 0xFFFFFFFF for first call)
 * @returns CRC32 state (call finalizeCrc32 to get final value)
 */
export function updateCrc32(data: Buffer | Uint8Array, previousCrc: number = 0xFFFFFFFF): number {
  let crc = previousCrc >>> 0;

  for (let i = 0; i < data.length; i++) {
    const byte = data[i]!;
    crc = (CRC32_TABLE[(crc ^ byte) & 0xFF]! ^ (crc >>> 8)) >>> 0;
  }

  return crc;
}

/**
 * Finalize CRC32 calculation
 * @param crc CRC state from updateCrc32
 * @returns Final CRC32 value
 */
export function finalizeCrc32(crc: number): number {
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * Verify CRC32 checksum
 * @param data Data to verify
 * @param expectedCrc Expected CRC value
 * @returns true if CRC matches
 */
export function verifyCrc32(data: Buffer | Uint8Array, expectedCrc: number): boolean {
  return crc32(data) === expectedCrc;
}
