/**
 * Version and capability of autopilot software. This should be emitted in response to a request with MAV_CMD_REQUEST_MESSAGE.
 * Message ID: 148
 * CRC Extra: 39
 */
export interface AutopilotVersion {
  /** Bitmap of capabilities */
  capabilities: bigint;
  /** Firmware version number.         The field must be encoded as 4 bytes, where each byte (shown from MSB to LSB) is part of a semantic version: (major) (minor) (patch) (FIRMWARE_VERSION_TYPE). */
  flightSwVersion: number;
  /** Middleware version number */
  middlewareSwVersion: number;
  /** Operating system version number */
  osSwVersion: number;
  /** HW / board version (last 8 bits should be silicon ID, if any). The first 16 bits of this field specify a board type from an enumeration stored at https://github.com/PX4/PX4-Bootloader/blob/master/board_types.txt and with extensive additions at https://github.com/ArduPilot/ardupilot/blob/master/Tools/AP_Bootloader/board_types.txt */
  boardVersion: number;
  /** Custom version field, commonly the first 8 bytes of the git hash. This is not an unique identifier, but should allow to identify the commit using the main version number even for very large code bases. */
  flightCustomVersion: number[];
  /** Custom version field, commonly the first 8 bytes of the git hash. This is not an unique identifier, but should allow to identify the commit using the main version number even for very large code bases. */
  middlewareCustomVersion: number[];
  /** Custom version field, commonly the first 8 bytes of the git hash. This is not an unique identifier, but should allow to identify the commit using the main version number even for very large code bases. */
  osCustomVersion: number[];
  /** ID of the board vendor */
  vendorId: number;
  /** ID of the product */
  productId: number;
  /** UID if provided by hardware (see uid2) */
  uid: bigint;
  /** UID if provided by hardware (supersedes the uid field. If this is non-zero, use this field, otherwise use uid) */
  uid2: number[];
}

export const AUTOPILOT_VERSION_ID = 148;
export const AUTOPILOT_VERSION_CRC_EXTRA = 39;
export const AUTOPILOT_VERSION_MIN_LENGTH = 78;
export const AUTOPILOT_VERSION_MAX_LENGTH = 78;

export function serializeAutopilotVersion(msg: AutopilotVersion): Uint8Array {
  const buffer = new Uint8Array(78);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.capabilities), true);
  view.setBigUint64(8, BigInt(msg.uid), true);
  view.setUint32(16, msg.flightSwVersion, true);
  view.setUint32(20, msg.middlewareSwVersion, true);
  view.setUint32(24, msg.osSwVersion, true);
  view.setUint32(28, msg.boardVersion, true);
  view.setUint16(32, msg.vendorId, true);
  view.setUint16(34, msg.productId, true);
  // Array: flight_custom_version
  for (let i = 0; i < 8; i++) {
    buffer[36 + i * 1] = msg.flightCustomVersion[i] ?? 0 & 0xff;
  }
  // Array: middleware_custom_version
  for (let i = 0; i < 8; i++) {
    buffer[44 + i * 1] = msg.middlewareCustomVersion[i] ?? 0 & 0xff;
  }
  // Array: os_custom_version
  for (let i = 0; i < 8; i++) {
    buffer[52 + i * 1] = msg.osCustomVersion[i] ?? 0 & 0xff;
  }
  // Array: uid2
  for (let i = 0; i < 18; i++) {
    buffer[60 + i * 1] = msg.uid2[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeAutopilotVersion(payload: Uint8Array): AutopilotVersion {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    capabilities: view.getBigUint64(0, true),
    uid: view.getBigUint64(8, true),
    flightSwVersion: view.getUint32(16, true),
    middlewareSwVersion: view.getUint32(20, true),
    osSwVersion: view.getUint32(24, true),
    boardVersion: view.getUint32(28, true),
    vendorId: view.getUint16(32, true),
    productId: view.getUint16(34, true),
    flightCustomVersion: Array.from({ length: 8 }, (_, i) => payload[36 + i * 1]),
    middlewareCustomVersion: Array.from({ length: 8 }, (_, i) => payload[44 + i * 1]),
    osCustomVersion: Array.from({ length: 8 }, (_, i) => payload[52 + i * 1]),
    uid2: Array.from({ length: 18 }, (_, i) => payload[60 + i * 1]),
  };
}