/**
 * The location and information of an AIS vessel
 * Message ID: 301
 * CRC Extra: 243
 */
export interface AisVessel {
  /** Mobile Marine Service Identifier, 9 decimal digits */
  mmsi: number;
  /** Latitude (degE7) */
  lat: number;
  /** Longitude (degE7) */
  lon: number;
  /** Course over ground (cdeg) */
  cog: number;
  /** True heading (cdeg) */
  heading: number;
  /** Speed over ground (cm/s) */
  velocity: number;
  /** Turn rate (cdeg/s) */
  turnRate: number;
  /** Navigational status */
  navigationalStatus: number;
  /** Type of vessels */
  type: number;
  /** Distance from lat/lon location to bow (m) */
  dimensionBow: number;
  /** Distance from lat/lon location to stern (m) */
  dimensionStern: number;
  /** Distance from lat/lon location to port side (m) */
  dimensionPort: number;
  /** Distance from lat/lon location to starboard side (m) */
  dimensionStarboard: number;
  /** The vessel callsign */
  callsign: string;
  /** The vessel name */
  name: string;
  /** Time since last communication in seconds (s) */
  tslc: number;
  /** Bitmask to indicate various statuses including valid data fields */
  flags: number;
}

export const AIS_VESSEL_ID = 301;
export const AIS_VESSEL_CRC_EXTRA = 243;
export const AIS_VESSEL_MIN_LENGTH = 58;
export const AIS_VESSEL_MAX_LENGTH = 58;

export function serializeAisVessel(msg: AisVessel): Uint8Array {
  const buffer = new Uint8Array(58);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.mmsi, true);
  view.setInt32(4, msg.lat, true);
  view.setInt32(8, msg.lon, true);
  view.setUint16(12, msg.cog, true);
  view.setUint16(14, msg.heading, true);
  view.setUint16(16, msg.velocity, true);
  view.setUint16(18, msg.dimensionBow, true);
  view.setUint16(20, msg.dimensionStern, true);
  view.setUint16(22, msg.tslc, true);
  view.setUint16(24, msg.flags, true);
  view.setInt8(26, msg.turnRate);
  buffer[27] = msg.navigationalStatus & 0xff;
  buffer[28] = msg.type & 0xff;
  buffer[29] = msg.dimensionPort & 0xff;
  buffer[30] = msg.dimensionStarboard & 0xff;
  // String: callsign
  const callsignBytes = new TextEncoder().encode(msg.callsign || '');
  buffer.set(callsignBytes.slice(0, 7), 31);
  // String: name
  const nameBytes = new TextEncoder().encode(msg.name || '');
  buffer.set(nameBytes.slice(0, 20), 38);

  return buffer;
}

export function deserializeAisVessel(payload: Uint8Array): AisVessel {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mmsi: view.getUint32(0, true),
    lat: view.getInt32(4, true),
    lon: view.getInt32(8, true),
    cog: view.getUint16(12, true),
    heading: view.getUint16(14, true),
    velocity: view.getUint16(16, true),
    dimensionBow: view.getUint16(18, true),
    dimensionStern: view.getUint16(20, true),
    tslc: view.getUint16(22, true),
    flags: view.getUint16(24, true),
    turnRate: view.getInt8(26),
    navigationalStatus: payload[27],
    type: payload[28],
    dimensionPort: payload[29],
    dimensionStarboard: payload[30],
    callsign: new TextDecoder().decode(payload.slice(31, 38)).replace(/\0.*$/, ''),
    name: new TextDecoder().decode(payload.slice(38, 58)).replace(/\0.*$/, ''),
  };
}