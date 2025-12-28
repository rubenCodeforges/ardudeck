/**
 * Message to a gimbal manager to correct the gimbal roll angle. This message is typically used to manually correct for a tilted horizon in operation. A gimbal device is never to react to this message.
 * Message ID: 60014
 * CRC Extra: 134
 */
export interface Storm32GimbalManagerCorrectRoll {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Gimbal ID of the gimbal manager to address (component ID or 1-6 for non-MAVLink gimbal, 0 for all gimbals). Send command multiple times for more than one but not all gimbals. */
  gimbalId: number;
  /** Client which is contacting the gimbal manager (must be set). */
  client: number;
  /** Roll angle (positive to roll to the right). (rad) */
  roll: number;
}

export const STORM32_GIMBAL_MANAGER_CORRECT_ROLL_ID = 60014;
export const STORM32_GIMBAL_MANAGER_CORRECT_ROLL_CRC_EXTRA = 134;
export const STORM32_GIMBAL_MANAGER_CORRECT_ROLL_MIN_LENGTH = 8;
export const STORM32_GIMBAL_MANAGER_CORRECT_ROLL_MAX_LENGTH = 8;

export function serializeStorm32GimbalManagerCorrectRoll(msg: Storm32GimbalManagerCorrectRoll): Uint8Array {
  const buffer = new Uint8Array(8);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.roll, true);
  buffer[4] = msg.targetSystem & 0xff;
  buffer[5] = msg.targetComponent & 0xff;
  buffer[6] = msg.gimbalId & 0xff;
  buffer[7] = msg.client & 0xff;

  return buffer;
}

export function deserializeStorm32GimbalManagerCorrectRoll(payload: Uint8Array): Storm32GimbalManagerCorrectRoll {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    roll: view.getFloat32(0, true),
    targetSystem: payload[4],
    targetComponent: payload[5],
    gimbalId: payload[6],
    client: payload[7],
  };
}