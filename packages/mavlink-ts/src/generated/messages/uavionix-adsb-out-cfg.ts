/**
 * Static data to configure the ADS-B transponder (send within 10 sec of a POR and every 10 sec thereafter)
 * Message ID: 10001
 * CRC Extra: 209
 */
export interface UavionixAdsbOutCfg {
  /** Vehicle address (24 bit) */
  icao: number;
  /** Vehicle identifier (8 characters, null terminated, valid characters are A-Z, 0-9, " " only) */
  callsign: string;
  /** Transmitting vehicle type. See ADSB_EMITTER_TYPE enum */
  emittertype: number;
  /** Aircraft length and width encoding (table 2-35 of DO-282B) */
  aircraftsize: number;
  /** GPS antenna lateral offset (table 2-36 of DO-282B) */
  gpsoffsetlat: number;
  /** GPS antenna longitudinal offset from nose [if non-zero, take position (in meters) divide by 2 and add one] (table 2-37 DO-282B) */
  gpsoffsetlon: number;
  /** Aircraft stall speed in cm/s (cm/s) */
  stallspeed: number;
  /** ADS-B transponder receiver and transmit enable flags */
  rfselect: number;
}

export const UAVIONIX_ADSB_OUT_CFG_ID = 10001;
export const UAVIONIX_ADSB_OUT_CFG_CRC_EXTRA = 209;
export const UAVIONIX_ADSB_OUT_CFG_MIN_LENGTH = 20;
export const UAVIONIX_ADSB_OUT_CFG_MAX_LENGTH = 20;

export function serializeUavionixAdsbOutCfg(msg: UavionixAdsbOutCfg): Uint8Array {
  const buffer = new Uint8Array(20);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.icao, true);
  view.setUint16(4, msg.stallspeed, true);
  // String: callsign
  const callsignBytes = new TextEncoder().encode(msg.callsign || '');
  buffer.set(callsignBytes.slice(0, 9), 6);
  buffer[15] = msg.emittertype & 0xff;
  buffer[16] = msg.aircraftsize & 0xff;
  buffer[17] = msg.gpsoffsetlat & 0xff;
  buffer[18] = msg.gpsoffsetlon & 0xff;
  buffer[19] = msg.rfselect & 0xff;

  return buffer;
}

export function deserializeUavionixAdsbOutCfg(payload: Uint8Array): UavionixAdsbOutCfg {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    icao: view.getUint32(0, true),
    stallspeed: view.getUint16(4, true),
    callsign: new TextDecoder().decode(payload.slice(6, 15)).replace(/\0.*$/, ''),
    emittertype: payload[15],
    aircraftsize: payload[16],
    gpsoffsetlat: payload[17],
    gpsoffsetlon: payload[18],
    rfselect: payload[19],
  };
}