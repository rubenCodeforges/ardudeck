/**
 * Drone operation mode.
 * Message ID: 60053
 * CRC Extra: 45
 */
export interface AvssDroneOperationMode {
  /** Timestamp (time since FC boot). (ms) */
  timeBootMs: number;
  /** DJI M300 operation mode */
  m300OperationMode: number;
  /** horsefly operation mode */
  horseflyOperationMode: number;
}

export const AVSS_DRONE_OPERATION_MODE_ID = 60053;
export const AVSS_DRONE_OPERATION_MODE_CRC_EXTRA = 45;
export const AVSS_DRONE_OPERATION_MODE_MIN_LENGTH = 6;
export const AVSS_DRONE_OPERATION_MODE_MAX_LENGTH = 6;

export function serializeAvssDroneOperationMode(msg: AvssDroneOperationMode): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  buffer[4] = msg.m300OperationMode & 0xff;
  buffer[5] = msg.horseflyOperationMode & 0xff;

  return buffer;
}

export function deserializeAvssDroneOperationMode(payload: Uint8Array): AvssDroneOperationMode {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    m300OperationMode: payload[4],
    horseflyOperationMode: payload[5],
  };
}