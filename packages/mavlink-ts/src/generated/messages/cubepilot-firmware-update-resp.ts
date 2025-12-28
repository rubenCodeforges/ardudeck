/**
 * offset response to encapsulated data.
 * Message ID: 50005
 * CRC Extra: 152
 */
export interface CubepilotFirmwareUpdateResp {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** FW Offset. (bytes) */
  offset: number;
}

export const CUBEPILOT_FIRMWARE_UPDATE_RESP_ID = 50005;
export const CUBEPILOT_FIRMWARE_UPDATE_RESP_CRC_EXTRA = 152;
export const CUBEPILOT_FIRMWARE_UPDATE_RESP_MIN_LENGTH = 6;
export const CUBEPILOT_FIRMWARE_UPDATE_RESP_MAX_LENGTH = 6;

export function serializeCubepilotFirmwareUpdateResp(msg: CubepilotFirmwareUpdateResp): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.offset, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeCubepilotFirmwareUpdateResp(payload: Uint8Array): CubepilotFirmwareUpdateResp {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    offset: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
  };
}