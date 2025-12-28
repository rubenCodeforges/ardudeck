/**
 * Atmospheric sensors (temperature, humidity, ...)
 * Message ID: 8009
 * CRC Extra: 144
 */
export interface SensAtmos {
  /** Time since system boot (us) */
  timestamp: bigint;
  /** Ambient temperature (degC) */
  tempambient: number;
  /** Relative humidity (%) */
  humidity: number;
}

export const SENS_ATMOS_ID = 8009;
export const SENS_ATMOS_CRC_EXTRA = 144;
export const SENS_ATMOS_MIN_LENGTH = 16;
export const SENS_ATMOS_MAX_LENGTH = 16;

export function serializeSensAtmos(msg: SensAtmos): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setFloat32(8, msg.tempambient, true);
  view.setFloat32(12, msg.humidity, true);

  return buffer;
}

export function deserializeSensAtmos(payload: Uint8Array): SensAtmos {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    tempambient: view.getFloat32(8, true),
    humidity: view.getFloat32(12, true),
  };
}