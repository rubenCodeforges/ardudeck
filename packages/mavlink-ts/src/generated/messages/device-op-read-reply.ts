/**
 * Read registers reply.
 * Message ID: 11001
 * CRC Extra: 206
 */
export interface DeviceOpReadReply {
  /** Request ID - copied from request. */
  requestId: number;
  /** 0 for success, anything else is failure code. */
  result: number;
  /** Starting register. */
  regstart: number;
  /** Count of bytes read. */
  count: number;
  /** Reply data. */
  data: number[];
  /** Bank number. */
  bank: number;
}

export const DEVICE_OP_READ_REPLY_ID = 11001;
export const DEVICE_OP_READ_REPLY_CRC_EXTRA = 206;
export const DEVICE_OP_READ_REPLY_MIN_LENGTH = 136;
export const DEVICE_OP_READ_REPLY_MAX_LENGTH = 136;

export function serializeDeviceOpReadReply(msg: DeviceOpReadReply): Uint8Array {
  const buffer = new Uint8Array(136);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  buffer[4] = msg.result & 0xff;
  buffer[5] = msg.regstart & 0xff;
  buffer[6] = msg.count & 0xff;
  // Array: data
  for (let i = 0; i < 128; i++) {
    buffer[7 + i * 1] = msg.data[i] ?? 0 & 0xff;
  }
  buffer[135] = msg.bank & 0xff;

  return buffer;
}

export function deserializeDeviceOpReadReply(payload: Uint8Array): DeviceOpReadReply {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    result: payload[4],
    regstart: payload[5],
    count: payload[6],
    data: Array.from({ length: 128 }, (_, i) => payload[7 + i * 1]),
    bank: payload[135],
  };
}