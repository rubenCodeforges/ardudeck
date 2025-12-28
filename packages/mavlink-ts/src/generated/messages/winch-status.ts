/**
 * Winch status.
 * Message ID: 9005
 * CRC Extra: 117
 */
export interface WinchStatus {
  /** Timestamp (synced to UNIX time or since system boot). (us) */
  timeUsec: bigint;
  /** Length of line released. NaN if unknown (m) */
  lineLength: number;
  /** Speed line is being released or retracted. Positive values if being released, negative values if being retracted, NaN if unknown (m/s) */
  speed: number;
  /** Tension on the line. NaN if unknown (kg) */
  tension: number;
  /** Voltage of the battery supplying the winch. NaN if unknown (V) */
  voltage: number;
  /** Current draw from the winch. NaN if unknown (A) */
  current: number;
  /** Temperature of the motor. INT16_MAX if unknown (degC) */
  temperature: number;
  /** Status flags */
  status: number;
}

export const WINCH_STATUS_ID = 9005;
export const WINCH_STATUS_CRC_EXTRA = 117;
export const WINCH_STATUS_MIN_LENGTH = 34;
export const WINCH_STATUS_MAX_LENGTH = 34;

export function serializeWinchStatus(msg: WinchStatus): Uint8Array {
  const buffer = new Uint8Array(34);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.lineLength, true);
  view.setFloat32(12, msg.speed, true);
  view.setFloat32(16, msg.tension, true);
  view.setFloat32(20, msg.voltage, true);
  view.setFloat32(24, msg.current, true);
  view.setUint32(28, msg.status, true);
  view.setInt16(32, msg.temperature, true);

  return buffer;
}

export function deserializeWinchStatus(payload: Uint8Array): WinchStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    lineLength: view.getFloat32(8, true),
    speed: view.getFloat32(12, true),
    tension: view.getFloat32(16, true),
    voltage: view.getFloat32(20, true),
    current: view.getFloat32(24, true),
    status: view.getUint32(28, true),
    temperature: view.getInt16(32, true),
  };
}