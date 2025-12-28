/**
 * Low level message containing autopilot state relevant for a gimbal device. This message is to be sent from the autopilot to the gimbal device component. The data of this message are for the gimbal device's estimator corrections, in particular horizon compensation, as well as indicates autopilot control intentions, e.g. feed forward angular control in the z-axis.
 * Message ID: 286
 * CRC Extra: 31
 */
export interface AutopilotStateForGimbalDevice {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Timestamp (time since system boot). (us) */
  timeBootUs: bigint;
  /** Quaternion components of autopilot attitude: w, x, y, z (1 0 0 0 is the null-rotation, Hamilton convention). */
  q: number[];
  /** Estimated delay of the attitude data. 0 if unknown. (us) */
  qEstimatedDelayUs: number;
  /** X Speed in NED (North, East, Down). NAN if unknown. (m/s) */
  vx: number;
  /** Y Speed in NED (North, East, Down). NAN if unknown. (m/s) */
  vy: number;
  /** Z Speed in NED (North, East, Down). NAN if unknown. (m/s) */
  vz: number;
  /** Estimated delay of the speed data. 0 if unknown. (us) */
  vEstimatedDelayUs: number;
  /** Feed forward Z component of angular velocity (positive: yawing to the right). NaN to be ignored. This is to indicate if the autopilot is actively yawing. (rad/s) */
  feedForwardAngularVelocityZ: number;
  /** Bitmap indicating which estimator outputs are valid. */
  estimatorStatus: number;
  /** The landed state. Is set to MAV_LANDED_STATE_UNDEFINED if landed state is unknown. */
  landedState: number;
  /** Z component of angular velocity in NED (North, East, Down). NaN if unknown. (rad/s) */
  angularVelocityZ: number;
}

export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_ID = 286;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_CRC_EXTRA = 31;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_MIN_LENGTH = 57;
export const AUTOPILOT_STATE_FOR_GIMBAL_DEVICE_MAX_LENGTH = 57;

export function serializeAutopilotStateForGimbalDevice(msg: AutopilotStateForGimbalDevice): Uint8Array {
  const buffer = new Uint8Array(57);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeBootUs), true);
  // Array: q
  for (let i = 0; i < 4; i++) {
    view.setFloat32(8 + i * 4, msg.q[i] ?? 0, true);
  }
  view.setUint32(24, msg.qEstimatedDelayUs, true);
  view.setFloat32(28, msg.vx, true);
  view.setFloat32(32, msg.vy, true);
  view.setFloat32(36, msg.vz, true);
  view.setUint32(40, msg.vEstimatedDelayUs, true);
  view.setFloat32(44, msg.feedForwardAngularVelocityZ, true);
  view.setFloat32(48, msg.angularVelocityZ, true);
  view.setUint16(52, msg.estimatorStatus, true);
  buffer[54] = msg.targetSystem & 0xff;
  buffer[55] = msg.targetComponent & 0xff;
  buffer[56] = msg.landedState & 0xff;

  return buffer;
}

export function deserializeAutopilotStateForGimbalDevice(payload: Uint8Array): AutopilotStateForGimbalDevice {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeBootUs: view.getBigUint64(0, true),
    q: Array.from({ length: 4 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    qEstimatedDelayUs: view.getUint32(24, true),
    vx: view.getFloat32(28, true),
    vy: view.getFloat32(32, true),
    vz: view.getFloat32(36, true),
    vEstimatedDelayUs: view.getUint32(40, true),
    feedForwardAngularVelocityZ: view.getFloat32(44, true),
    angularVelocityZ: view.getFloat32(48, true),
    estimatorStatus: view.getUint16(52, true),
    targetSystem: payload[54],
    targetComponent: payload[55],
    landedState: payload[56],
  };
}