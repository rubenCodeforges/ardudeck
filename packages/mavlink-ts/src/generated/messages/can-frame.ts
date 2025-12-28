/**
 * A forwarded CAN frame as requested by MAV_CMD_CAN_FORWARD.
 * Message ID: 386
 * CRC Extra: 132
 */
export interface CanFrame {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Bus number */
  bus: number;
  /** Frame length */
  len: number;
  /** Frame ID */
  id: number;
  /** Frame data */
  data: number[];
}

export const CAN_FRAME_ID = 386;
export const CAN_FRAME_CRC_EXTRA = 132;
export const CAN_FRAME_MIN_LENGTH = 16;
export const CAN_FRAME_MAX_LENGTH = 16;

export function serializeCanFrame(msg: CanFrame): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.id, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.bus & 0xff;
  buffer[7] = msg.len & 0xff;
  // Array: data
  for (let i = 0; i < 8; i++) {
    buffer[8 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeCanFrame(payload: Uint8Array): CanFrame {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    id: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    bus: payload[6],
    len: payload[7],
    data: Array.from({ length: 8 }, (_, i) => payload[8 + i * 1]),
  };
}