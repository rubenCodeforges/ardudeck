/**
 * Request all parameters of this component. All parameters should be emitted in response as PARAM_EXT_VALUE.
 * Message ID: 321
 * CRC Extra: 88
 */
export interface ParamExtRequestList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const PARAM_EXT_REQUEST_LIST_ID = 321;
export const PARAM_EXT_REQUEST_LIST_CRC_EXTRA = 88;
export const PARAM_EXT_REQUEST_LIST_MIN_LENGTH = 2;
export const PARAM_EXT_REQUEST_LIST_MAX_LENGTH = 2;

export function serializeParamExtRequestList(msg: ParamExtRequestList): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeParamExtRequestList(payload: Uint8Array): ParamExtRequestList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}