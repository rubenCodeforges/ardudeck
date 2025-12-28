/**
 * A certain mission item has been reached. The system will either hold this position (or circle on the orbit) or (if the autocontinue on the WP was set) continue to the next waypoint.
 * Message ID: 46
 * CRC Extra: 11
 */
export interface MissionItemReached {
  /** Sequence */
  seq: number;
}

export const MISSION_ITEM_REACHED_ID = 46;
export const MISSION_ITEM_REACHED_CRC_EXTRA = 11;
export const MISSION_ITEM_REACHED_MIN_LENGTH = 2;
export const MISSION_ITEM_REACHED_MAX_LENGTH = 2;

export function serializeMissionItemReached(msg: MissionItemReached): Uint8Array {
  const buffer = new Uint8Array(2);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);

  return buffer;
}

export function deserializeMissionItemReached(payload: Uint8Array): MissionItemReached {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
  };
}