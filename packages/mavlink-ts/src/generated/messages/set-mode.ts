/**
 * Set the system mode, as defined by enum MAV_MODE. There is no target component id as the mode is by definition for the overall aircraft, not only for one component.
 * Message ID: 11
 * CRC Extra: 89
 */
export interface SetMode {
  /** The system setting the mode */
  targetSystem: number;
  /** The new base mode. */
  baseMode: number;
  /** The new autopilot-specific mode. This field can be ignored by an autopilot. */
  customMode: number;
}

export const SET_MODE_ID = 11;
export const SET_MODE_CRC_EXTRA = 89;
export const SET_MODE_MIN_LENGTH = 6;
export const SET_MODE_MAX_LENGTH = 6;

export function serializeSetMode(msg: SetMode): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.customMode, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.baseMode & 0xff;

  return buffer;
}

export function deserializeSetMode(payload: Uint8Array): SetMode {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    customMode: view.getUint32(0, true),
    targetSystem: payload[4],
    baseMode: payload[5],
  };
}