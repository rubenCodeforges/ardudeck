/**
 * A fence point. Used to set a point when from GCS -> MAV. Also used to return a point from MAV -> GCS.
 * Message ID: 160
 * CRC Extra: 78
 */
export interface FencePoint {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Point index (first point is 1, 0 is for return point). */
  idx: number;
  /** Total number of points (for sanity checking). */
  count: number;
  /** Latitude of point. (deg) */
  lat: number;
  /** Longitude of point. (deg) */
  lng: number;
}

export const FENCE_POINT_ID = 160;
export const FENCE_POINT_CRC_EXTRA = 78;
export const FENCE_POINT_MIN_LENGTH = 12;
export const FENCE_POINT_MAX_LENGTH = 12;

export function serializeFencePoint(msg: FencePoint): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.lat, true);
  view.setFloat32(4, msg.lng, true);
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;
  buffer[10] = msg.idx & 0xff;
  buffer[11] = msg.count & 0xff;

  return buffer;
}

export function deserializeFencePoint(payload: Uint8Array): FencePoint {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    lat: view.getFloat32(0, true),
    lng: view.getFloat32(4, true),
    targetSystem: payload[8],
    targetComponent: payload[9],
    idx: payload[10],
    count: payload[11],
  };
}