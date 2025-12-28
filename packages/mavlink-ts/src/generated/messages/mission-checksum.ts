/**
 * Checksum for the current mission, rally point or geofence plan, or for the "combined" plan (a GCS can use these checksums to determine if it has matching plans).
        This message must be broadcast with the appropriate checksum following any change to a mission, geofence or rally point definition
        (immediately after the MISSION_ACK that completes the upload sequence).
        It may also be requested using MAV_CMD_REQUEST_MESSAGE, where param 2 indicates the plan type for which the checksum is required.
        The checksum must be calculated on the autopilot, but may also be calculated by the GCS.
        The checksum uses the same CRC32 algorithm as MAVLink FTP (https://mavlink.io/en/services/ftp.html#crc32-implementation).
        The checksum for a mission, geofence or rally point definition is run over each item in the plan in seq order (excluding the home location if present in the plan), and covers the following fields (in order):
        frame, command, autocontinue, param1, param2, param3, param4, param5, param6, param7.
        The checksum for the whole plan (MAV_MISSION_TYPE_ALL) is calculated using the same approach, running over each sub-plan in the following order: mission, geofence then rally point.
 * Message ID: 53
 * CRC Extra: 3
 */
export interface MissionChecksum {
  /** Mission type. */
  missionType: number;
  /** CRC32 checksum of current plan for specified type. */
  checksum: number;
}

export const MISSION_CHECKSUM_ID = 53;
export const MISSION_CHECKSUM_CRC_EXTRA = 3;
export const MISSION_CHECKSUM_MIN_LENGTH = 5;
export const MISSION_CHECKSUM_MAX_LENGTH = 5;

export function serializeMissionChecksum(msg: MissionChecksum): Uint8Array {
  const buffer = new Uint8Array(5);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.checksum, true);
  buffer[4] = msg.missionType & 0xff;

  return buffer;
}

export function deserializeMissionChecksum(payload: Uint8Array): MissionChecksum {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    checksum: view.getUint32(0, true),
    missionType: payload[4],
  };
}