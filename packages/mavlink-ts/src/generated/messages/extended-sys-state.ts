/**
 * Provides state for additional features
 * Message ID: 245
 * CRC Extra: 130
 */
export interface ExtendedSysState {
  /** The VTOL state if applicable. Is set to MAV_VTOL_STATE_UNDEFINED if UAV is not in VTOL configuration. */
  vtolState: number;
  /** The landed state. Is set to MAV_LANDED_STATE_UNDEFINED if landed state is unknown. */
  landedState: number;
}

export const EXTENDED_SYS_STATE_ID = 245;
export const EXTENDED_SYS_STATE_CRC_EXTRA = 130;
export const EXTENDED_SYS_STATE_MIN_LENGTH = 2;
export const EXTENDED_SYS_STATE_MAX_LENGTH = 2;

export function serializeExtendedSysState(msg: ExtendedSysState): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.vtolState & 0xff;
  buffer[1] = msg.landedState & 0xff;

  return buffer;
}

export function deserializeExtendedSysState(payload: Uint8Array): ExtendedSysState {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    vtolState: payload[0],
    landedState: payload[1],
  };
}