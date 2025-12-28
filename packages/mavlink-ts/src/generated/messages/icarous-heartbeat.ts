/**
 * ICAROUS heartbeat
 * Message ID: 42000
 * CRC Extra: 227
 */
export interface IcarousHeartbeat {
  /** See the FMS_STATE enum. */
  status: number;
}

export const ICAROUS_HEARTBEAT_ID = 42000;
export const ICAROUS_HEARTBEAT_CRC_EXTRA = 227;
export const ICAROUS_HEARTBEAT_MIN_LENGTH = 1;
export const ICAROUS_HEARTBEAT_MAX_LENGTH = 1;

export function serializeIcarousHeartbeat(msg: IcarousHeartbeat): Uint8Array {
  const buffer = new Uint8Array(1);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.status & 0xff;

  return buffer;
}

export function deserializeIcarousHeartbeat(payload: Uint8Array): IcarousHeartbeat {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    status: payload[0],
  };
}