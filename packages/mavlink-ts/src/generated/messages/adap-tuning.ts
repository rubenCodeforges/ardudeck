/**
 * Adaptive Controller tuning information.
 * Message ID: 11010
 * CRC Extra: 46
 */
export interface AdapTuning {
  /** Axis. */
  axis: number;
  /** Desired rate. (deg/s) */
  desired: number;
  /** Achieved rate. (deg/s) */
  achieved: number;
  /** Error between model and vehicle. */
  error: number;
  /** Theta estimated state predictor. */
  theta: number;
  /** Omega estimated state predictor. */
  omega: number;
  /** Sigma estimated state predictor. */
  sigma: number;
  /** Theta derivative. */
  thetaDot: number;
  /** Omega derivative. */
  omegaDot: number;
  /** Sigma derivative. */
  sigmaDot: number;
  /** Projection operator value. */
  f: number;
  /** Projection operator derivative. */
  fDot: number;
  /** u adaptive controlled output command. */
  u: number;
}

export const ADAP_TUNING_ID = 11010;
export const ADAP_TUNING_CRC_EXTRA = 46;
export const ADAP_TUNING_MIN_LENGTH = 49;
export const ADAP_TUNING_MAX_LENGTH = 49;

export function serializeAdapTuning(msg: AdapTuning): Uint8Array {
  const buffer = new Uint8Array(49);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.desired, true);
  view.setFloat32(4, msg.achieved, true);
  view.setFloat32(8, msg.error, true);
  view.setFloat32(12, msg.theta, true);
  view.setFloat32(16, msg.omega, true);
  view.setFloat32(20, msg.sigma, true);
  view.setFloat32(24, msg.thetaDot, true);
  view.setFloat32(28, msg.omegaDot, true);
  view.setFloat32(32, msg.sigmaDot, true);
  view.setFloat32(36, msg.f, true);
  view.setFloat32(40, msg.fDot, true);
  view.setFloat32(44, msg.u, true);
  buffer[48] = msg.axis & 0xff;

  return buffer;
}

export function deserializeAdapTuning(payload: Uint8Array): AdapTuning {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    desired: view.getFloat32(0, true),
    achieved: view.getFloat32(4, true),
    error: view.getFloat32(8, true),
    theta: view.getFloat32(12, true),
    omega: view.getFloat32(16, true),
    sigma: view.getFloat32(20, true),
    thetaDot: view.getFloat32(24, true),
    omegaDot: view.getFloat32(28, true),
    sigmaDot: view.getFloat32(32, true),
    f: view.getFloat32(36, true),
    fDot: view.getFloat32(40, true),
    u: view.getFloat32(44, true),
    axis: payload[48],
  };
}