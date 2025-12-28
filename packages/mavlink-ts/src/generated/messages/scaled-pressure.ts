/**
 * The pressure readings for the typical setup of one absolute and differential pressure sensor. The units are as specified in each field.
 * Message ID: 29
 * CRC Extra: 107
 */
export interface ScaledPressure {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Absolute pressure (hPa) */
  pressAbs: number;
  /** Differential pressure 1 (hPa) */
  pressDiff: number;
  /** Absolute pressure temperature (cdegC) */
  temperature: number;
  /** Differential pressure temperature (0, if not available). Report values of 0 (or 1) as 1 cdegC. (cdegC) */
  temperaturePressDiff: number;
}

export const SCALED_PRESSURE_ID = 29;
export const SCALED_PRESSURE_CRC_EXTRA = 107;
export const SCALED_PRESSURE_MIN_LENGTH = 16;
export const SCALED_PRESSURE_MAX_LENGTH = 16;

export function serializeScaledPressure(msg: ScaledPressure): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.pressAbs, true);
  view.setFloat32(8, msg.pressDiff, true);
  view.setInt16(12, msg.temperature, true);
  view.setInt16(14, msg.temperaturePressDiff, true);

  return buffer;
}

export function deserializeScaledPressure(payload: Uint8Array): ScaledPressure {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    pressAbs: view.getFloat32(4, true),
    pressDiff: view.getFloat32(8, true),
    temperature: view.getInt16(12, true),
    temperaturePressDiff: view.getInt16(14, true),
  };
}