/**
 * Battery pack monitoring data for Li-Ion batteries
 * Message ID: 8010
 * CRC Extra: 155
 */
export interface SensBatmon {
  /** Time since system start (us) */
  batmonTimestamp: bigint;
  /** Battery pack temperature (degC) */
  temperature: number;
  /** Battery pack voltage (mV) */
  voltage: number;
  /** Battery pack current (mA) */
  current: number;
  /** Battery pack state-of-charge */
  soc: number;
  /** Battery monitor status report bits in Hex */
  batterystatus: number;
  /** Battery monitor serial number in Hex */
  serialnumber: number;
  /** Battery monitor safetystatus report bits in Hex */
  safetystatus: number;
  /** Battery monitor operation status report bits in Hex */
  operationstatus: number;
  /** Battery pack cell 1 voltage (mV) */
  cellvoltage1: number;
  /** Battery pack cell 2 voltage (mV) */
  cellvoltage2: number;
  /** Battery pack cell 3 voltage (mV) */
  cellvoltage3: number;
  /** Battery pack cell 4 voltage (mV) */
  cellvoltage4: number;
  /** Battery pack cell 5 voltage (mV) */
  cellvoltage5: number;
  /** Battery pack cell 6 voltage (mV) */
  cellvoltage6: number;
}

export const SENS_BATMON_ID = 8010;
export const SENS_BATMON_CRC_EXTRA = 155;
export const SENS_BATMON_MIN_LENGTH = 41;
export const SENS_BATMON_MAX_LENGTH = 41;

export function serializeSensBatmon(msg: SensBatmon): Uint8Array {
  const buffer = new Uint8Array(41);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.batmonTimestamp), true);
  view.setFloat32(8, msg.temperature, true);
  view.setUint32(12, msg.safetystatus, true);
  view.setUint32(16, msg.operationstatus, true);
  view.setUint16(20, msg.voltage, true);
  view.setInt16(22, msg.current, true);
  view.setUint16(24, msg.batterystatus, true);
  view.setUint16(26, msg.serialnumber, true);
  view.setUint16(28, msg.cellvoltage1, true);
  view.setUint16(30, msg.cellvoltage2, true);
  view.setUint16(32, msg.cellvoltage3, true);
  view.setUint16(34, msg.cellvoltage4, true);
  view.setUint16(36, msg.cellvoltage5, true);
  view.setUint16(38, msg.cellvoltage6, true);
  buffer[40] = msg.soc & 0xff;

  return buffer;
}

export function deserializeSensBatmon(payload: Uint8Array): SensBatmon {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    batmonTimestamp: view.getBigUint64(0, true),
    temperature: view.getFloat32(8, true),
    safetystatus: view.getUint32(12, true),
    operationstatus: view.getUint32(16, true),
    voltage: view.getUint16(20, true),
    current: view.getInt16(22, true),
    batterystatus: view.getUint16(24, true),
    serialnumber: view.getUint16(26, true),
    cellvoltage1: view.getUint16(28, true),
    cellvoltage2: view.getUint16(30, true),
    cellvoltage3: view.getUint16(32, true),
    cellvoltage4: view.getUint16(34, true),
    cellvoltage5: view.getUint16(36, true),
    cellvoltage6: view.getUint16(38, true),
    soc: payload[40],
  };
}