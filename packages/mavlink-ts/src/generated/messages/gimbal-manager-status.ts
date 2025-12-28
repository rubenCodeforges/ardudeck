/**
 * Current status about a high level gimbal manager. This message should be broadcast at a low regular rate (e.g. 5Hz).
 * Message ID: 281
 * CRC Extra: 48
 */
export interface GimbalManagerStatus {
  /** Timestamp (time since system boot). (ms) */
  timeBootMs: number;
  /** High level gimbal manager flags currently applied. */
  flags: number;
  /** Gimbal device ID that this gimbal manager is responsible for. Component ID of gimbal device (or 1-6 for non-MAVLink gimbal). */
  gimbalDeviceId: number;
  /** System ID of MAVLink component with primary control, 0 for none. */
  primaryControlSysid: number;
  /** Component ID of MAVLink component with primary control, 0 for none. */
  primaryControlCompid: number;
  /** System ID of MAVLink component with secondary control, 0 for none. */
  secondaryControlSysid: number;
  /** Component ID of MAVLink component with secondary control, 0 for none. */
  secondaryControlCompid: number;
}

export const GIMBAL_MANAGER_STATUS_ID = 281;
export const GIMBAL_MANAGER_STATUS_CRC_EXTRA = 48;
export const GIMBAL_MANAGER_STATUS_MIN_LENGTH = 13;
export const GIMBAL_MANAGER_STATUS_MAX_LENGTH = 13;

export function serializeGimbalManagerStatus(msg: GimbalManagerStatus): Uint8Array {
  const buffer = new Uint8Array(13);
  const view = new DataView(buffer.buffer);

  view.setUint32(0, msg.timeBootMs, true);
  view.setUint32(4, msg.flags, true);
  buffer[8] = msg.gimbalDeviceId & 0xff;
  buffer[9] = msg.primaryControlSysid & 0xff;
  buffer[10] = msg.primaryControlCompid & 0xff;
  buffer[11] = msg.secondaryControlSysid & 0xff;
  buffer[12] = msg.secondaryControlCompid & 0xff;

  return buffer;
}

export function deserializeGimbalManagerStatus(payload: Uint8Array): GimbalManagerStatus {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootMs: view.getUint32(0, true),
    flags: view.getUint32(4, true),
    gimbalDeviceId: payload[8],
    primaryControlSysid: payload[9],
    primaryControlCompid: payload[10],
    secondaryControlSysid: payload[11],
    secondaryControlCompid: payload[12],
  };
}