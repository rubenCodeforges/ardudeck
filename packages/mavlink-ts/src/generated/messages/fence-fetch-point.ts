/**
 * Request a current fence point from MAV.
 * Message ID: 161
 * CRC Extra: 68
 */
export interface FenceFetchPoint {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Point index (first point is 1, 0 is for return point). */
  idx: number;
}

export const FENCE_FETCH_POINT_ID = 161;
export const FENCE_FETCH_POINT_CRC_EXTRA = 68;
export const FENCE_FETCH_POINT_MIN_LENGTH = 3;
export const FENCE_FETCH_POINT_MAX_LENGTH = 3;

export function serializeFenceFetchPoint(msg: FenceFetchPoint): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.idx & 0xff;

  return buffer;
}

export function deserializeFenceFetchPoint(payload: Uint8Array): FenceFetchPoint {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    idx: payload[2],
  };
}