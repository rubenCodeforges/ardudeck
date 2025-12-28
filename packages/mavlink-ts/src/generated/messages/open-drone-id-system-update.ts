/**
 * Update the data in the OPEN_DRONE_ID_SYSTEM message with new location information. This can be sent to update the location information for the operator when no other information in the SYSTEM message has changed. This message allows for efficient operation on radio links which have limited uplink bandwidth while meeting requirements for update frequency of the operator location.
 * Message ID: 12919
 * CRC Extra: 7
 */
export interface OpenDroneIdSystemUpdate {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Latitude of the operator. If unknown: 0 (both Lat/Lon). (degE7) */
  operatorLatitude: number;
  /** Longitude of the operator. If unknown: 0 (both Lat/Lon). (degE7) */
  operatorLongitude: number;
  /** Geodetic altitude of the operator relative to WGS84. If unknown: -1000 m. (m) */
  operatorAltitudeGeo: number;
  /** 32 bit Unix Timestamp in seconds since 00:00:00 01/01/2019. (s) */
  timestamp: number;
}

export const OPEN_DRONE_ID_SYSTEM_UPDATE_ID = 12919;
export const OPEN_DRONE_ID_SYSTEM_UPDATE_CRC_EXTRA = 7;
export const OPEN_DRONE_ID_SYSTEM_UPDATE_MIN_LENGTH = 18;
export const OPEN_DRONE_ID_SYSTEM_UPDATE_MAX_LENGTH = 18;

export function serializeOpenDroneIdSystemUpdate(msg: OpenDroneIdSystemUpdate): Uint8Array {
  const buffer = new Uint8Array(18);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.operatorLatitude, true);
  view.setInt32(4, msg.operatorLongitude, true);
  view.setFloat32(8, msg.operatorAltitudeGeo, true);
  view.setUint32(12, msg.timestamp, true);
  buffer[16] = msg.targetSystem & 0xff;
  buffer[17] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeOpenDroneIdSystemUpdate(payload: Uint8Array): OpenDroneIdSystemUpdate {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    operatorLatitude: view.getInt32(0, true),
    operatorLongitude: view.getInt32(4, true),
    operatorAltitudeGeo: view.getFloat32(8, true),
    timestamp: view.getUint32(12, true),
    targetSystem: payload[16],
    targetComponent: payload[17],
  };
}