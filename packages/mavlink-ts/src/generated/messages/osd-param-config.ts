/**
 * Configure an OSD parameter slot.
 * Message ID: 11033
 * CRC Extra: 195
 */
export interface OsdParamConfig {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Request ID - copied to reply. */
  requestId: number;
  /** OSD parameter screen index. */
  osdScreen: number;
  /** OSD parameter display index. */
  osdIndex: number;
  /** Onboard parameter id, terminated by NULL if the length is less than 16 human-readable chars and WITHOUT null termination (NULL) byte if the length is exactly 16 chars - applications have to provide 16+1 bytes storage if the ID is stored as string */
  paramId: string;
  /** Config type. */
  configType: number;
  /** OSD parameter minimum value. */
  minValue: number;
  /** OSD parameter maximum value. */
  maxValue: number;
  /** OSD parameter increment. */
  increment: number;
}

export const OSD_PARAM_CONFIG_ID = 11033;
export const OSD_PARAM_CONFIG_CRC_EXTRA = 195;
export const OSD_PARAM_CONFIG_MIN_LENGTH = 37;
export const OSD_PARAM_CONFIG_MAX_LENGTH = 37;

export function serializeOsdParamConfig(msg: OsdParamConfig): Uint8Array {
  const buffer = new Uint8Array(37);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  view.setFloat32(4, msg.minValue, true);
  view.setFloat32(8, msg.maxValue, true);
  view.setFloat32(12, msg.increment, true);
  buffer[16] = msg.targetSystem & 0xff;
  buffer[17] = msg.targetComponent & 0xff;
  buffer[18] = msg.osdScreen & 0xff;
  buffer[19] = msg.osdIndex & 0xff;
  // String: param_id
  const paramIdBytes = new TextEncoder().encode(msg.paramId || '');
  buffer.set(paramIdBytes.slice(0, 16), 20);
  buffer[36] = msg.configType & 0xff;

  return buffer;
}

export function deserializeOsdParamConfig(payload: Uint8Array): OsdParamConfig {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    minValue: view.getFloat32(4, true),
    maxValue: view.getFloat32(8, true),
    increment: view.getFloat32(12, true),
    targetSystem: payload[16],
    targetComponent: payload[17],
    osdScreen: payload[18],
    osdIndex: payload[19],
    paramId: new TextDecoder().decode(payload.slice(20, 36)).replace(/\0.*$/, ''),
    configType: payload[36],
  };
}