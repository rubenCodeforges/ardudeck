/**
 * Camera vision based attitude and position deltas.
 * Message ID: 11011
 * CRC Extra: 106
 */
export interface VisionPositionDelta {
  /** Timestamp (synced to UNIX time or since system boot). (us) */
  timeUsec: bigint;
  /** Time since the last reported camera frame. (us) */
  timeDeltaUsec: bigint;
  /** Defines a rotation vector [roll, pitch, yaw] to the current MAV_FRAME_BODY_FRD from the previous MAV_FRAME_BODY_FRD. (rad) */
  angleDelta: number[];
  /** Change in position to the current MAV_FRAME_BODY_FRD from the previous FRAME_BODY_FRD rotated to the current MAV_FRAME_BODY_FRD. (m) */
  positionDelta: number[];
  /** Normalised confidence value from 0 to 100. (%) */
  confidence: number;
}

export const VISION_POSITION_DELTA_ID = 11011;
export const VISION_POSITION_DELTA_CRC_EXTRA = 106;
export const VISION_POSITION_DELTA_MIN_LENGTH = 44;
export const VISION_POSITION_DELTA_MAX_LENGTH = 44;

export function serializeVisionPositionDelta(msg: VisionPositionDelta): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setBigUint64(8, BigInt(msg.timeDeltaUsec), true);
  // Array: angle_delta
  for (let i = 0; i < 3; i++) {
    view.setFloat32(16 + i * 4, msg.angleDelta[i] ?? 0, true);
  }
  // Array: position_delta
  for (let i = 0; i < 3; i++) {
    view.setFloat32(28 + i * 4, msg.positionDelta[i] ?? 0, true);
  }
  view.setFloat32(40, msg.confidence, true);

  return buffer;
}

export function deserializeVisionPositionDelta(payload: Uint8Array): VisionPositionDelta {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    timeDeltaUsec: view.getBigUint64(8, true),
    angleDelta: Array.from({ length: 3 }, (_, i) => view.getFloat32(16 + i * 4, true)),
    positionDelta: Array.from({ length: 3 }, (_, i) => view.getFloat32(28 + i * 4, true)),
    confidence: view.getFloat32(40, true),
  };
}