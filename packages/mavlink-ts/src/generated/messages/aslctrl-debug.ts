/**
 * ASL-fixed-wing controller debug data
 * Message ID: 8005
 * CRC Extra: 251
 */
export interface AslctrlDebug {
  /** Debug data */
  i32_1: number;
  /** Debug data */
  i8_1: number;
  /** Debug data */
  i8_2: number;
  /** Debug data */
  f_1: number;
  /** Debug data */
  f_2: number;
  /** Debug data */
  f_3: number;
  /** Debug data */
  f_4: number;
  /** Debug data */
  f_5: number;
  /** Debug data */
  f_6: number;
  /** Debug data */
  f_7: number;
  /** Debug data */
  f_8: number;
}

export const ASLCTRL_DEBUG_ID = 8005;
export const ASLCTRL_DEBUG_CRC_EXTRA = 251;
export const ASLCTRL_DEBUG_MIN_LENGTH = 38;
export const ASLCTRL_DEBUG_MAX_LENGTH = 38;

export function serializeAslctrlDebug(msg: AslctrlDebug): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.i32_1, true);
  view.setFloat32(4, msg.f_1, true);
  view.setFloat32(8, msg.f_2, true);
  view.setFloat32(12, msg.f_3, true);
  view.setFloat32(16, msg.f_4, true);
  view.setFloat32(20, msg.f_5, true);
  view.setFloat32(24, msg.f_6, true);
  view.setFloat32(28, msg.f_7, true);
  view.setFloat32(32, msg.f_8, true);
  buffer[36] = msg.i8_1 & 0xff;
  buffer[37] = msg.i8_2 & 0xff;

  return buffer;
}

export function deserializeAslctrlDebug(payload: Uint8Array): AslctrlDebug {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    i32_1: view.getUint32(0, true),
    f_1: view.getFloat32(4, true),
    f_2: view.getFloat32(8, true),
    f_3: view.getFloat32(12, true),
    f_4: view.getFloat32(16, true),
    f_5: view.getFloat32(20, true),
    f_6: view.getFloat32(24, true),
    f_7: view.getFloat32(28, true),
    f_8: view.getFloat32(32, true),
    i8_1: payload[36],
    i8_2: payload[37],
  };
}