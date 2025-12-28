/**
 * Read configured OSD parameter reply.
 * Message ID: 11036
 * CRC Extra: 177
 */
export interface OsdParamShowConfigReply {
  /** Request ID - copied from request. */
  requestId: number;
  /** Config error type. */
  result: number;
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Config type. */
  configType: number;
  /** OSD parameter minimum value. */
  minValue: number;
  /** OSD parameter maximum value. */
  maxValue: number;
  /** OSD parameter increment. */
  increment: number;
}

export const OSD_PARAM_SHOW_CONFIG_REPLY_ID = 11036;
export const OSD_PARAM_SHOW_CONFIG_REPLY_CRC_EXTRA = 177;
export const OSD_PARAM_SHOW_CONFIG_REPLY_MIN_LENGTH = 34;
export const OSD_PARAM_SHOW_CONFIG_REPLY_MAX_LENGTH = 34;

export function serializeOsdParamShowConfigReply(msg: OsdParamShowConfigReply): Uint8Array {
  const buffer = new Uint8Array(34);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  view.setFloat32(4, msg.minValue, true);
  view.setFloat32(8, msg.maxValue, true);
  view.setFloat32(12, msg.increment, true);
  buffer[16] = msg.result & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 17);
  buffer[33] = msg.configType & 0xff;

  return buffer;
}

export function deserializeOsdParamShowConfigReply(payload: Uint8Array): OsdParamShowConfigReply {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    minValue: view.getFloat32(4, true),
    maxValue: view.getFloat32(8, true),
    increment: view.getFloat32(12, true),
    result: payload[16],
    paramId: new TextDecoder().decode(payload.slice(17, 33)).replace(/\0.*$/, ''),
    configType: payload[33],
  };
}