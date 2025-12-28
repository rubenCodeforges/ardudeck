/**
 * Parameter set/get error. Returned from a MAVLink node in response to an error in the parameter protocol, for example failing to set a parameter because it does not exist.
 * Message ID: 345
 * CRC Extra: 209
 */
export interface ParamError {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Parameter id. Terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter index. Will be -1 if the param ID field should be used as an identifier (else the param id will be ignored) */
  paramIndex: number;
  /** Error being returned to client. */
  error: number;
}

export const PARAM_ERROR_ID = 345;
export const PARAM_ERROR_CRC_EXTRA = 209;
export const PARAM_ERROR_MIN_LENGTH = 21;
export const PARAM_ERROR_MAX_LENGTH = 21;

export function serializeParamError(msg: ParamError): Uint8Array {
  const buffer = new Uint8Array(21);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.paramIndex, true);
  buffer[2] = msg.targetSystem & 0xff;
  buffer[3] = msg.targetComponent & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 4);
  buffer[20] = msg.error & 0xff;

  return buffer;
}

export function deserializeParamError(payload: Uint8Array): ParamError {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramIndex: view.getInt16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    paramId: new TextDecoder().decode(payload.slice(4, 20)).replace(/\0.*$/, ''),
    error: payload[20],
  };
}