/**
 * Smart Battery information (static/infrequent update). Use for updates from: smart battery to flight stack, flight stack to GCS. Use BATTERY_STATUS for smart battery frequent updates.
 * Message ID: 370
 * CRC Extra: 98
 */
export interface SmartBatteryInfo {
  /** Battery ID */
  id: number;
  /** Function of the battery */
  batteryFunction: number;
  /** Type (chemistry) of the battery */
  type: number;
  /** Capacity when full according to manufacturer, -1: field not provided. (mAh) */
  capacityFullSpecification: number;
  /** Capacity when full (accounting for battery degradation), -1: field not provided. (mAh) */
  capacityFull: number;
  /** Charge/discharge cycle count. UINT16_MAX: field not provided. */
  cycleCount: number;
  /** Serial number in ASCII characters, 0 terminated. All 0: field not provided. */
  serialNumber: string;
  /** Static device name in ASCII characters, 0 terminated. All 0: field not provided. Encode as manufacturer name then product name separated using an underscore. */
  deviceName: string;
  /** Battery weight. 0: field not provided. (g) */
  weight: number;
  /** Minimum per-cell voltage when discharging. If not supplied set to UINT16_MAX value. (mV) */
  dischargeMinimumVoltage: number;
  /** Minimum per-cell voltage when charging. If not supplied set to UINT16_MAX value. (mV) */
  chargingMinimumVoltage: number;
  /** Minimum per-cell voltage when resting. If not supplied set to UINT16_MAX value. (mV) */
  restingMinimumVoltage: number;
  /** Maximum per-cell voltage when charged. 0: field not provided. (mV) */
  chargingMaximumVoltage: number;
  /** Number of battery cells in series. 0: field not provided. */
  cellsInSeries: number;
  /** Maximum pack discharge current. 0: field not provided. (mA) */
  dischargeMaximumCurrent: number;
  /** Maximum pack discharge burst current. 0: field not provided. (mA) */
  dischargeMaximumBurstCurrent: number;
  /** Manufacture date (DD/MM/YYYY) in ASCII characters, 0 terminated. All 0: field not provided. */
  manufactureDate: string;
}

export const SMART_BATTERY_INFO_ID = 370;
export const SMART_BATTERY_INFO_CRC_EXTRA = 98;
export const SMART_BATTERY_INFO_MIN_LENGTH = 109;
export const SMART_BATTERY_INFO_MAX_LENGTH = 109;

export function serializeSmartBatteryInfo(msg: SmartBatteryInfo): Uint8Array {
  const buffer = new Uint8Array(109);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.capacityFullSpecification, true);
  view.setInt32(4, msg.capacityFull, true);
  view.setUint32(8, msg.dischargeMaximumCurrent, true);
  view.setUint32(12, msg.dischargeMaximumBurstCurrent, true);
  view.setUint16(16, msg.cycleCount, true);
  view.setUint16(18, msg.weight, true);
  view.setUint16(20, msg.dischargeMinimumVoltage, true);
  view.setUint16(22, msg.chargingMinimumVoltage, true);
  view.setUint16(24, msg.restingMinimumVoltage, true);
  view.setUint16(26, msg.chargingMaximumVoltage, true);
  buffer[28] = msg.id & 0xff;
  buffer[29] = msg.batteryFunction & 0xff;
  buffer[30] = msg.type & 0xff;
  // String: serial_number
  const serialNumberBytes = new TextEncoder().encode(msg.serialNumber || '');
  buffer.set(serialNumberBytes.slice(0, 16), 31);
  // String: device_name
  const deviceNameBytes = new TextEncoder().encode(msg.deviceName || '');
  buffer.set(deviceNameBytes.slice(0, 50), 47);
  buffer[97] = msg.cellsInSeries & 0xff;
  // String: manufacture_date
  const manufactureDateBytes = new TextEncoder().encode(msg.manufactureDate || '');
  buffer.set(manufactureDateBytes.slice(0, 11), 98);

  return buffer;
}

export function deserializeSmartBatteryInfo(payload: Uint8Array): SmartBatteryInfo {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    capacityFullSpecification: view.getInt32(0, true),
    capacityFull: view.getInt32(4, true),
    dischargeMaximumCurrent: view.getUint32(8, true),
    dischargeMaximumBurstCurrent: view.getUint32(12, true),
    cycleCount: view.getUint16(16, true),
    weight: view.getUint16(18, true),
    dischargeMinimumVoltage: view.getUint16(20, true),
    chargingMinimumVoltage: view.getUint16(22, true),
    restingMinimumVoltage: view.getUint16(24, true),
    chargingMaximumVoltage: view.getUint16(26, true),
    id: payload[28],
    batteryFunction: payload[29],
    type: payload[30],
    serialNumber: new TextDecoder().decode(payload.slice(31, 47)).replace(/\0.*$/, ''),
    deviceName: new TextDecoder().decode(payload.slice(47, 97)).replace(/\0.*$/, ''),
    cellsInSeries: payload[97],
    manufactureDate: new TextDecoder().decode(payload.slice(98, 109)).replace(/\0.*$/, ''),
  };
}