/**
 * Response from a PARAM_EXT_SET message.
 * Message ID: 324
 * CRC Extra: 132
 */
export interface ParamExtAck {
  /** Parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter value (new value if PARAM_ACK_ACCEPTED, current value otherwise) */
  paramValue: string;
  /** Parameter type. */
  paramType: number;
  /** Result code. */
  paramResult: number;
}

export const PARAM_EXT_ACK_ID = 324;
export const PARAM_EXT_ACK_CRC_EXTRA = 132;
export const PARAM_EXT_ACK_MIN_LENGTH = 146;
export const PARAM_EXT_ACK_MAX_LENGTH = 146;

export function serializeParamExtAck(msg: ParamExtAck): Uint8Array {
  const buffer = new Uint8Array(146);
  const view = new DataView(buffer.buffer);

  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 0);
  // String: param_value
  const paramValueBytes = new TextEncoder().encode(msg.paramValue || '');
  buffer.set(paramValueBytes.slice(0, 128), 16);
  buffer[144] = msg.paramType & 0xff;
  buffer[145] = msg.paramResult & 0xff;

  return buffer;
}

export function deserializeParamExtAck(payload: Uint8Array): ParamExtAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramId: new TextDecoder().decode(payload.slice(0, 16)).replace(/\0.*$/, ''),
    paramValue: new TextDecoder().decode(payload.slice(16, 144)).replace(/\0.*$/, ''),
    paramType: payload[144],
    paramResult: payload[145],
  };
}