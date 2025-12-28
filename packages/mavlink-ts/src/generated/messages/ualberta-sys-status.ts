/**
 * System status specific to ualberta uav
 * Message ID: 222
 * CRC Extra: 15
 */
export interface UalbertaSysStatus {
  /** System mode, see UALBERTA_AUTOPILOT_MODE ENUM */
  mode: number;
  /** Navigation mode, see UALBERTA_NAV_MODE ENUM */
  navMode: number;
  /** Pilot mode, see UALBERTA_PILOT_MODE */
  pilot: number;
}

export const UALBERTA_SYS_STATUS_ID = 222;
export const UALBERTA_SYS_STATUS_CRC_EXTRA = 15;
export const UALBERTA_SYS_STATUS_MIN_LENGTH = 3;
export const UALBERTA_SYS_STATUS_MAX_LENGTH = 3;

export function serializeUalbertaSysStatus(msg: UalbertaSysStatus): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.mode & 0xff;
  buffer[1] = msg.navMode & 0xff;
  buffer[2] = msg.pilot & 0xff;

  return buffer;
}

export function deserializeUalbertaSysStatus(payload: Uint8Array): UalbertaSysStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mode: payload[0],
    navMode: payload[1],
    pilot: payload[2],
  };
}