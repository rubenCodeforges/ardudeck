/**
 * A forwarded CANFD frame as requested by MAV_CMD_CAN_FORWARD. These are separated from CAN_FRAME as they need different handling (eg. TAO handling)
 * Message ID: 387
 * CRC Extra: 4
 */
export interface CanfdFrame {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** bus number */
  bus: number;
  /** Frame length */
  len: number;
  /** Frame ID */
  id: number;
  /** Frame data */
  data: number[];
}

export const CANFD_FRAME_ID = 387;
export const CANFD_FRAME_CRC_EXTRA = 4;
export const CANFD_FRAME_MIN_LENGTH = 72;
export const CANFD_FRAME_MAX_LENGTH = 72;

export function serializeCanfdFrame(msg: CanfdFrame): Uint8Array {
  const buffer = new Uint8Array(72);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.id, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.bus & 0xff;
  buffer[7] = msg.len & 0xff;
  // Array: data
  for (let i = 0; i < 64; i++) {
    buffer[8 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeCanfdFrame(payload: Uint8Array): CanfdFrame {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    id: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    bus: payload[6],
    len: payload[7],
    data: Array.from({ length: 64 }, (_, i) => payload[8 + i * 1]),
  };
}