/**
 * Battery information
 * Message ID: 147
 * CRC Extra: 11
 */
export interface BatteryStatus {
  /** Battery ID */
  id: number;
  /** Function of the battery */
  batteryFunction: number;
  /** Type (chemistry) of the battery */
  type: number;
  /** Temperature of the battery. INT16_MAX for unknown temperature. (cdegC) */
  temperature: number;
  /** Battery voltage of cells 1 to 10 (see voltages_ext for cells 11-14). Cells in this field above the valid cell count for this battery should have the UINT16_MAX value. If individual cell voltages are unknown or not measured for this battery, then the overall battery voltage should be filled in cell 0, with all others set to UINT16_MAX. If the voltage of the battery is greater than (UINT16_MAX - 1), then cell 0 should be set to (UINT16_MAX - 1), and cell 1 to the remaining voltage. This can be extended to multiple cells if the total voltage is greater than 2 * (UINT16_MAX - 1). (mV) */
  voltages: number[];
  /** Battery current, -1: autopilot does not measure the current (cA) */
  currentBattery: number;
  /** Consumed charge, -1: autopilot does not provide consumption estimate (mAh) */
  currentConsumed: number;
  /** Consumed energy, -1: autopilot does not provide energy consumption estimate (hJ) */
  energyConsumed: number;
  /** Remaining battery energy. Values: [0-100], -1: autopilot does not estimate the remaining battery. (%) */
  batteryRemaining: number;
  /** Remaining battery time, 0: autopilot does not provide remaining battery time estimate (s) */
  timeRemaining: number;
  /** State for extent of discharge, provided by autopilot for warning or external reactions */
  chargeState: number;
  /** Battery voltages for cells 11 to 14. Cells above the valid cell count for this battery should have a value of 0, where zero indicates not supported (note, this is different than for the voltages field and allows empty byte truncation). If the measured value is 0 then 1 should be sent instead. (mV) */
  voltagesExt: number[];
  /** Battery mode. Default (0) is that battery mode reporting is not supported or battery is in normal-use mode. */
  mode: number;
  /** Fault/health indications. These should be set when charge_state is MAV_BATTERY_CHARGE_STATE_FAILED or MAV_BATTERY_CHARGE_STATE_UNHEALTHY (if not, fault reporting is not supported). */
  faultBitmask: number;
}

export const BATTERY_STATUS_ID = 147;
export const BATTERY_STATUS_CRC_EXTRA = 11;
export const BATTERY_STATUS_MIN_LENGTH = 54;
export const BATTERY_STATUS_MAX_LENGTH = 54;

export function serializeBatteryStatus(msg: BatteryStatus): Uint8Array {
  const buffer = new Uint8Array(54);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.currentConsumed, true);
  view.setInt32(4, msg.energyConsumed, true);
  view.setInt32(8, msg.timeRemaining, true);
  view.setUint32(12, msg.faultBitmask, true);
  view.setInt16(16, msg.temperature, true);
  // Array: voltages
  for (let i = 0; i < 10; i++) {
    view.setUint16(18 + i * 2, msg.voltages[i] ?? 0, true);
  }
  view.setInt16(38, msg.currentBattery, true);
  // Array: voltages_ext
  for (let i = 0; i < 4; i++) {
    view.setUint16(40 + i * 2, msg.voltagesExt[i] ?? 0, true);
  }
  buffer[48] = msg.id & 0xff;
  buffer[49] = msg.batteryFunction & 0xff;
  buffer[50] = msg.type & 0xff;
  view.setInt8(51, msg.batteryRemaining);
  buffer[52] = msg.chargeState & 0xff;
  buffer[53] = msg.mode & 0xff;

  return buffer;
}

export function deserializeBatteryStatus(payload: Uint8Array): BatteryStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    currentConsumed: view.getInt32(0, true),
    energyConsumed: view.getInt32(4, true),
    timeRemaining: view.getInt32(8, true),
    faultBitmask: view.getUint32(12, true),
    temperature: view.getInt16(16, true),
    voltages: Array.from({ length: 10 }, (_, i) => view.getUint16(18 + i * 2, true)),
    currentBattery: view.getInt16(38, true),
    voltagesExt: Array.from({ length: 4 }, (_, i) => view.getUint16(40 + i * 2, true)),
    id: payload[48],
    batteryFunction: payload[49],
    type: payload[50],
    batteryRemaining: view.getInt8(51),
    chargeState: payload[52],
    mode: payload[53],
  };
}