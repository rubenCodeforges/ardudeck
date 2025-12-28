/**
 * EFI status output
 * Message ID: 225
 * CRC Extra: 10
 */
export interface EfiStatus {
  /** EFI health status */
  health: number;
  /** ECU index */
  ecuIndex: number;
  /** RPM */
  rpm: number;
  /** Fuel consumed (cm^3) */
  fuelConsumed: number;
  /** Fuel flow rate (cm^3/min) */
  fuelFlow: number;
  /** Engine load (%) */
  engineLoad: number;
  /** Throttle position (%) */
  throttlePosition: number;
  /** Spark dwell time (ms) */
  sparkDwellTime: number;
  /** Barometric pressure (kPa) */
  barometricPressure: number;
  /** Intake manifold pressure( (kPa) */
  intakeManifoldPressure: number;
  /** Intake manifold temperature (degC) */
  intakeManifoldTemperature: number;
  /** Cylinder head temperature (degC) */
  cylinderHeadTemperature: number;
  /** Ignition timing (Crank angle degrees) (deg) */
  ignitionTiming: number;
  /** Injection time (ms) */
  injectionTime: number;
  /** Exhaust gas temperature (degC) */
  exhaustGasTemperature: number;
  /** Output throttle (%) */
  throttleOut: number;
  /** Pressure/temperature compensation */
  ptCompensation: number;
  /** Supply voltage to EFI sparking system.  Zero in this value means "unknown", so if the supply voltage really is zero volts use 0.0001 instead. (V) */
  ignitionVoltage: number;
  /** Fuel pressure. Zero in this value means "unknown", so if the fuel pressure really is zero kPa use 0.0001 instead. (kPa) */
  fuelPressure: number;
}

export const EFI_STATUS_ID = 225;
export const EFI_STATUS_CRC_EXTRA = 10;
export const EFI_STATUS_MIN_LENGTH = 73;
export const EFI_STATUS_MAX_LENGTH = 73;

export function serializeEfiStatus(msg: EfiStatus): Uint8Array {
  const buffer = new Uint8Array(73);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.ecuIndex, true);
  view.setFloat32(4, msg.rpm, true);
  view.setFloat32(8, msg.fuelConsumed, true);
  view.setFloat32(12, msg.fuelFlow, true);
  view.setFloat32(16, msg.engineLoad, true);
  view.setFloat32(20, msg.throttlePosition, true);
  view.setFloat32(24, msg.sparkDwellTime, true);
  view.setFloat32(28, msg.barometricPressure, true);
  view.setFloat32(32, msg.intakeManifoldPressure, true);
  view.setFloat32(36, msg.intakeManifoldTemperature, true);
  view.setFloat32(40, msg.cylinderHeadTemperature, true);
  view.setFloat32(44, msg.ignitionTiming, true);
  view.setFloat32(48, msg.injectionTime, true);
  view.setFloat32(52, msg.exhaustGasTemperature, true);
  view.setFloat32(56, msg.throttleOut, true);
  view.setFloat32(60, msg.ptCompensation, true);
  view.setFloat32(64, msg.ignitionVoltage, true);
  view.setFloat32(68, msg.fuelPressure, true);
  buffer[72] = msg.health & 0xff;

  return buffer;
}

export function deserializeEfiStatus(payload: Uint8Array): EfiStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    ecuIndex: view.getFloat32(0, true),
    rpm: view.getFloat32(4, true),
    fuelConsumed: view.getFloat32(8, true),
    fuelFlow: view.getFloat32(12, true),
    engineLoad: view.getFloat32(16, true),
    throttlePosition: view.getFloat32(20, true),
    sparkDwellTime: view.getFloat32(24, true),
    barometricPressure: view.getFloat32(28, true),
    intakeManifoldPressure: view.getFloat32(32, true),
    intakeManifoldTemperature: view.getFloat32(36, true),
    cylinderHeadTemperature: view.getFloat32(40, true),
    ignitionTiming: view.getFloat32(44, true),
    injectionTime: view.getFloat32(48, true),
    exhaustGasTemperature: view.getFloat32(52, true),
    throttleOut: view.getFloat32(56, true),
    ptCompensation: view.getFloat32(60, true),
    ignitionVoltage: view.getFloat32(64, true),
    fuelPressure: view.getFloat32(68, true),
    health: payload[72],
  };
}