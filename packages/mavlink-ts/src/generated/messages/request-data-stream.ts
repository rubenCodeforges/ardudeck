/**
 * Request a data stream.
 * Message ID: 66
 * CRC Extra: 148
 */
export interface RequestDataStream {
  /** The target requested to send the message stream. */
  targetSystem: number;
  /** The target requested to send the message stream. */
  targetComponent: number;
  /** The ID of the requested data stream */
  reqStreamId: number;
  /** The requested message rate (Hz) */
  reqMessageRate: number;
  /** 1 to start sending, 0 to stop sending. */
  startStop: number;
}

export const REQUEST_DATA_STREAM_ID = 66;
export const REQUEST_DATA_STREAM_CRC_EXTRA = 148;
export const REQUEST_DATA_STREAM_MIN_LENGTH = 6;
export const REQUEST_DATA_STREAM_MAX_LENGTH = 6;

export function serializeRequestDataStream(msg: RequestDataStream): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.reqMessageRate, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  buffer[4] = msg.reqStreamId & 0xff;
  buffer[5] = msg.startStop & 0xff;

  return buffer;
}

export function deserializeRequestDataStream(payload: Uint8Array): RequestDataStream {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    reqMessageRate: view.getUint16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    reqStreamId: payload[4],
    startStop: payload[5],
  };
}