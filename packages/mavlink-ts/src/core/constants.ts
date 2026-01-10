/**
 * MAVLink Protocol Constants
 * Reference: MissionPlanner/ExtLibs/Mavlink/Mavlink.cs lines 8-36
 */

// Protocol start markers
export const MAVLINK_STX_V2 = 0xfd; // MAVLink v2.0 start byte
export const MAVLINK_STX_V1 = 0xfe; // MAVLink v1.0 start byte

// Header sizes
export const MAVLINK_CORE_HEADER_LEN_V2 = 9; // Header bytes after STX for v2
export const MAVLINK_CORE_HEADER_LEN_V1 = 5; // Header bytes after STX for v1
export const MAVLINK_NUM_HEADER_BYTES_V2 = 10; // STX + core header
export const MAVLINK_NUM_HEADER_BYTES_V1 = 6; // STX + core header
export const MAVLINK_NUM_CHECKSUM_BYTES = 2;

// Payload limits
export const MAVLINK_MAX_PAYLOAD_LEN = 255;
export const MAVLINK_SIGNATURE_BLOCK_LEN = 13;
export const MAVLINK_MAX_PACKET_LEN_V2 =
  MAVLINK_NUM_HEADER_BYTES_V2 +
  MAVLINK_MAX_PAYLOAD_LEN +
  MAVLINK_NUM_CHECKSUM_BYTES +
  MAVLINK_SIGNATURE_BLOCK_LEN; // 280

export const MAVLINK_MAX_PACKET_LEN_V1 =
  MAVLINK_NUM_HEADER_BYTES_V1 +
  MAVLINK_MAX_PAYLOAD_LEN +
  MAVLINK_NUM_CHECKSUM_BYTES; // 263

// Incompatibility flags
export const MAVLINK_IFLAG_SIGNED = 0x01;

// Protocol version
export const MAVLINK_WIRE_PROTOCOL_VERSION = 2;

// Endianness (MAVLink is little-endian)
export const MAVLINK_LITTLE_ENDIAN = true;

// Signing timestamp epoch: 2015-01-01 00:00:00 UTC
export const MAVLINK_SIGNATURE_TIMESTAMP_EPOCH = Date.UTC(2015, 0, 1);
