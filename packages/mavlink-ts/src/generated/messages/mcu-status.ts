/**
 * The MCU status, giving MCU temperature and voltage. The min and max voltages are to allow for detecting power supply instability.
 * Message ID: 11039
 * CRC Extra: 142
 */
export interface McuStatus {
  /** MCU instance */
  id: number;
  /** MCU Internal temperature (cdegC) */
  mcuTemperature: number;
  /** MCU voltage (mV) */
  mcuVoltage: number;
  /** MCU voltage minimum (mV) */
  mcuVoltageMin: number;
  /** MCU voltage maximum (mV) */
  mcuVoltageMax: number;
}

export const MCU_STATUS_ID = 11039;
export const MCU_STATUS_CRC_EXTRA = 142;
export const MCU_STATUS_MIN_LENGTH = 9;
export const MCU_STATUS_MAX_LENGTH = 9;

export function serializeMcuStatus(msg: McuStatus): Uint8Array {
  const buffer = new Uint8Array(9);
  const view = new DataView(buffer.buffer);

  view.setInt16(0, msg.mcuTemperature, true);
  view.setUint16(2, msg.mcuVoltage, true);
  view.setUint16(4, msg.mcuVoltageMin, true);
  view.setUint16(6, msg.mcuVoltageMax, true);
  buffer[8] = msg.id & 0xff;

  return buffer;
}

export function deserializeMcuStatus(payload: Uint8Array): McuStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    mcuTemperature: view.getInt16(0, true),
    mcuVoltage: view.getUint16(2, true),
    mcuVoltageMin: view.getUint16(4, true),
    mcuVoltageMax: view.getUint16(6, true),
    id: payload[8],
  };
}