/**
 * Request to read the onboard parameter with the param_id string id. Onboard parameters are stored as key[const char*] -> value[float]. This allows to send a parameter to any other component (such as the GCS) without the need of previous knowledge of possible parameter names. Thus the same GCS can store different parameters for different autopilots. See also https://mavlink.io/en/services/parameter.html for a full documentation of QGroundControl and IMU code.
 * Message ID: 20
 * CRC Extra: 214
 */
export interface ParamRequestRead {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter index. Send -1 to use the param ID field as identifier (else the param id will be ignored) */
  paramIndex: number;
}

export const PARAM_REQUEST_READ_ID = 20;
export const PARAM_REQUEST_READ_CRC_EXTRA = 214;
export const PARAM_REQUEST_READ_MIN_LENGTH = 20;
export const PARAM_REQUEST_READ_MAX_LENGTH = 20;

export function serializeParamRequestRead(msg: ParamRequestRead): Uint8Array {
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

export function deserializeParamRequestRead(payload: Uint8Array): ParamRequestRead {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramIndex: view.getInt16(0, true),
    targetSystem: payload[2],
    targetComponent: payload[3],
    paramId: new TextDecoder().decode(payload.slice(4, 20)).replace(/\0.*$/, ''),
  };
}