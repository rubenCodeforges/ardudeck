/**
 * Heartbeat from a HeroBus attached GoPro.
 * Message ID: 215
 * CRC Extra: 101
 */
export interface GoproHeartbeat {
  /** Status. */
  status: number;
  /** Current capture mode. */
  captureMode: number;
  /** Additional status bits. */
  flags: number;
}

export const GOPRO_HEARTBEAT_ID = 215;
export const GOPRO_HEARTBEAT_CRC_EXTRA = 101;
export const GOPRO_HEARTBEAT_MIN_LENGTH = 3;
export const GOPRO_HEARTBEAT_MAX_LENGTH = 3;

export function serializeGoproHeartbeat(msg: GoproHeartbeat): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.status & 0xff;
  buffer[1] = msg.captureMode & 0xff;
  buffer[2] = msg.flags & 0xff;

  return buffer;
}

export function deserializeGoproHeartbeat(payload: Uint8Array): GoproHeartbeat {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    status: payload[0],
    captureMode: payload[1],
    flags: payload[2],
  };
}