/**
 * Message reporting the current status of a gimbal manager. This message should be broadcast at a low regular rate (e.g. 1 Hz, may be increase momentarily to e.g. 5 Hz for a period of 1 sec after a change).
 * Message ID: 60011
 * CRC Extra: 183
 */
export interface Storm32GimbalManagerStatus {
  /** Gimbal ID (component ID or 1-6 for non-MAVLink gimbal) that this gimbal manager is responsible for. */
  gimbalId: number;
  /** Client who is currently supervisor (0 = none). */
  supervisor: number;
  /** Gimbal device flags currently applied. Same flags as reported by GIMBAL_DEVICE_ATTITUDE_STATUS. */
  deviceFlags: number;
  /** Gimbal manager flags currently applied. */
  managerFlags: number;
  /** Profile currently applied (0 = default). */
  profile: number;
}

export const STORM32_GIMBAL_MANAGER_STATUS_ID = 60011;
export const STORM32_GIMBAL_MANAGER_STATUS_CRC_EXTRA = 183;
export const STORM32_GIMBAL_MANAGER_STATUS_MIN_LENGTH = 7;
export const STORM32_GIMBAL_MANAGER_STATUS_MAX_LENGTH = 7;

export function serializeStorm32GimbalManagerStatus(msg: Storm32GimbalManagerStatus): Uint8Array {
  const buffer = new Uint8Array(7);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.deviceFlags, true);
  view.setUint16(2, msg.managerFlags, true);
  buffer[4] = msg.gimbalId & 0xff;
  buffer[5] = msg.supervisor & 0xff;
  buffer[6] = msg.profile & 0xff;

  return buffer;
}

export function deserializeStorm32GimbalManagerStatus(payload: Uint8Array): Storm32GimbalManagerStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    deviceFlags: view.getUint16(0, true),
    managerFlags: view.getUint16(2, true),
    gimbalId: payload[4],
    supervisor: payload[5],
    profile: payload[6],
  };
}