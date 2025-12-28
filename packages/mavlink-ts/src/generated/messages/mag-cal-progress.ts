/**
 * Reports progress of compass calibration.
 * Message ID: 191
 * CRC Extra: 92
 */
export interface MagCalProgress {
  /** Compass being calibrated. */
  compassId: number;
  /** Bitmask of compasses being calibrated. */
  calMask: number;
  /** Calibration Status. */
  calStatus: number;
  /** Attempt number. */
  attempt: number;
  /** Completion percentage. (%) */
  completionPct: number;
  /** Bitmask of sphere sections (see http://en.wikipedia.org/wiki/Geodesic_grid). */
  completionMask: number[];
  /** Body frame direction vector for display. */
  directionX: number;
  /** Body frame direction vector for display. */
  directionY: number;
  /** Body frame direction vector for display. */
  directionZ: number;
}

export const MAG_CAL_PROGRESS_ID = 191;
export const MAG_CAL_PROGRESS_CRC_EXTRA = 92;
export const MAG_CAL_PROGRESS_MIN_LENGTH = 27;
export const MAG_CAL_PROGRESS_MAX_LENGTH = 27;

export function serializeMagCalProgress(msg: MagCalProgress): Uint8Array {
  const buffer = new Uint8Array(27);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.directionX, true);
  view.setFloat32(4, msg.directionY, true);
  view.setFloat32(8, msg.directionZ, true);
  buffer[12] = msg.compassId & 0xff;
  buffer[13] = msg.calMask & 0xff;
  buffer[14] = msg.calStatus & 0xff;
  buffer[15] = msg.attempt & 0xff;
  buffer[16] = msg.completionPct & 0xff;
  // Array: completion_mask
  for (let i = 0; i < 10; i++) {
    buffer[17 + i * 1] = msg.completionMask[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeMagCalProgress(payload: Uint8Array): MagCalProgress {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    directionX: view.getFloat32(0, true),
    directionY: view.getFloat32(4, true),
    directionZ: view.getFloat32(8, true),
    compassId: payload[12],
    calMask: payload[13],
    calStatus: payload[14],
    attempt: payload[15],
    completionPct: payload[16],
    completionMask: Array.from({ length: 10 }, (_, i) => payload[17 + i * 1]),
  };
}