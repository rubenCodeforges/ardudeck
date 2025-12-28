/**
 * Time synchronization message.
 * Message ID: 111
 * CRC Extra: 34
 */
export interface Timesync {
  /** Time sync timestamp 1 */
  tc1: bigint;
  /** Time sync timestamp 2 */
  ts1: bigint;
}

export const TIMESYNC_ID = 111;
export const TIMESYNC_CRC_EXTRA = 34;
export const TIMESYNC_MIN_LENGTH = 16;
export const TIMESYNC_MAX_LENGTH = 16;

export function serializeTimesync(msg: Timesync): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setBigInt64(0, BigInt(msg.tc1), true);
  view.setBigInt64(8, BigInt(msg.ts1), true);

  return buffer;
}

export function deserializeTimesync(payload: Uint8Array): Timesync {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    tc1: view.getBigInt64(0, true),
    ts1: view.getBigInt64(8, true),
  };
}