/**
 * Information about a potential collision
 * Message ID: 247
 * CRC Extra: 81
 */
export interface Collision {
  /** Collision data source */
  src: number;
  /** Unique identifier, domain based on src field */
  id: number;
  /** Action that is being taken to avoid this collision */
  action: number;
  /** How concerned the aircraft is about this collision */
  threatLevel: number;
  /** Estimated time until collision occurs (s) */
  timeToMinimumDelta: number;
  /** Closest vertical distance between vehicle and object (m) */
  altitudeMinimumDelta: number;
  /** Closest horizontal distance between vehicle and object (m) */
  horizontalMinimumDelta: number;
}

export const COLLISION_ID = 247;
export const COLLISION_CRC_EXTRA = 81;
export const COLLISION_MIN_LENGTH = 19;
export const COLLISION_MAX_LENGTH = 19;

export function serializeCollision(msg: Collision): Uint8Array {
  const buffer = new Uint8Array(19);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.id, true);
  view.setFloat32(4, msg.timeToMinimumDelta, true);
  view.setFloat32(8, msg.altitudeMinimumDelta, true);
  view.setFloat32(12, msg.horizontalMinimumDelta, true);
  buffer[16] = msg.src & 0xff;
  buffer[17] = msg.action & 0xff;
  buffer[18] = msg.threatLevel & 0xff;

  return buffer;
}

export function deserializeCollision(payload: Uint8Array): Collision {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    id: view.getUint32(0, true),
    timeToMinimumDelta: view.getFloat32(4, true),
    altitudeMinimumDelta: view.getFloat32(8, true),
    horizontalMinimumDelta: view.getFloat32(12, true),
    src: payload[16],
    action: payload[17],
    threatLevel: payload[18],
  };
}