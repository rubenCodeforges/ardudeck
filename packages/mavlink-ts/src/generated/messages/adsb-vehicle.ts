/**
 * The location and information of an ADSB vehicle
 * Message ID: 246
 * CRC Extra: 184
 */
export interface AdsbVehicle {
  /** ICAO address */
  icaoAddress: number;
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
  /** ADSB altitude type. */
  altitudeType: number;
  /** Altitude(ASL) (mm) */
  altitude: number;
  /** Course over ground (cdeg) */
  heading: number;
  /** The horizontal velocity (cm/s) */
  horVelocity: number;
  /** The vertical velocity. Positive is up (cm/s) */
  verVelocity: number;
  /** The callsign, 8+null */
  callsign: string;
  /** ADSB emitter type. */
  emitterType: number;
  /** Time since last communication in seconds (s) */
  tslc: number;
  /** Bitmap to indicate various statuses including valid data fields */
  flags: number;
  /** Squawk code */
  squawk: number;
}

export const ADSB_VEHICLE_ID = 246;
export const ADSB_VEHICLE_CRC_EXTRA = 184;
export const ADSB_VEHICLE_MIN_LENGTH = 38;
export const ADSB_VEHICLE_MAX_LENGTH = 38;

export function serializeAdsbVehicle(msg: AdsbVehicle): Uint8Array {
  const buffer = new Uint8Array(38);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.icaoAddress, true);
  view.setInt32(4, msg.lat, true);
  view.setInt32(8, msg.lon, true);
  view.setInt32(12, msg.altitude, true);
  view.setUint16(16, msg.heading, true);
  view.setUint16(18, msg.horVelocity, true);
  view.setInt16(20, msg.verVelocity, true);
  view.setUint16(22, msg.flags, true);
  view.setUint16(24, msg.squawk, true);
  buffer[26] = msg.altitudeType & 0xff;
  // String: callsign
  const callsignBytes = new TextEncoder().encode(msg.callsign || '');
  buffer.set(callsignBytes.slice(0, 9), 27);
  buffer[36] = msg.emitterType & 0xff;
  buffer[37] = msg.tslc & 0xff;

  return buffer;
}

export function deserializeAdsbVehicle(payload: Uint8Array): AdsbVehicle {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    icaoAddress: view.getUint32(0, true),
    lat: view.getInt32(4, true),
    lon: view.getInt32(8, true),
    altitude: view.getInt32(12, true),
    heading: view.getUint16(16, true),
    horVelocity: view.getUint16(18, true),
    verVelocity: view.getInt16(20, true),
    flags: view.getUint16(22, true),
    squawk: view.getUint16(24, true),
    altitudeType: payload[26],
    callsign: new TextDecoder().decode(payload.slice(27, 36)).replace(/\0.*$/, ''),
    emitterType: payload[36],
    tslc: payload[37],
  };
}