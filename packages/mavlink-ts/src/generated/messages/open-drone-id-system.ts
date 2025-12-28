/**
 * Data for filling the OpenDroneID System message. The System Message contains general system information including the operator location/altitude and possible aircraft group and/or category/class information.
 * Message ID: 12904
 * CRC Extra: 77
 */
export interface OpenDroneIdSystem {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Specifies the operator location type. */
  operatorLocationType: number;
  /** Specifies the classification type of the UA. */
  classificationType: number;
  /** Latitude of the operator. If unknown: 0 (both Lat/Lon). (degE7) */
  operatorLatitude: number;
  /** Longitude of the operator. If unknown: 0 (both Lat/Lon). (degE7) */
  operatorLongitude: number;
  /** Number of aircraft in the area, group or formation (default 1). */
  areaCount: number;
  /** Radius of the cylindrical area of the group or formation (default 0). (m) */
  areaRadius: number;
  /** Area Operations Ceiling relative to WGS84. If unknown: -1000 m. (m) */
  areaCeiling: number;
  /** Area Operations Floor relative to WGS84. If unknown: -1000 m. (m) */
  areaFloor: number;
  /** When classification_type is MAV_ODID_CLASSIFICATION_TYPE_EU, specifies the category of the UA. */
  categoryEu: number;
  /** When classification_type is MAV_ODID_CLASSIFICATION_TYPE_EU, specifies the class of the UA. */
  classEu: number;
  /** Geodetic altitude of the operator relative to WGS84. If unknown: -1000 m. (m) */
  operatorAltitudeGeo: number;
  /** 32 bit Unix Timestamp in seconds since 00:00:00 01/01/2019. (s) */
  timestamp: number;
}

export const OPEN_DRONE_ID_SYSTEM_ID = 12904;
export const OPEN_DRONE_ID_SYSTEM_CRC_EXTRA = 77;
export const OPEN_DRONE_ID_SYSTEM_MIN_LENGTH = 54;
export const OPEN_DRONE_ID_SYSTEM_MAX_LENGTH = 54;

export function serializeOpenDroneIdSystem(msg: OpenDroneIdSystem): Uint8Array {
  const buffer = new Uint8Array(54);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.operatorLatitude, true);
  view.setInt32(4, msg.operatorLongitude, true);
  view.setFloat32(8, msg.areaCeiling, true);
  view.setFloat32(12, msg.areaFloor, true);
  view.setFloat32(16, msg.operatorAltitudeGeo, true);
  view.setUint32(20, msg.timestamp, true);
  view.setUint16(24, msg.areaCount, true);
  view.setUint16(26, msg.areaRadius, true);
  buffer[28] = msg.targetSystem & 0xff;
  buffer[29] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[30 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[50] = msg.operatorLocationType & 0xff;
  buffer[51] = msg.classificationType & 0xff;
  buffer[52] = msg.categoryEu & 0xff;
  buffer[53] = msg.classEu & 0xff;

  return buffer;
}

export function deserializeOpenDroneIdSystem(payload: Uint8Array): OpenDroneIdSystem {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    operatorLatitude: view.getInt32(0, true),
    operatorLongitude: view.getInt32(4, true),
    areaCeiling: view.getFloat32(8, true),
    areaFloor: view.getFloat32(12, true),
    operatorAltitudeGeo: view.getFloat32(16, true),
    timestamp: view.getUint32(20, true),
    areaCount: view.getUint16(24, true),
    areaRadius: view.getUint16(26, true),
    targetSystem: payload[28],
    targetComponent: payload[29],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[30 + i * 1]),
    operatorLocationType: payload[50],
    classificationType: payload[51],
    categoryEu: payload[52],
    classEu: payload[53],
  };
}