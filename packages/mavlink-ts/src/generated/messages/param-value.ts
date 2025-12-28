/**
 * Emit the value of a onboard parameter. The inclusion of param_count and param_index in the message allows the recipient to keep track of received parameters and allows him to re-request missing parameters after a loss or timeout. The parameter microservice is documented at https://mavlink.io/en/services/parameter.html
 * Message ID: 22
 * CRC Extra: 220
 */
export interface ParamValue {
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Onboard parameter value */
  paramValue: number;
  /** Onboard parameter type. */
  paramType: number;
  /** Total number of onboard parameters */
  paramCount: number;
  /** Index of this onboard parameter */
  paramIndex: number;
}

export const PARAM_VALUE_ID = 22;
export const PARAM_VALUE_CRC_EXTRA = 220;
export const PARAM_VALUE_MIN_LENGTH = 25;
export const PARAM_VALUE_MAX_LENGTH = 25;

export function serializeParamValue(msg: ParamValue): Uint8Array {
  const buffer = new Uint8Array(25);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.paramValue, true);
  view.setUint16(4, msg.paramCount, true);
  view.setUint16(6, msg.paramIndex, true);
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 8);
  buffer[24] = msg.paramType & 0xff;

  return buffer;
}

export function deserializeParamValue(payload: Uint8Array): ParamValue {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramValue: view.getFloat32(0, true),
    paramCount: view.getUint16(4, true),
    paramIndex: view.getUint16(6, true),
    paramId: new TextDecoder().decode(payload.slice(8, 24)).replace(/\0.*$/, ''),
    paramType: payload[24],
  };
}