/**
 * Fixed-wing soaring (i.e. thermal seeking) data
 * Message ID: 8011
 * CRC Extra: 20
 */
export interface FwSoaringData {
  /** Timestamp (ms) */
  timestamp: bigint;
  /** Timestamp since last mode change (ms) */
  timestampmodechanged: bigint;
  /** Thermal core updraft strength (m/s) */
  xw: number;
  /** Thermal radius (m) */
  xr: number;
  /** Thermal center latitude (deg) */
  xlat: number;
  /** Thermal center longitude (deg) */
  xlon: number;
  /** Variance W */
  varw: number;
  /** Variance R */
  varr: number;
  /** Variance Lat */
  varlat: number;
  /** Variance Lon */
  varlon: number;
  /** Suggested loiter radius (m) */
  loiterradius: number;
  /** Suggested loiter direction */
  loiterdirection: number;
  /** Distance to soar point (m) */
  disttosoarpoint: number;
  /** Expected sink rate at current airspeed, roll and throttle (m/s) */
  vsinkexp: number;
  /** Measurement / updraft speed at current/local airplane position (m/s) */
  z1Localupdraftspeed: number;
  /** Measurement / roll angle tracking error (deg) */
  z2Deltaroll: number;
  /** Expected measurement 1 */
  z1Exp: number;
  /** Expected measurement 2 */
  z2Exp: number;
  /** Thermal drift (from estimator prediction step only) (m/s) */
  thermalgsnorth: number;
  /** Thermal drift (from estimator prediction step only) (m/s) */
  thermalgseast: number;
  /** Total specific energy change (filtered) (m/s) */
  tseDot: number;
  /** Debug variable 1 */
  debugvar1: number;
  /** Debug variable 2 */
  debugvar2: number;
  /** Control Mode [-] */
  controlmode: number;
  /** Data valid [-] */
  valid: number;
}

export const FW_SOARING_DATA_ID = 8011;
export const FW_SOARING_DATA_CRC_EXTRA = 20;
export const FW_SOARING_DATA_MIN_LENGTH = 102;
export const FW_SOARING_DATA_MAX_LENGTH = 102;

export function serializeFwSoaringData(msg: FwSoaringData): Uint8Array {
  const buffer = new Uint8Array(102);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timestamp), true);
  view.setBigUint64(8, BigInt(msg.timestampmodechanged), true);
  view.setFloat32(16, msg.xw, true);
  view.setFloat32(20, msg.xr, true);
  view.setFloat32(24, msg.xlat, true);
  view.setFloat32(28, msg.xlon, true);
  view.setFloat32(32, msg.varw, true);
  view.setFloat32(36, msg.varr, true);
  view.setFloat32(40, msg.varlat, true);
  view.setFloat32(44, msg.varlon, true);
  view.setFloat32(48, msg.loiterradius, true);
  view.setFloat32(52, msg.loiterdirection, true);
  view.setFloat32(56, msg.disttosoarpoint, true);
  view.setFloat32(60, msg.vsinkexp, true);
  view.setFloat32(64, msg.z1Localupdraftspeed, true);
  view.setFloat32(68, msg.z2Deltaroll, true);
  view.setFloat32(72, msg.z1Exp, true);
  view.setFloat32(76, msg.z2Exp, true);
  view.setFloat32(80, msg.thermalgsnorth, true);
  view.setFloat32(84, msg.thermalgseast, true);
  view.setFloat32(88, msg.tseDot, true);
  view.setFloat32(92, msg.debugvar1, true);
  view.setFloat32(96, msg.debugvar2, true);
  buffer[100] = msg.controlmode & 0xff;
  buffer[101] = msg.valid & 0xff;

  return buffer;
}

export function deserializeFwSoaringData(payload: Uint8Array): FwSoaringData {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timestamp: view.getBigUint64(0, true),
    timestampmodechanged: view.getBigUint64(8, true),
    xw: view.getFloat32(16, true),
    xr: view.getFloat32(20, true),
    xlat: view.getFloat32(24, true),
    xlon: view.getFloat32(28, true),
    varw: view.getFloat32(32, true),
    varr: view.getFloat32(36, true),
    varlat: view.getFloat32(40, true),
    varlon: view.getFloat32(44, true),
    loiterradius: view.getFloat32(48, true),
    loiterdirection: view.getFloat32(52, true),
    disttosoarpoint: view.getFloat32(56, true),
    vsinkexp: view.getFloat32(60, true),
    z1Localupdraftspeed: view.getFloat32(64, true),
    z2Deltaroll: view.getFloat32(68, true),
    z1Exp: view.getFloat32(72, true),
    z2Exp: view.getFloat32(76, true),
    thermalgsnorth: view.getFloat32(80, true),
    thermalgseast: view.getFloat32(84, true),
    tseDot: view.getFloat32(88, true),
    debugvar1: view.getFloat32(92, true),
    debugvar2: view.getFloat32(96, true),
    controlmode: payload[100],
    valid: payload[101],
  };
}