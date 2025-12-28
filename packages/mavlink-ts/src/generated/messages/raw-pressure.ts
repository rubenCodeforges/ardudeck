/**
 * The RAW pressure readings for the typical setup of one absolute pressure and one differential pressure sensor. The sensor values should be the raw, UNSCALED ADC values.
 * Message ID: 28
 * CRC Extra: 67
 */
export interface RawPressure {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Absolute pressure (raw) */
  pressAbs: number;
  /** Differential pressure 1 (raw, 0 if nonexistent) */
  pressDiff1: number;
  /** Differential pressure 2 (raw, 0 if nonexistent) */
  pressDiff2: number;
  /** Raw Temperature measurement (raw) */
  temperature: number;
}

export const RAW_PRESSURE_ID = 28;
export const RAW_PRESSURE_CRC_EXTRA = 67;
export const RAW_PRESSURE_MIN_LENGTH = 16;
export const RAW_PRESSURE_MAX_LENGTH = 16;

export function serializeRawPressure(msg: RawPressure): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setInt16(8, msg.pressAbs, true);
  view.setInt16(10, msg.pressDiff1, true);
  view.setInt16(12, msg.pressDiff2, true);
  view.setInt16(14, msg.temperature, true);

  return buffer;
}

export function deserializeRawPressure(payload: Uint8Array): RawPressure {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    pressAbs: view.getInt16(8, true),
    pressDiff1: view.getInt16(10, true),
    pressDiff2: view.getInt16(12, true),
    temperature: view.getInt16(14, true),
  };
}