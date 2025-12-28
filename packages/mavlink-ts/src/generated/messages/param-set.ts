/**
 * Set a parameter value (write new value to permanent storage).
        The receiving component should acknowledge the new parameter value by broadcasting a PARAM_VALUE message (broadcasting ensures that multiple GCS all have an up-to-date list of all parameters). If the sending GCS did not receive a PARAM_VALUE within its timeout time, it should re-send the PARAM_SET message. The parameter microservice is documented at https://mavlink.io/en/services/parameter.html.
 * Message ID: 23
 * CRC Extra: 168
 */
export interface ParamSet {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Onboard parameter value */
  paramValue: number;
  /** Onboard parameter type. */
  paramType: number;
}

export const PARAM_SET_ID = 23;
export const PARAM_SET_CRC_EXTRA = 168;
export const PARAM_SET_MIN_LENGTH = 23;
export const PARAM_SET_MAX_LENGTH = 23;

export function serializeParamSet(msg: ParamSet): Uint8Array {
  const buffer = new Uint8Array(23);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.paramValue, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 6);
  buffer[22] = msg.paramType & 0xff;

  return buffer;
}

export function deserializeParamSet(payload: Uint8Array): ParamSet {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramValue: view.getFloat32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    paramId: new TextDecoder().decode(payload.slice(6, 22)).replace(/\0.*$/, ''),
    paramType: payload[22],
  };
}