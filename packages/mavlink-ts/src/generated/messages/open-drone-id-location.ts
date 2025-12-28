/**
 * Data for filling the OpenDroneID Location message. The float data types are 32-bit IEEE 754. The Location message provides the location, altitude, direction and speed of the aircraft.
 * Message ID: 12901
 * CRC Extra: 254
 */
export interface OpenDroneIdLocation {
  /** System ID (0 for broadcast). */
  targetSystem: number;
  /** Component ID (0 for broadcast). */
  targetComponent: number;
  /** Only used for drone ID data received from other UAs. See detailed description at https://mavlink.io/en/services/opendroneid.html. */
  idOrMac: number[];
  /** Indicates whether the unmanned aircraft is on the ground or in the air. */
  status: number;
  /** Direction over ground (not heading, but direction of movement) measured clockwise from true North: 0 - 35999 centi-degrees. If unknown: 36100 centi-degrees. (cdeg) */
  direction: number;
  /** Ground speed. Positive only. If unknown: 25500 cm/s. If speed is larger than 25425 cm/s, use 25425 cm/s. (cm/s) */
  speedHorizontal: number;
  /** The vertical speed. Up is positive. If unknown: 6300 cm/s. If speed is larger than 6200 cm/s, use 6200 cm/s. If lower than -6200 cm/s, use -6200 cm/s. (cm/s) */
  speedVertical: number;
  /** Current latitude of the unmanned aircraft. If unknown: 0 (both Lat/Lon). (degE7) */
  latitude: number;
  /** Current longitude of the unmanned aircraft. If unknown: 0 (both Lat/Lon). (degE7) */
  longitude: number;
  /** The altitude calculated from the barometric pressure. Reference is against 29.92inHg or 1013.2mb. If unknown: -1000 m. (m) */
  altitudeBarometric: number;
  /** The geodetic altitude as defined by WGS84. If unknown: -1000 m. (m) */
  altitudeGeodetic: number;
  /** Indicates the reference point for the height field. */
  heightReference: number;
  /** The current height of the unmanned aircraft above the take-off location or the ground as indicated by height_reference. If unknown: -1000 m. (m) */
  height: number;
  /** The accuracy of the horizontal position. */
  horizontalAccuracy: number;
  /** The accuracy of the vertical position. */
  verticalAccuracy: number;
  /** The accuracy of the barometric altitude. */
  barometerAccuracy: number;
  /** The accuracy of the horizontal and vertical speed. */
  speedAccuracy: number;
  /** Seconds after the full hour with reference to UTC time. Typically the GPS outputs a time-of-week value in milliseconds. First convert that to UTC and then convert for this field using ((float) (time_week_ms % (60*60*1000))) / 1000. If unknown: 0xFFFF. (s) */
  timestamp: number;
  /** The accuracy of the timestamps. */
  timestampAccuracy: number;
}

export const OPEN_DRONE_ID_LOCATION_ID = 12901;
export const OPEN_DRONE_ID_LOCATION_CRC_EXTRA = 254;
export const OPEN_DRONE_ID_LOCATION_MIN_LENGTH = 59;
export const OPEN_DRONE_ID_LOCATION_MAX_LENGTH = 59;

export function serializeOpenDroneIdLocation(msg: OpenDroneIdLocation): Uint8Array {
  const buffer = new Uint8Array(59);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.latitude, true);
  view.setInt32(4, msg.longitude, true);
  view.setFloat32(8, msg.altitudeBarometric, true);
  view.setFloat32(12, msg.altitudeGeodetic, true);
  view.setFloat32(16, msg.height, true);
  view.setFloat32(20, msg.timestamp, true);
  view.setUint16(24, msg.direction, true);
  view.setUint16(26, msg.speedHorizontal, true);
  view.setInt16(28, msg.speedVertical, true);
  buffer[30] = msg.targetSystem & 0xff;
  buffer[31] = msg.targetComponent & 0xff;
  // Array: id_or_mac
  for (let i = 0; i < 20; i++) {
    buffer[32 + i * 1] = msg.idOrMac[i] ?? 0 & 0xff;
  }
  buffer[52] = msg.status & 0xff;
  buffer[53] = msg.heightReference & 0xff;
  buffer[54] = msg.horizontalAccuracy & 0xff;
  buffer[55] = msg.verticalAccuracy & 0xff;
  buffer[56] = msg.barometerAccuracy & 0xff;
  buffer[57] = msg.speedAccuracy & 0xff;
  buffer[58] = msg.timestampAccuracy & 0xff;

  return buffer;
}

export function deserializeOpenDroneIdLocation(payload: Uint8Array): OpenDroneIdLocation {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    latitude: view.getInt32(0, true),
    longitude: view.getInt32(4, true),
    altitudeBarometric: view.getFloat32(8, true),
    altitudeGeodetic: view.getFloat32(12, true),
    height: view.getFloat32(16, true),
    timestamp: view.getFloat32(20, true),
    direction: view.getUint16(24, true),
    speedHorizontal: view.getUint16(26, true),
    speedVertical: view.getInt16(28, true),
    targetSystem: payload[30],
    targetComponent: payload[31],
    idOrMac: Array.from({ length: 20 }, (_, i) => payload[32 + i * 1]),
    status: payload[52],
    heightReference: payload[53],
    horizontalAccuracy: payload[54],
    verticalAccuracy: payload[55],
    barometerAccuracy: payload[56],
    speedAccuracy: payload[57],
    timestampAccuracy: payload[58],
  };
}