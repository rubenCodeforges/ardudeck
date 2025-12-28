/**
 * Dynamic data used to generate ADS-B out transponder data (send at 5Hz)
 * Message ID: 10002
 * CRC Extra: 186
 */
export interface UavionixAdsbOutDynamic {
  /** UTC time in seconds since GPS epoch (Jan 6, 1980). If unknown set to UINT32_MAX (s) */
  utctime: number;
  /** Latitude WGS84 (deg * 1E7). If unknown set to INT32_MAX (degE7) */
  gpslat: number;
  /** Longitude WGS84 (deg * 1E7). If unknown set to INT32_MAX (degE7) */
  gpslon: number;
  /** Altitude (WGS84). UP +ve. If unknown set to INT32_MAX (mm) */
  gpsalt: number;
  /** 0-1: no fix, 2: 2D fix, 3: 3D fix, 4: DGPS, 5: RTK */
  gpsfix: number;
  /** Number of satellites visible. If unknown set to UINT8_MAX */
  numsats: number;
  /** Barometric pressure altitude (MSL) relative to a standard atmosphere of 1013.2 mBar and NOT bar corrected altitude (m * 1E-3). (up +ve). If unknown set to INT32_MAX (mbar) */
  baroaltmsl: number;
  /** Horizontal accuracy in mm (m * 1E-3). If unknown set to UINT32_MAX (mm) */
  accuracyhor: number;
  /** Vertical accuracy in cm. If unknown set to UINT16_MAX (cm) */
  accuracyvert: number;
  /** Velocity accuracy in mm/s (m * 1E-3). If unknown set to UINT16_MAX (mm/s) */
  accuracyvel: number;
  /** GPS vertical speed in cm/s. If unknown set to INT16_MAX (cm/s) */
  velvert: number;
  /** North-South velocity over ground in cm/s North +ve. If unknown set to INT16_MAX (cm/s) */
  velns: number;
  /** East-West velocity over ground in cm/s East +ve. If unknown set to INT16_MAX (cm/s) */
  velew: number;
  /** Emergency status */
  emergencystatus: number;
  /** ADS-B transponder dynamic input state flags */
  state: number;
  /** Mode A code (typically 1200 [0x04B0] for VFR) */
  squawk: number;
}

export const UAVIONIX_ADSB_OUT_DYNAMIC_ID = 10002;
export const UAVIONIX_ADSB_OUT_DYNAMIC_CRC_EXTRA = 186;
export const UAVIONIX_ADSB_OUT_DYNAMIC_MIN_LENGTH = 41;
export const UAVIONIX_ADSB_OUT_DYNAMIC_MAX_LENGTH = 41;

export function serializeUavionixAdsbOutDynamic(msg: UavionixAdsbOutDynamic): Uint8Array {
  const buffer = new Uint8Array(41);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.utctime, true);
  view.setInt32(4, msg.gpslat, true);
  view.setInt32(8, msg.gpslon, true);
  view.setInt32(12, msg.gpsalt, true);
  view.setInt32(16, msg.baroaltmsl, true);
  view.setUint32(20, msg.accuracyhor, true);
  view.setUint16(24, msg.accuracyvert, true);
  view.setUint16(26, msg.accuracyvel, true);
  view.setInt16(28, msg.velvert, true);
  view.setInt16(30, msg.velns, true);
  view.setInt16(32, msg.velew, true);
  view.setUint16(34, msg.state, true);
  view.setUint16(36, msg.squawk, true);
  buffer[38] = msg.gpsfix & 0xff;
  buffer[39] = msg.numsats & 0xff;
  buffer[40] = msg.emergencystatus & 0xff;

  return buffer;
}

export function deserializeUavionixAdsbOutDynamic(payload: Uint8Array): UavionixAdsbOutDynamic {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    utctime: view.getUint32(0, true),
    gpslat: view.getInt32(4, true),
    gpslon: view.getInt32(8, true),
    gpsalt: view.getInt32(12, true),
    baroaltmsl: view.getInt32(16, true),
    accuracyhor: view.getUint32(20, true),
    accuracyvert: view.getUint16(24, true),
    accuracyvel: view.getUint16(26, true),
    velvert: view.getInt16(28, true),
    velns: view.getInt16(30, true),
    velew: view.getInt16(32, true),
    state: view.getUint16(34, true),
    squawk: view.getUint16(36, true),
    gpsfix: payload[38],
    numsats: payload[39],
    emergencystatus: payload[40],
  };
}