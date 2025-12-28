/**
 * Control message for rate gimbal.
 * Message ID: 201
 * CRC Extra: 205
 */
export interface GimbalControl {
  /** System ID. */
  targetSystem: number;
  /** Component ID. */
  targetComponent: number;
  /** Demanded angular rate X. (rad/s) */
  demandedRateX: number;
  /** Demanded angular rate Y. (rad/s) */
  demandedRateY: number;
  /** Demanded angular rate Z. (rad/s) */
  demandedRateZ: number;
}

export const GIMBAL_CONTROL_ID = 201;
export const GIMBAL_CONTROL_CRC_EXTRA = 205;
export const GIMBAL_CONTROL_MIN_LENGTH = 14;
export const GIMBAL_CONTROL_MAX_LENGTH = 14;

export function serializeGimbalControl(msg: GimbalControl): Uint8Array {
  const buffer = new Uint8Array(14);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.demandedRateX, true);
  view.setFloat32(4, msg.demandedRateY, true);
  view.setFloat32(8, msg.demandedRateZ, true);
  buffer[12] = msg.targetSystem & 0xff;
  buffer[13] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeGimbalControl(payload: Uint8Array): GimbalControl {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    demandedRateX: view.getFloat32(0, true),
    demandedRateY: view.getFloat32(4, true),
    demandedRateZ: view.getFloat32(8, true),
    targetSystem: payload[12],
    targetComponent: payload[13],
  };
}