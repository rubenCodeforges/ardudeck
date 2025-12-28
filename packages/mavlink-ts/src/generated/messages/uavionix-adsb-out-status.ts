/**
 * Status message with information from UCP Heartbeat and Status messages.
 * Message ID: 10008
 * CRC Extra: 240
 */
export interface UavionixAdsbOutStatus {
  /** ADS-B transponder status state flags */
  state: number;
  /** Mode A code (typically 1200 [0x04B0] for VFR) */
  squawk: number;
  /** Integrity and Accuracy of traffic reported as a 4-bit value for each field (NACp 7:4, NIC 3:0) and encoded by Containment Radius (HPL) and Estimated Position Uncertainty (HFOM), respectively */
  nicNacp: number;
  /** Board temperature in C */
  boardtemp: number;
  /** ADS-B transponder fault flags */
  fault: number;
  /** Flight Identification: 8 ASCII characters, '0' through '9', 'A' through 'Z' or space. Spaces (0x20) used as a trailing pad character, or when call sign is unavailable. */
  flightId: string;
}

export const UAVIONIX_ADSB_OUT_STATUS_ID = 10008;
export const UAVIONIX_ADSB_OUT_STATUS_CRC_EXTRA = 240;
export const UAVIONIX_ADSB_OUT_STATUS_MIN_LENGTH = 14;
export const UAVIONIX_ADSB_OUT_STATUS_MAX_LENGTH = 14;

export function serializeUavionixAdsbOutStatus(msg: UavionixAdsbOutStatus): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.squawk, true);
  buffer[2] = msg.state & 0xff;
  buffer[3] = msg.nicNacp & 0xff;
  buffer[4] = msg.boardtemp & 0xff;
  buffer[5] = msg.fault & 0xff;
  // String: flight_id
  const flightIdBytes = new TextEncoder().encode(msg.flightId || '');
  buffer.set(flightIdBytes.slice(0, 8), 6);

  return buffer;
}

export function deserializeUavionixAdsbOutStatus(payload: Uint8Array): UavionixAdsbOutStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    squawk: view.getUint16(0, true),
    state: payload[2],
    nicNacp: payload[3],
    boardtemp: payload[4],
    fault: payload[5],
    flightId: new TextDecoder().decode(payload.slice(6, 14)).replace(/\0.*$/, ''),
  };
}