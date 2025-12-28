/**
 * 3 axis gimbal measurements.
 * Message ID: 200
 * CRC Extra: 134
 */
export interface GimbalReport {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Time since last update. (s) */
  deltaTime: number;
  /** Delta angle X. (rad) */
  deltaAngleX: number;
  /** Delta angle Y. (rad) */
  deltaAngleY: number;
  /** Delta angle X. (rad) */
  deltaAngleZ: number;
  /** Delta velocity X. (m/s) */
  deltaVelocityX: number;
  /** Delta velocity Y. (m/s) */
  deltaVelocityY: number;
  /** Delta velocity Z. (m/s) */
  deltaVelocityZ: number;
  /** Joint ROLL. (rad) */
  jointRoll: number;
  /** Joint EL. (rad) */
  jointEl: number;
  /** Joint AZ. (rad) */
  jointAz: number;
}

export const GIMBAL_REPORT_ID = 200;
export const GIMBAL_REPORT_CRC_EXTRA = 134;
export const GIMBAL_REPORT_MIN_LENGTH = 42;
export const GIMBAL_REPORT_MAX_LENGTH = 42;

export function serializeGimbalReport(msg: GimbalReport): Uint8Array {
  const buffer = new Uint8Array(42);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.deltaTime, true);
  view.setFloat32(4, msg.deltaAngleX, true);
  view.setFloat32(8, msg.deltaAngleY, true);
  view.setFloat32(12, msg.deltaAngleZ, true);
  view.setFloat32(16, msg.deltaVelocityX, true);
  view.setFloat32(20, msg.deltaVelocityY, true);
  view.setFloat32(24, msg.deltaVelocityZ, true);
  view.setFloat32(28, msg.jointRoll, true);
  view.setFloat32(32, msg.jointEl, true);
  view.setFloat32(36, msg.jointAz, true);
  buffer[40] = msg.targetSystem & 0xff;
  buffer[41] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeGimbalReport(payload: Uint8Array): GimbalReport {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    deltaTime: view.getFloat32(0, true),
    deltaAngleX: view.getFloat32(4, true),
    deltaAngleY: view.getFloat32(8, true),
    deltaAngleZ: view.getFloat32(12, true),
    deltaVelocityX: view.getFloat32(16, true),
    deltaVelocityY: view.getFloat32(20, true),
    deltaVelocityZ: view.getFloat32(24, true),
    jointRoll: view.getFloat32(28, true),
    jointEl: view.getFloat32(32, true),
    jointAz: view.getFloat32(36, true),
    targetSystem: payload[40],
    targetComponent: payload[41],
  };
}