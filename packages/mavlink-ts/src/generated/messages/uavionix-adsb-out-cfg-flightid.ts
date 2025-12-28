/**
 * Flight Identification for ADSB-Out vehicles.
 * Message ID: 10005
 * CRC Extra: 103
 */
export interface UavionixAdsbOutCfgFlightid {
  /** Flight Identification: 8 ASCII characters, '0' through '9', 'A' through 'Z' or space. Spaces (0x20) used as a trailing pad character, or when call sign is unavailable. Reflects Control message setting. This is null-terminated. */
  flightId: string;
}

export const UAVIONIX_ADSB_OUT_CFG_FLIGHTID_ID = 10005;
export const UAVIONIX_ADSB_OUT_CFG_FLIGHTID_CRC_EXTRA = 103;
export const UAVIONIX_ADSB_OUT_CFG_FLIGHTID_MIN_LENGTH = 9;
export const UAVIONIX_ADSB_OUT_CFG_FLIGHTID_MAX_LENGTH = 9;

export function serializeUavionixAdsbOutCfgFlightid(msg: UavionixAdsbOutCfgFlightid): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  // String: flight_id
  const flightIdBytes = new TextEncoder().encode(msg.flightId || '');
  buffer.set(flightIdBytes.slice(0, 9), 0);

  return buffer;
}

export function deserializeUavionixAdsbOutCfgFlightid(payload: Uint8Array): UavionixAdsbOutCfgFlightid {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    flightId: new TextDecoder().decode(payload.slice(0, 9)).replace(/\0.*$/, ''),
  };
}