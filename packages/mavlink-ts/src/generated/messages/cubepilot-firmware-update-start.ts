/**
 * Start firmware update with encapsulated data.
 * Message ID: 50004
 * CRC Extra: 240
 */
export interface CubepilotFirmwareUpdateStart {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** FW Size. (bytes) */
  size: number;
  /** FW CRC. */
  crc: number;
}

export const CUBEPILOT_FIRMWARE_UPDATE_START_ID = 50004;
export const CUBEPILOT_FIRMWARE_UPDATE_START_CRC_EXTRA = 240;
export const CUBEPILOT_FIRMWARE_UPDATE_START_MIN_LENGTH = 10;
export const CUBEPILOT_FIRMWARE_UPDATE_START_MAX_LENGTH = 10;

export function serializeCubepilotFirmwareUpdateStart(msg: CubepilotFirmwareUpdateStart): Uint8Array {
  const buffer = new Uint8Array(10);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.size, true);
  view.setUint32(4, msg.crc, true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeCubepilotFirmwareUpdateStart(payload: Uint8Array): CubepilotFirmwareUpdateStart {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    size: view.getUint32(0, true),
    crc: view.getUint32(4, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
  };
}