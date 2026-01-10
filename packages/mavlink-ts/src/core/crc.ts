/**
 * MAVLink X25 CRC Implementation
 * Reference: MissionPlanner/ExtLibs/Mavlink/MavlinkCRC.cs
 */

const X25_INIT_CRC = 0xffff;

/**
 * Accumulate one byte into the CRC
 * Direct port from MavlinkCRC.cs lines 8-15
 */
export function crcAccumulate(byte: number, crc: number): number {
  let ch = (byte ^ (crc & 0x00ff)) & 0xff;
  ch = (ch ^ ((ch << 4) & 0xff)) & 0xff;
  return ((crc >> 8) ^ (ch << 8) ^ (ch << 3) ^ (ch >> 4)) & 0xffff;
}

/**
 * Calculate CRC for a buffer, skipping the first byte (header marker)
 * Reference: MavlinkCRC.cs lines 18-39
 */
export function crcCalculate(buffer: Uint8Array, length: number): number {
  if (length < 1) {
    return X25_INIT_CRC;
  }

  let crc = X25_INIT_CRC;

  // Start at index 1 to skip header byte (STX)
  for (let i = 1; i < length; i++) {
    // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
    crc = crcAccumulate(buffer[i]!, crc);
  }

  return crc;
}

/**
 * Calculate CRC with the message-specific CRC extra byte
 * This is how MAVLink validates packets - each message type has a unique CRC extra
 */
export function crcCalculateWithExtra(
  buffer: Uint8Array,
  length: number,
  crcExtra: number
): number {
  let crc = crcCalculate(buffer, length);
  crc = crcAccumulate(crcExtra, crc);
  return crc;
}

/**
 * Extract CRC low and high bytes for packet construction
 */
export function crcToBytes(crc: number): [number, number] {
  return [crc & 0xff, (crc >> 8) & 0xff];
}
