/**
 * Emit the value of a parameter. The inclusion of param_count and param_index in the message allows the recipient to keep track of received parameters and allows them to re-request missing parameters after a loss or timeout.
 * Message ID: 322
 * CRC Extra: 243
 */
export interface ParamExtValue {
  /** Parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter value */
  paramValue: string;
  /** Parameter type. */
  paramType: number;
  /** Total number of parameters */
  paramCount: number;
  /** Index of this parameter */
  paramIndex: number;
}

export const PARAM_EXT_VALUE_ID = 322;
export const PARAM_EXT_VALUE_CRC_EXTRA = 243;
export const PARAM_EXT_VALUE_MIN_LENGTH = 149;
export const PARAM_EXT_VALUE_MAX_LENGTH = 149;

export function serializeParamExtValue(msg: ParamExtValue): Uint8Array {
  const buffer = new Uint8Array(149);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.paramCount, true);
  view.setUint16(2, msg.paramIndex, true);
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 4);
  // String: param_value
  const paramValueBytes = new TextEncoder().encode(msg.paramValue || '');
  buffer.set(paramValueBytes.slice(0, 128), 20);
  buffer[148] = msg.paramType & 0xff;

  return buffer;
}

export function deserializeParamExtValue(payload: Uint8Array): ParamExtValue {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramCount: view.getUint16(0, true),
    paramIndex: view.getUint16(2, true),
    paramId: new TextDecoder().decode(payload.slice(4, 20)).replace(/\0.*$/, ''),
    paramValue: new TextDecoder().decode(payload.slice(20, 148)).replace(/\0.*$/, ''),
    paramType: payload[148],
  };
}