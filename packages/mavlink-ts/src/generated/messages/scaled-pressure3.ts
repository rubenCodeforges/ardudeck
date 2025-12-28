/**
 * Barometer readings for 3rd barometer
 * Message ID: 143
 * CRC Extra: 69
 */
export interface ScaledPressure3 {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** Absolute pressure (hPa) */
  pressAbs: number;
  /** Differential pressure (hPa) */
  pressDiff: number;
  /** Absolute pressure temperature (cdegC) */
  temperature: number;
  /** Differential pressure temperature (0, if not available). Report values of 0 (or 1) as 1 cdegC. (cdegC) */
  temperaturePressDiff: number;
}

export const SCALED_PRESSURE3_ID = 143;
export const SCALED_PRESSURE3_CRC_EXTRA = 69;
export const SCALED_PRESSURE3_MIN_LENGTH = 16;
export const SCALED_PRESSURE3_MAX_LENGTH = 16;

export function serializeScaledPressure3(msg: ScaledPressure3): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setFloat32(4, msg.pressAbs, true);
  view.setFloat32(8, msg.pressDiff, true);
  view.setInt16(12, msg.temperature, true);
  view.setInt16(14, msg.temperaturePressDiff, true);

  return buffer;
}

export function deserializeScaledPressure3(payload: Uint8Array): ScaledPressure3 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    pressAbs: view.getFloat32(4, true),
    pressDiff: view.getFloat32(8, true),
    temperature: view.getInt16(12, true),
    temperaturePressDiff: view.getInt16(14, true),
  };
}