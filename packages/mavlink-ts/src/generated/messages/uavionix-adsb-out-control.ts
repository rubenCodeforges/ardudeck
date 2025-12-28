/**
 * Control message with all data sent in UCP control message.
 * Message ID: 10007
 * CRC Extra: 71
 */
export interface UavionixAdsbOutControl {
  /** ADS-B transponder control state flags */
  state: number;
  /** Barometric pressure altitude (MSL) relative to a standard atmosphere of 1013.2 mBar and NOT bar corrected altitude (m * 1E-3). (up +ve). If unknown set to INT32_MAX (mbar) */
  baroaltmsl: number;
  /** Mode A code (typically 1200 [0x04B0] for VFR) */
  squawk: number;
  /** Emergency status */
  emergencystatus: number;
  /** Flight Identification: 8 ASCII characters, '0' through '9', 'A' through 'Z' or space. Spaces (0x20) used as a trailing pad character, or when call sign is unavailable. */
  flightId: string;
  /** X-Bit enable (military transponders only) */
  xBit: number;
}

export const UAVIONIX_ADSB_OUT_CONTROL_ID = 10007;
export const UAVIONIX_ADSB_OUT_CONTROL_CRC_EXTRA = 71;
export const UAVIONIX_ADSB_OUT_CONTROL_MIN_LENGTH = 17;
export const UAVIONIX_ADSB_OUT_CONTROL_MAX_LENGTH = 17;

export function serializeUavionixAdsbOutControl(msg: UavionixAdsbOutControl): Uint8Array {
  const buffer = new Uint8Array(17);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.baroaltmsl, true);
  view.setUint16(4, msg.squawk, true);
  buffer[6] = msg.state & 0xff;
  buffer[7] = msg.emergencystatus & 0xff;
  // String: flight_id
  const flightIdBytes = new TextEncoder().encode(msg.flightId || '');
  buffer.set(flightIdBytes.slice(0, 8), 8);
  buffer[16] = msg.xBit & 0xff;

  return buffer;
}

export function deserializeUavionixAdsbOutControl(payload: Uint8Array): UavionixAdsbOutControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    baroaltmsl: view.getInt32(0, true),
    squawk: view.getUint16(4, true),
    state: payload[6],
    emergencystatus: payload[7],
    flightId: new TextDecoder().decode(payload.slice(8, 16)).replace(/\0.*$/, ''),
    xBit: payload[16],
  };
}