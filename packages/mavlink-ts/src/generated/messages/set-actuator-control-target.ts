/**
 * Set the vehicle attitude and body angular rates.
 * Message ID: 139
 * CRC Extra: 168
 */
export interface SetActuatorControlTarget {
  /** Timestamp (UNIX Epoch time or time since system boot). The receiving end can infer timestamp format (since 1.1.1970 or since system boot) by checking for the magnitude of the number. (us) */
  timeUsec: bigint;
  /** Actuator group. The "_mlx" indicates this is a multi-instance message and a MAVLink parser should use this field to difference between instances. */
  groupMlx: number;
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Actuator controls. Normed to -1..+1 where 0 is neutral position. Throttle for single rotation direction motors is 0..1, negative range for reverse direction. Standard mapping for attitude controls (group 0): (index 0-7): roll, pitch, yaw, throttle, flaps, spoilers, airbrakes, landing gear. Load a pass-through mixer to repurpose them as generic outputs. */
  controls: number[];
}

export const SET_ACTUATOR_CONTROL_TARGET_ID = 139;
export const SET_ACTUATOR_CONTROL_TARGET_CRC_EXTRA = 168;
export const SET_ACTUATOR_CONTROL_TARGET_MIN_LENGTH = 43;
export const SET_ACTUATOR_CONTROL_TARGET_MAX_LENGTH = 43;

export function serializeSetActuatorControlTarget(msg: SetActuatorControlTarget): Uint8Array {
  const buffer = new Uint8Array(43);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.timeUsec), true);
  // Array: controls
  for (let i = 0; i < 8; i++) {
    view.setFloat32(8 + i * 4, msg.controls[i] ?? 0, true);
  }
  buffer[40] = msg.groupMlx & 0xff;
  buffer[41] = msg.targetSystem & 0xff;
  buffer[42] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeSetActuatorControlTarget(payload: Uint8Array): SetActuatorControlTarget {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    timeUsec: view.getBigUint64(0, true),
    controls: Array.from({ length: 8 }, (_, i) => view.getFloat32(8 + i * 4, true)),
    groupMlx: payload[40],
    targetSystem: payload[41],
    targetComponent: payload[42],
  };
}