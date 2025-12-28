/**
 * Cumulative distance traveled for each reported wheel.
 * Message ID: 9000
 * CRC Extra: 113
 */
export interface WheelDistance {
  /** Timestamp (synced to UNIX time or since system boot). (us) */
  timeUsec: bigint;
  /** Number of wheels reported. */
  count: number;
  /** Distance reported by individual wheel encoders. Forward rotations increase values, reverse rotations decrease them. Not all wheels will necessarily have wheel encoders; the mapping of encoders to wheel positions must be agreed/understood by the endpoints. (m) */
  distance: number[];
}

export const WHEEL_DISTANCE_ID = 9000;
export const WHEEL_DISTANCE_CRC_EXTRA = 113;
export const WHEEL_DISTANCE_MIN_LENGTH = 137;
export const WHEEL_DISTANCE_MAX_LENGTH = 137;

export function serializeWheelDistance(msg: WheelDistance): Uint8Array {
  const buffer = new Uint8Array(137);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: distance
  for (let i = 0; i < 16; i++) {
    view.setFloat64(8 + i * 8, msg.distance[i] ?? 0, true);
  }
  buffer[136] = msg.count & 0xff;

  return buffer;
}

export function deserializeWheelDistance(payload: Uint8Array): WheelDistance {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    distance: Array.from({ length: 16 }, (_, i) => view.getFloat64(8 + i * 8, true)),
    count: payload[136],
  };
}