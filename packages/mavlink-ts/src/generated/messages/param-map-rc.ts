/**
 * Bind a RC channel to a parameter. The parameter should change according to the RC channel value.
 * Message ID: 50
 * CRC Extra: 78
 */
export interface ParamMapRc {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Parameter index. Send -1 to use the param ID field as identifier (else the param id will be ignored), send -2 to disable any existing map for this rc_channel_index. */
  paramIndex: number;
  /** Index of parameter RC channel. Not equal to the RC channel id. Typically corresponds to a potentiometer-knob on the RC. */
  parameterRcChannelIndex: number;
  /** Initial parameter value */
  paramValue0: number;
  /** Scale, maps the RC range [-1, 1] to a parameter value */
  scale: number;
  /** Minimum param value. The protocol does not define if this overwrites an onboard minimum value. (Depends on implementation) */
  paramValueMin: number;
  /** Maximum param value. The protocol does not define if this overwrites an onboard maximum value. (Depends on implementation) */
  paramValueMax: number;
}

export const PARAM_MAP_RC_ID = 50;
export const PARAM_MAP_RC_CRC_EXTRA = 78;
export const PARAM_MAP_RC_MIN_LENGTH = 37;
export const PARAM_MAP_RC_MAX_LENGTH = 37;

export function serializeParamMapRc(msg: ParamMapRc): Uint8Array {
  const buffer = new Uint8Array(37);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.paramValue0, true);
  view.setFloat32(4, msg.scale, true);
  view.setFloat32(8, msg.paramValueMin, true);
  view.setFloat32(12, msg.paramValueMax, true);
  view.setInt16(16, msg.paramIndex, true);
  buffer[18] = msg.targetSystem & 0xff;
  buffer[19] = msg.targetComponent & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 20);
  buffer[36] = msg.parameterRcChannelIndex & 0xff;

  return buffer;
}

export function deserializeParamMapRc(payload: Uint8Array): ParamMapRc {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    paramValue0: view.getFloat32(0, true),
    scale: view.getFloat32(4, true),
    paramValueMin: view.getFloat32(8, true),
    paramValueMax: view.getFloat32(12, true),
    paramIndex: view.getInt16(16, true),
    targetSystem: payload[18],
    targetComponent: payload[19],
    paramId: new TextDecoder().decode(payload.slice(20, 36)).replace(/\0.*$/, ''),
    parameterRcChannelIndex: payload[36],
  };
}