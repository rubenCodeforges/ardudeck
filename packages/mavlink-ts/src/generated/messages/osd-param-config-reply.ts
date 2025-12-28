/**
 * Configure OSD parameter reply.
 * Message ID: 11034
 * CRC Extra: 79
 */
export interface OsdParamConfigReply {
  /** Request ID - copied from request. */
  requestId: number;
  /** Config error type. */
  result: number;
}

export const OSD_PARAM_CONFIG_REPLY_ID = 11034;
export const OSD_PARAM_CONFIG_REPLY_CRC_EXTRA = 79;
export const OSD_PARAM_CONFIG_REPLY_MIN_LENGTH = 5;
export const OSD_PARAM_CONFIG_REPLY_MAX_LENGTH = 5;

export function serializeOsdParamConfigReply(msg: OsdParamConfigReply): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  buffer[4] = msg.result & 0xff;

  return buffer;
}

export function deserializeOsdParamConfigReply(payload: Uint8Array): OsdParamConfigReply {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    result: payload[4],
  };
}