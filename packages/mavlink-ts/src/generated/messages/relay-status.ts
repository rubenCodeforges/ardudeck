/**
 * Reports the on/off state of relays, as controlled by MAV_CMD_DO_SET_RELAY.
 * Message ID: 376
 * CRC Extra: 199
 */
export interface RelayStatus {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Relay states.  Relay instance numbers are represented as individual bits in this mask by offset. */
  on: number;
  /** Relay present.  Relay instance numbers are represented as individual bits in this mask by offset.  Bits will be true if a relay instance is configured. */
  present: number;
}

export const RELAY_STATUS_ID = 376;
export const RELAY_STATUS_CRC_EXTRA = 199;
export const RELAY_STATUS_MIN_LENGTH = 8;
export const RELAY_STATUS_MAX_LENGTH = 8;

export function serializeRelayStatus(msg: RelayStatus): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint16(4, msg.on, true);
  view.setUint16(6, msg.present, true);

  return buffer;
}

export function deserializeRelayStatus(payload: Uint8Array): RelayStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    on: view.getUint16(4, true),
    present: view.getUint16(6, true),
  };
}