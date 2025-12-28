/**
 * Write registers reply.
 * Message ID: 11003
 * CRC Extra: 64
 */
export interface DeviceOpWriteReply {
  /** Request ID - copied from request. */
  requestId: number;
  /** 0 for success, anything else is failure code. */
  result: number;
}

export const DEVICE_OP_WRITE_REPLY_ID = 11003;
export const DEVICE_OP_WRITE_REPLY_CRC_EXTRA = 64;
export const DEVICE_OP_WRITE_REPLY_MIN_LENGTH = 5;
export const DEVICE_OP_WRITE_REPLY_MAX_LENGTH = 5;

export function serializeDeviceOpWriteReply(msg: DeviceOpWriteReply): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  buffer[4] = msg.result & 0xff;

  return buffer;
}

export function deserializeDeviceOpWriteReply(payload: Uint8Array): DeviceOpWriteReply {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    result: payload[4],
  };
}