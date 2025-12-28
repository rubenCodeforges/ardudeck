/**
 * Request to read the value of a parameter with either the param_id string id or param_index. PARAM_EXT_VALUE should be emitted in response.
 * Message ID: 320
 * CRC Extra: 243
 */
export interface ParamExtRequestRead {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter index. Set to -1 to use the Parameter ID field as identifier (else param_id will be ignored) */
  paramIndex: number;
}

export const PARAM_EXT_REQUEST_READ_ID = 320;
export const PARAM_EXT_REQUEST_READ_CRC_EXTRA = 243;
export const PARAM_EXT_REQUEST_READ_MIN_LENGTH = 20;
export const PARAM_EXT_REQUEST_READ_MAX_LENGTH = 20;

export function serializeParamExtRequestRead(msg: ParamExtRequestRead): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.paramIndex, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 4);

  return buffer;
}

export function deserializeParamExtRequestRead(payload: Uint8Array): ParamExtRequestRead {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramIndex: view.getInt16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    paramId: new TextDecoder().decode(payload.slice(4, 20)).replace(/\0.*$/, ''),
  };
}