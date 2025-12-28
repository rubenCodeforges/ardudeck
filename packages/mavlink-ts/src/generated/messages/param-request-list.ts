/**
 * Request all parameters of this component. After this request, all parameters are emitted. The parameter microservice is documented at https://mavlink.io/en/services/parameter.html
 * Message ID: 21
 * CRC Extra: 159
 */
export interface ParamRequestList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
}

export const PARAM_REQUEST_LIST_ID = 21;
export const PARAM_REQUEST_LIST_CRC_EXTRA = 159;
export const PARAM_REQUEST_LIST_MIN_LENGTH = 2;
export const PARAM_REQUEST_LIST_MAX_LENGTH = 2;

export function serializeParamRequestList(msg: ParamRequestList): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeParamRequestList(payload: Uint8Array): ParamRequestList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
  };
}