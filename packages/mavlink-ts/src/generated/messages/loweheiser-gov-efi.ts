/**
 * Composite EFI and Governor data from Loweheiser equipment.  This message is created by the EFI unit based on its own data and data received from a governor attached to that EFI unit.
 * Message ID: 10151
 * CRC Extra: 195
 */
export interface LoweheiserGovEfi {
  /** Generator Battery voltage. (V) */
  voltBatt: number;
  /** Generator Battery current. (A) */
  currBatt: number;
  /** Current being produced by generator. (A) */
  currGen: number;
  /** Load current being consumed by the UAV (sum of curr_gen and curr_batt) (A) */
  currRot: number;
  /** Generator fuel remaining in litres. (l) */
  fuelLevel: number;
  /** Throttle Output. (%) */
  throttle: number;
  /** Seconds this generator has run since it was rebooted. (s) */
  runtime: number;
  /** Seconds until this generator requires maintenance.  A negative value indicates maintenance is past due. (s) */
  untilMaintenance: number;
  /** The Temperature of the rectifier. (degC) */
  rectifierTemp: number;
  /** The temperature of the mechanical motor, fuel cell core or generator. (degC) */
  generatorTemp: number;
  /** EFI Supply Voltage. (V) */
  efiBatt: number;
  /** Motor RPM. (rpm) */
  efiRpm: number;
  /** Injector pulse-width in milliseconds. (ms) */
  efiPw: number;
  /** Fuel flow rate in litres/hour. */
  efiFuelFlow: number;
  /** Fuel consumed. (l) */
  efiFuelConsumed: number;
  /** Atmospheric pressure. (kPa) */
  efiBaro: number;
  /** Manifold Air Temperature. (degC) */
  efiMat: number;
  /** Cylinder Head Temperature. (degC) */
  efiClt: number;
  /** Throttle Position. (%) */
  efiTps: number;
  /** Exhaust gas temperature. (degC) */
  efiExhaustGasTemperature: number;
  /** EFI index. */
  efiIndex: number;
  /** Generator status. */
  generatorStatus: number;
  /** EFI status. */
  efiStatus: number;
}

export const LOWEHEISER_GOV_EFI_ID = 10151;
export const LOWEHEISER_GOV_EFI_CRC_EXTRA = 195;
export const LOWEHEISER_GOV_EFI_MIN_LENGTH = 85;
export const LOWEHEISER_GOV_EFI_MAX_LENGTH = 85;

export function serializeLoweheiserGovEfi(msg: LoweheiserGovEfi): Uint8Array {
  const buffer = new Uint8Array(85);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.voltBatt, true);
  view.setFloat32(4, msg.currBatt, true);
  view.setFloat32(8, msg.currGen, true);
  view.setFloat32(12, msg.currRot, true);
  view.setFloat32(16, msg.fuelLevel, true);
  view.setFloat32(20, msg.throttle, true);
  view.setUint32(24, msg.runtime, true);
  view.setInt32(28, msg.untilMaintenance, true);
  view.setFloat32(32, msg.rectifierTemp, true);
  view.setFloat32(36, msg.generatorTemp, true);
  view.setFloat32(40, msg.efiBatt, true);
  view.setFloat32(44, msg.efiRpm, true);
  view.setFloat32(48, msg.efiPw, true);
  view.setFloat32(52, msg.efiFuelFlow, true);
  view.setFloat32(56, msg.efiFuelConsumed, true);
  view.setFloat32(60, msg.efiBaro, true);
  view.setFloat32(64, msg.efiMat, true);
  view.setFloat32(68, msg.efiClt, true);
  view.setFloat32(72, msg.efiTps, true);
  view.setFloat32(76, msg.efiExhaustGasTemperature, true);
  view.setUint16(80, msg.generatorStatus, true);
  view.setUint16(82, msg.efiStatus, true);
  buffer[84] = msg.efiIndex & 0xff;

  return buffer;
}

export function deserializeLoweheiserGovEfi(payload: Uint8Array): LoweheiserGovEfi {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    voltBatt: view.getFloat32(0, true),
    currBatt: view.getFloat32(4, true),
    currGen: view.getFloat32(8, true),
    currRot: view.getFloat32(12, true),
    fuelLevel: view.getFloat32(16, true),
    throttle: view.getFloat32(20, true),
    runtime: view.getUint32(24, true),
    untilMaintenance: view.getInt32(28, true),
    rectifierTemp: view.getFloat32(32, true),
    generatorTemp: view.getFloat32(36, true),
    efiBatt: view.getFloat32(40, true),
    efiRpm: view.getFloat32(44, true),
    efiPw: view.getFloat32(48, true),
    efiFuelFlow: view.getFloat32(52, true),
    efiFuelConsumed: view.getFloat32(56, true),
    efiBaro: view.getFloat32(60, true),
    efiMat: view.getFloat32(64, true),
    efiClt: view.getFloat32(68, true),
    efiTps: view.getFloat32(72, true),
    efiExhaustGasTemperature: view.getFloat32(76, true),
    generatorStatus: view.getUint16(80, true),
    efiStatus: view.getUint16(82, true),
    efiIndex: payload[84],
  };
}