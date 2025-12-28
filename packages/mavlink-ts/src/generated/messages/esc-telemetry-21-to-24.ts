/**
 * ESC Telemetry Data for ESCs 21 to 24, matching data sent by BLHeli ESCs.
 * Message ID: 11042
 * CRC Extra: 201
 */
export interface EscTelemetry21To24 {
  /** Temperature. (degC) */
  temperature: number[];
  /** Voltage. (cV) */
  voltage: number[];
  /** Current. (cA) */
  current: number[];
  /** Total current. (mAh) */
  totalcurrent: number[];
  /** RPM (eRPM). (rpm) */
  rpm: number[];
  /** count of telemetry packets received (wraps at 65535). */
  count: number[];
}

export const ESC_TELEMETRY_21_TO_24_ID = 11042;
export const ESC_TELEMETRY_21_TO_24_CRC_EXTRA = 201;
export const ESC_TELEMETRY_21_TO_24_MIN_LENGTH = 44;
export const ESC_TELEMETRY_21_TO_24_MAX_LENGTH = 44;

export function serializeEscTelemetry21To24(msg: EscTelemetry21To24): Uint8Array {
  const buffer = new Uint8Array(44);
  const view = new DataView(buffer.buffer);

  // Array: voltage
  for (let i = 0; i < 4; i++) {
    view.setUint16(0 + i * 2, msg.voltage[i] ?? 0, true);
  }
  // Array: current
  for (let i = 0; i < 4; i++) {
    view.setUint16(8 + i * 2, msg.current[i] ?? 0, true);
  }
  // Array: totalcurrent
  for (let i = 0; i < 4; i++) {
    view.setUint16(16 + i * 2, msg.totalcurrent[i] ?? 0, true);
  }
  // Array: rpm
  for (let i = 0; i < 4; i++) {
    view.setUint16(24 + i * 2, msg.rpm[i] ?? 0, true);
  }
  // Array: count
  for (let i = 0; i < 4; i++) {
    view.setUint16(32 + i * 2, msg.count[i] ?? 0, true);
  }
  // Array: temperature
  for (let i = 0; i < 4; i++) {
    buffer[40 + i * 1] = msg.temperature[i] ?? 0 & 0xff;
  }

  return buffer;
}

export function deserializeEscTelemetry21To24(payload: Uint8Array): EscTelemetry21To24 {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    voltage: Array.from({ length: 4 }, (_, i) => view.getUint16(0 + i * 2, true)),
    current: Array.from({ length: 4 }, (_, i) => view.getUint16(8 + i * 2, true)),
    totalcurrent: Array.from({ length: 4 }, (_, i) => view.getUint16(16 + i * 2, true)),
    rpm: Array.from({ length: 4 }, (_, i) => view.getUint16(24 + i * 2, true)),
    count: Array.from({ length: 4 }, (_, i) => view.getUint16(32 + i * 2, true)),
    temperature: Array.from({ length: 4 }, (_, i) => payload[40 + i * 1]),
  };
}