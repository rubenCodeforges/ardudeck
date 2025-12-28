/**
 * Estimator status message including flags, innovation test ratios and estimated accuracies. The flags message is an integer bitmask containing information on which EKF outputs are valid. See the ESTIMATOR_STATUS_FLAGS enum definition for further information. The innovation test ratios show the magnitude of the sensor innovation divided by the innovation check threshold. Under normal operation the innovation test ratios should be below 0.5 with occasional values up to 1.0. Values greater than 1.0 should be rare under normal operation and indicate that a measurement has been rejected by the filter. The user should be notified if an innovation test ratio greater than 1.0 is recorded. Notifications for values in the range between 0.5 and 1.0 should be optional and controllable by the user.
 * Message ID: 230
 * CRC Extra: 163
 */
export interface EstimatorStatus {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Bitmap indicating which EKF outputs are valid. */
  flags: number;
  /** Velocity innovation test ratio */
  velRatio: number;
  /** Horizontal position innovation test ratio */
  posHorizRatio: number;
  /** Vertical position innovation test ratio */
  posVertRatio: number;
  /** Magnetometer innovation test ratio */
  magRatio: number;
  /** Height above terrain innovation test ratio */
  haglRatio: number;
  /** True airspeed innovation test ratio */
  tasRatio: number;
  /** Horizontal position 1-STD accuracy relative to the EKF local origin (m) */
  posHorizAccuracy: number;
  /** Vertical position 1-STD accuracy relative to the EKF local origin (m) */
  posVertAccuracy: number;
}

export const ESTIMATOR_STATUS_ID = 230;
export const ESTIMATOR_STATUS_CRC_EXTRA = 163;
export const ESTIMATOR_STATUS_MIN_LENGTH = 42;
export const ESTIMATOR_STATUS_MAX_LENGTH = 42;

export function serializeEstimatorStatus(msg: EstimatorStatus): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  view.setFloat32(8, msg.velRatio, true);
  view.setFloat32(12, msg.posHorizRatio, true);
  view.setFloat32(16, msg.posVertRatio, true);
  view.setFloat32(20, msg.magRatio, true);
  view.setFloat32(24, msg.haglRatio, true);
  view.setFloat32(28, msg.tasRatio, true);
  view.setFloat32(32, msg.posHorizAccuracy, true);
  view.setFloat32(36, msg.posVertAccuracy, true);
  view.setUint16(40, msg.flags, true);

  return buffer;
}

export function deserializeEstimatorStatus(payload: Uint8Array): EstimatorStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    velRatio: view.getFloat32(8, true),
    posHorizRatio: view.getFloat32(12, true),
    posVertRatio: view.getFloat32(16, true),
    magRatio: view.getFloat32(20, true),
    haglRatio: view.getFloat32(24, true),
    tasRatio: view.getFloat32(28, true),
    posHorizAccuracy: view.getFloat32(32, true),
    posVertAccuracy: view.getFloat32(36, true),
    flags: view.getUint16(40, true),
  };
}