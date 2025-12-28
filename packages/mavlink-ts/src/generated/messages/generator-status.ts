/**
 * Telemetry of power generation system. Alternator or mechanical generator.
 * Message ID: 373
 * CRC Extra: 117
 */
export interface GeneratorStatus {
  /** Status flags. */
  status: bigint;
  /** Speed of electrical generator or alternator. UINT16_MAX: field not provided. (rpm) */
  generatorSpeed: number;
  /** Current into/out of battery. Positive for out. Negative for in. NaN: field not provided. (A) */
  batteryCurrent: number;
  /** Current going to the UAV. If battery current not available this is the DC current from the generator. Positive for out. Negative for in. NaN: field not provided (A) */
  loadCurrent: number;
  /** The power being generated. NaN: field not provided (W) */
  powerGenerated: number;
  /** Voltage of the bus seen at the generator, or battery bus if battery bus is controlled by generator and at a different voltage to main bus. (V) */
  busVoltage: number;
  /** The temperature of the rectifier or power converter. INT16_MAX: field not provided. (degC) */
  rectifierTemperature: number;
  /** The target battery current. Positive for out. Negative for in. NaN: field not provided (A) */
  batCurrentSetpoint: number;
  /** The temperature of the mechanical motor, fuel cell core or generator. INT16_MAX: field not provided. (degC) */
  generatorTemperature: number;
  /** Seconds this generator has run since it was rebooted. UINT32_MAX: field not provided. (s) */
  runtime: number;
  /** Seconds until this generator requires maintenance.  A negative value indicates maintenance is past-due. INT32_MAX: field not provided. (s) */
  timeUntilMaintenance: number;
}

export const GENERATOR_STATUS_ID = 373;
export const GENERATOR_STATUS_CRC_EXTRA = 117;
export const GENERATOR_STATUS_MIN_LENGTH = 42;
export const GENERATOR_STATUS_MAX_LENGTH = 42;

export function serializeGeneratorStatus(msg: GeneratorStatus): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.status), true);
  view.setFloat32(8, msg.batteryCurrent, true);
  view.setFloat32(12, msg.loadCurrent, true);
  view.setFloat32(16, msg.powerGenerated, true);
  view.setFloat32(20, msg.busVoltage, true);
  view.setFloat32(24, msg.batCurrentSetpoint, true);
  view.setUint32(28, msg.runtime, true);
  view.setInt32(32, msg.timeUntilMaintenance, true);
  view.setUint16(36, msg.generatorSpeed, true);
  view.setInt16(38, msg.rectifierTemperature, true);
  view.setInt16(40, msg.generatorTemperature, true);

  return buffer;
}

export function deserializeGeneratorStatus(payload: Uint8Array): GeneratorStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    status: view.getBigUint64(0, true),
    batteryCurrent: view.getFloat32(8, true),
    loadCurrent: view.getFloat32(12, true),
    powerGenerated: view.getFloat32(16, true),
    busVoltage: view.getFloat32(20, true),
    batCurrentSetpoint: view.getFloat32(24, true),
    runtime: view.getUint32(28, true),
    timeUntilMaintenance: view.getInt32(32, true),
    generatorSpeed: view.getUint16(36, true),
    rectifierTemperature: view.getInt16(38, true),
    generatorTemperature: view.getInt16(40, true),
  };
}