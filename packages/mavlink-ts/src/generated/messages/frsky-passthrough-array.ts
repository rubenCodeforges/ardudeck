/**
 * Frsky SPort passthrough multi packet container.
 * Message ID: 60040
 * CRC Extra: 156
 */
export interface FrskyPassthroughArray {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Number of passthrough packets in this message. */
  count: number;
  /** Passthrough packet buffer. A packet has 6 bytes: uint16_t id + uint32_t data. The array has space for 40 packets. */
  packetBuf: number[];
}

export const FRSKY_PASSTHROUGH_ARRAY_ID = 60040;
export const FRSKY_PASSTHROUGH_ARRAY_CRC_EXTRA = 156;
export const FRSKY_PASSTHROUGH_ARRAY_MIN_LENGTH = 245;
export const FRSKY_PASSTHROUGH_ARRAY_MAX_LENGTH = 245;

export function serializeFrskyPassthroughArray(msg: FrskyPassthroughArray): Uint8Array {
  const buffer = new Uint8Array(245);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  buffer[4] = msg.count & 0xff;
  // Array: packet_buf
  for (let i = 0; i < 240; i++) {
    buffer[5 + i * 1] = msg.packetBuf[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeFrskyPassthroughArray(payload: Uint8Array): FrskyPassthroughArray {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    count: payload[4],
    packetBuf: Array.from({ length: 240 }, (_, i) => payload[5 + i * 1]),
  };
}