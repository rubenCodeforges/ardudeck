/**
 * Get the current mode.
        This should be emitted on any mode change, and broadcast at low rate (nominally 0.5 Hz).
        It may be requested using MAV_CMD_REQUEST_MESSAGE.
 * Message ID: 436
 * CRC Extra: 193
 */
export interface CurrentMode {
  /** Standard mode. */
  standardMode: number;
  /** A bitfield for use for autopilot-specific flags */
  customMode: number;
  /** The custom_mode of the mode that was last commanded by the user (for example, with MAV_CMD_DO_SET_STANDARD_MODE, MAV_CMD_DO_SET_MODE or via RC). This should usually be the same as custom_mode. It will be different if the vehicle is unable to enter the intended mode, or has left that mode due to a failsafe condition. 0 indicates the intended custom mode is unknown/not supplied */
  intendedCustomMode: number;
}

export const CURRENT_MODE_ID = 436;
export const CURRENT_MODE_CRC_EXTRA = 193;
export const CURRENT_MODE_MIN_LENGTH = 9;
export const CURRENT_MODE_MAX_LENGTH = 9;

export function serializeCurrentMode(msg: CurrentMode): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.customMode, true);
  view.setUint32(4, msg.intendedCustomMode, true);
  buffer[8] = msg.standardMode & 0xff;

  return buffer;
}

export function deserializeCurrentMode(payload: Uint8Array): CurrentMode {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    customMode: view.getUint32(0, true),
    intendedCustomMode: view.getUint32(4, true),
    standardMode: payload[8],
  };
}