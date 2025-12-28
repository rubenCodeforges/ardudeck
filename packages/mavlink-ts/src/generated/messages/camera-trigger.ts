/**
 * Camera-IMU triggering and synchronisation message.
 * Message ID: 112
 * CRC Extra: 174
 */
export interface CameraTrigger {
  /** Timestamp for image frame (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Image frame sequence */
  seq: number;
}

export const CAMERA_TRIGGER_ID = 112;
export const CAMERA_TRIGGER_CRC_EXTRA = 174;
export const CAMERA_TRIGGER_MIN_LENGTH = 12;
export const CAMERA_TRIGGER_MAX_LENGTH = 12;

export function serializeCameraTrigger(msg: CameraTrigger): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setUint32(8, msg.seq, true);

  return buffer;
}

export function deserializeCameraTrigger(payload: Uint8Array): CameraTrigger {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    seq: view.getUint32(8, true),
  };
}