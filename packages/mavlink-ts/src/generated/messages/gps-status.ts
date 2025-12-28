/**
 * The positioning status, as reported by GPS. This message is intended to display status information about each satellite visible to the receiver. See message GLOBAL_POSITION_INT for the global position estimate. This message can contain information for up to 20 satellites.
 * Message ID: 25
 * CRC Extra: 23
 */
export interface GpsStatus {
  /** Number of satellites visible */
  satellitesVisible: number;
  /** Global satellite ID */
  satellitePrn: number[];
  /** 0: Satellite not used, 1: used for localization */
  satelliteUsed: number[];
  /** Elevation (0: right on top of receiver, 90: on the horizon) of satellite (deg) */
  satelliteElevation: number[];
  /** Direction of satellite, 0: 0 deg, 255: 360 deg. (deg) */
  satelliteAzimuth: number[];
  /** Signal to noise ratio of satellite (dB) */
  satelliteSnr: number[];
}

export const GPS_STATUS_ID = 25;
export const GPS_STATUS_CRC_EXTRA = 23;
export const GPS_STATUS_MIN_LENGTH = 101;
export const GPS_STATUS_MAX_LENGTH = 101;

export function serializeGpsStatus(msg: GpsStatus): Uint8Array {
  const buffer = new Uint8Array(101);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.satellitesVisible & 0xff;
  // Array: satellite_prn
  for (let i = 0; i < 20; i++) {
    buffer[1 + i * 1] = msg.satellitePrn[i] ?? 0 & 0xff;
  }
  // Array: satellite_used
  for (let i = 0; i < 20; i++) {
    buffer[21 + i * 1] = msg.satelliteUsed[i] ?? 0 & 0xff;
  }
  // Array: satellite_elevation
  for (let i = 0; i < 20; i++) {
    buffer[41 + i * 1] = msg.satelliteElevation[i] ?? 0 & 0xff;
  }
  // Array: satellite_azimuth
  for (let i = 0; i < 20; i++) {
    buffer[61 + i * 1] = msg.satelliteAzimuth[i] ?? 0 & 0xff;
  }
  // Array: satellite_snr
  for (let i = 0; i < 20; i++) {
    buffer[81 + i * 1] = msg.satelliteSnr[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeGpsStatus(payload: Uint8Array): GpsStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    satellitesVisible: payload[0],
    satellitePrn: Array.from({ length: 20 }, (_, i) => payload[1 + i * 1]),
    satelliteUsed: Array.from({ length: 20 }, (_, i) => payload[21 + i * 1]),
    satelliteElevation: Array.from({ length: 20 }, (_, i) => payload[41 + i * 1]),
    satelliteAzimuth: Array.from({ length: 20 }, (_, i) => payload[61 + i * 1]),
    satelliteSnr: Array.from({ length: 20 }, (_, i) => payload[81 + i * 1]),
  };
}