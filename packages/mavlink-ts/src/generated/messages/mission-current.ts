/**
 * Message that announces the sequence number of the current active mission item. The MAV will fly towards this mission item.
 * Message ID: 42
 * CRC Extra: 218
 */
export interface MissionCurrent {
  /** Sequence */
  seq: number;
  /** Total number of mission items on vehicle (on last item, sequence == total). If the autopilot stores its home location as part of the mission this will be excluded from the total. 0: Not supported, UINT16_MAX if no mission is present on the vehicle. */
  total: number;
  /** Mission state machine state. MISSION_STATE_UNKNOWN if state reporting not supported. */
  missionState: number;
  /** Vehicle is in a mode that can execute mission items or suspended. 0: Unknown, 1: In mission mode, 2: Suspended (not in mission mode). */
  missionMode: number;
}

export const MISSION_CURRENT_ID = 42;
export const MISSION_CURRENT_CRC_EXTRA = 218;
export const MISSION_CURRENT_MIN_LENGTH = 6;
export const MISSION_CURRENT_MAX_LENGTH = 6;

export function serializeMissionCurrent(msg: MissionCurrent): Uint8Array {
  const buffer = new Uint8Array(6);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.seq, true);
  view.setUint16(2, msg.total, true);
  buffer[4] = msg.missionState & 0xff;
  buffer[5] = msg.missionMode & 0xff;

  return buffer;
}

export function deserializeMissionCurrent(payload: Uint8Array): MissionCurrent {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    seq: view.getUint16(0, true),
    total: view.getUint16(2, true),
    missionState: payload[4],
    missionMode: payload[5],
  };
}