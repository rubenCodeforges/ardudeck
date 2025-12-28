/**
 * Data stream status information.
 * Message ID: 67
 * CRC Extra: 21
 */
export interface DataStream {
  /** The ID of the requested data stream */
  streamId: number;
  /** The message rate (Hz) */
  messageRate: number;
  /** 1 stream is enabled, 0 stream is stopped. */
  onOff: number;
}

export const DATA_STREAM_ID = 67;
export const DATA_STREAM_CRC_EXTRA = 21;
export const DATA_STREAM_MIN_LENGTH = 4;
export const DATA_STREAM_MAX_LENGTH = 4;

export function serializeDataStream(msg: DataStream): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.messageRate, true);
  buffer[2] = msg.streamId & 0xff;
  buffer[3] = msg.onOff & 0xff;

  return buffer;
}

export function deserializeDataStream(payload: Uint8Array): DataStream {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    messageRate: view.getUint16(0, true),
    streamId: payload[2],
    onOff: payload[3],
  };
}