/**
 * Request a partial list of mission items from the system/component. https://mavlink.io/en/services/mission.html. If start and end index are the same, just send one waypoint.
 * Message ID: 37
 * CRC Extra: 4
 */
export interface MissionRequestPartialList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Start index */
  startIndex: number;
  /** End index, -1 by default (-1: send list to end). Else a valid index of the list */
  endIndex: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_REQUEST_PARTIAL_LIST_ID = 37;
export const MISSION_REQUEST_PARTIAL_LIST_CRC_EXTRA = 4;
export const MISSION_REQUEST_PARTIAL_LIST_MIN_LENGTH = 7;
export const MISSION_REQUEST_PARTIAL_LIST_MAX_LENGTH = 7;

export function serializeMissionRequestPartialList(msg: MissionRequestPartialList): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.startIndex, true);
  view.setInt16(2, msg.endIndex, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionRequestPartialList(payload: Uint8Array): MissionRequestPartialList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    startIndex: view.getInt16(0, true),
    endIndex: view.getInt16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    missionType: payload[6],
  };
}