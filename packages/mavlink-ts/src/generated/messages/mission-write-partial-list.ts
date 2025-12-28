/**
 * This message is sent to the MAV to write a partial list. If start index == end index, only one item will be transmitted / updated. If the start index is NOT 0 and above the current list size, this request should be REJECTED!
 * Message ID: 38
 * CRC Extra: 168
 */
export interface MissionWritePartialList {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Start index. Must be smaller / equal to the largest index of the current onboard list. */
  startIndex: number;
  /** End index, equal or greater than start index. */
  endIndex: number;
  /** Mission type. */
  missionType: number;
}

export const MISSION_WRITE_PARTIAL_LIST_ID = 38;
export const MISSION_WRITE_PARTIAL_LIST_CRC_EXTRA = 168;
export const MISSION_WRITE_PARTIAL_LIST_MIN_LENGTH = 7;
export const MISSION_WRITE_PARTIAL_LIST_MAX_LENGTH = 7;

export function serializeMissionWritePartialList(msg: MissionWritePartialList): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.startIndex, true);
  view.setInt16(2, msg.endIndex, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionWritePartialList(payload: Uint8Array): MissionWritePartialList {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    startIndex: view.getInt16(0, true),
    endIndex: view.getInt16(2, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    missionType: payload[6],
  };
}