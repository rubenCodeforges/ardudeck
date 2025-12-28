/**
 * Read a configured an OSD parameter slot.
 * Message ID: 11035
 * CRC Extra: 128
 */
export interface OsdParamShowConfig {
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
}

export const OSD_PARAM_SHOW_CONFIG_ID = 11035;
export const OSD_PARAM_SHOW_CONFIG_CRC_EXTRA = 128;
export const OSD_PARAM_SHOW_CONFIG_MIN_LENGTH = 8;
export const OSD_PARAM_SHOW_CONFIG_MAX_LENGTH = 8;

export function serializeOsdParamShowConfig(msg: OsdParamShowConfig): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.requestId, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.osdScreen & 0xff;
  buffer[7] = msg.osdIndex & 0xff;

  return buffer;
}

export function deserializeOsdParamShowConfig(payload: Uint8Array): OsdParamShowConfig {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    requestId: view.getUint32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    osdScreen: payload[6],
    osdIndex: payload[7],
  };
}