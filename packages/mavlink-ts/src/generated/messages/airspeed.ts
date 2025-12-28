/**
 * Airspeed information from a sensor.
 * Message ID: 295
 * CRC Extra: 234
 */
export interface Airspeed {
  /** Sensor ID. */
  id: number;
  /** Calibrated airspeed (CAS). (m/s) */
  airspeed: number;
  /** Temperature. INT16_MAX for value unknown/not supplied. (cdegC) */
  temperature: number;
  /** Raw differential pressure. NaN for value unknown/not supplied. (hPa) */
  rawPress: number;
  /** Airspeed sensor flags. */
  flags: number;
}

export const AIRSPEED_ID = 295;
export const AIRSPEED_CRC_EXTRA = 234;
export const AIRSPEED_MIN_LENGTH = 12;
export const AIRSPEED_MAX_LENGTH = 12;

export function serializeAirspeed(msg: Airspeed): Uint8Array {
  const buffer = new Uint8Array(12);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.airspeed, true);
  view.setFloat32(4, msg.rawPress, true);
  view.setInt16(8, msg.temperature, true);
  buffer[10] = msg.id & 0xff;
  buffer[11] = msg.flags & 0xff;

  return buffer;
}

export function deserializeAirspeed(payload: Uint8Array): Airspeed {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    airspeed: view.getFloat32(0, true),
    rawPress: view.getFloat32(4, true),
    temperature: view.getInt16(8, true),
    id: payload[10],
    flags: payload[11],
  };
}