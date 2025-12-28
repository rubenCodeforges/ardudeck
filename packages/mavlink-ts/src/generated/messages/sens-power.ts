/**
 * Voltage and current sensor data
 * Message ID: 8002
 * CRC Extra: 218
 */
export interface SensPower {
  /** Power board voltage sensor reading (V) */
  adc121VspbVolt: number;
  /** Power board current sensor reading (A) */
  adc121CspbAmp: number;
  /** Board current sensor 1 reading (A) */
  adc121Cs1Amp: number;
  /** Board current sensor 2 reading (A) */
  adc121Cs2Amp: number;
}

export const SENS_POWER_ID = 8002;
export const SENS_POWER_CRC_EXTRA = 218;
export const SENS_POWER_MIN_LENGTH = 16;
export const SENS_POWER_MAX_LENGTH = 16;

export function serializeSensPower(msg: SensPower): Uint8Array {
  const buffer = new Uint8Array(16);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.adc121VspbVolt, true);
  view.setFloat32(4, msg.adc121CspbAmp, true);
  view.setFloat32(8, msg.adc121Cs1Amp, true);
  view.setFloat32(12, msg.adc121Cs2Amp, true);

  return buffer;
}

export function deserializeSensPower(payload: Uint8Array): SensPower {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    adc121VspbVolt: view.getFloat32(0, true),
    adc121CspbAmp: view.getFloat32(4, true),
    adc121Cs1Amp: view.getFloat32(8, true),
    adc121Cs2Amp: view.getFloat32(12, true),
  };
}