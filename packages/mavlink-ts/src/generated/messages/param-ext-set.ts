/**
 * Set a parameter value. In order to deal with message loss (and retransmission of PARAM_EXT_SET), when setting a parameter value and the new value is the same as the current value, you will immediately get a PARAM_ACK_ACCEPTED response. If the current state is PARAM_ACK_IN_PROGRESS, you will accordingly receive a PARAM_ACK_IN_PROGRESS in response.
 * Message ID: 323
 * CRC Extra: 78
 */
export interface ParamExtSet {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter value */
  paramValue: string;
  /** Parameter type. */
  paramType: number;
}

export const PARAM_EXT_SET_ID = 323;
export const PARAM_EXT_SET_CRC_EXTRA = 78;
export const PARAM_EXT_SET_MIN_LENGTH = 147;
export const PARAM_EXT_SET_MAX_LENGTH = 147;

export function serializeParamExtSet(msg: ParamExtSet): Uint8Array {
  const buffer = new Uint8Array(147);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 2);
  // String: param_value
  const paramValueBytes = new TextEncoder().encode(msg.paramValue || '');
  buffer.set(paramValueBytes.slice(0, 128), 18);
  buffer[146] = msg.paramType & 0xff;

  return buffer;
}

export function deserializeParamExtSet(payload: Uint8Array): ParamExtSet {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    paramId: new TextDecoder().decode(payload.slice(2, 18)).replace(/\0.*$/, ''),
    paramValue: new TextDecoder().decode(payload.slice(18, 146)).replace(/\0.*$/, ''),
    paramType: payload[146],
  };
}