/**
 * Message encoding a command with parameters as scaled integers. Scaling depends on the actual command value. The command microservice is documented at https://mavlink.io/en/services/command.html
 * Message ID: 75
 * CRC Extra: 158
 */
export interface CommandInt {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** The coordinate system of the COMMAND. */
  frame: number;
  /** The scheduled action for the mission item. */
  command: number;
  /** Not used. */
  current: number;
  /** Not used (set 0). */
  autocontinue: number;
  /** PARAM1, see MAV_CMD enum */
  param1: number;
  /** PARAM2, see MAV_CMD enum */
  param2: number;
  /** PARAM3, see MAV_CMD enum */
  param3: number;
  /** PARAM4, see MAV_CMD enum */
  param4: number;
  /** PARAM5 / local: x position in meters * 1e4, global: latitude in degrees * 10^7 */
  x: number;
  /** PARAM6 / local: y position in meters * 1e4, global: longitude in degrees * 10^7 */
  y: number;
  /** PARAM7 / z position: global: altitude in meters (relative or absolute, depending on frame). */
  z: number;
}

export const COMMAND_INT_ID = 75;
export const COMMAND_INT_CRC_EXTRA = 158;
export const COMMAND_INT_MIN_LENGTH = 35;
export const COMMAND_INT_MAX_LENGTH = 35;

export function serializeCommandInt(msg: CommandInt): Uint8Array {
  const buffer = new Uint8Array(35);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.param1, true);
  view.setFloat32(4, msg.param2, true);
  view.setFloat32(8, msg.param3, true);
  view.setFloat32(12, msg.param4, true);
  view.setInt32(16, msg.x, true);
  view.setInt32(20, msg.y, true);
  view.setFloat32(24, msg.z, true);
  view.setUint16(28, msg.command, true);
  buffer[30] = msg.targetSystem & 0xff;
  buffer[31] = msg.targetComponent & 0xff;
  buffer[32] = msg.frame & 0xff;
  buffer[33] = msg.current & 0xff;
  buffer[34] = msg.autocontinue & 0xff;

  return buffer;
}

export function deserializeCommandInt(payload: Uint8Array): CommandInt {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    param1: view.getFloat32(0, true),
    param2: view.getFloat32(4, true),
    param3: view.getFloat32(8, true),
    param4: view.getFloat32(12, true),
    x: view.getInt32(16, true),
    y: view.getInt32(20, true),
    z: view.getFloat32(24, true),
    command: view.getUint16(28, true),
    targetSystem: payload[30],
    targetComponent: payload[31],
    frame: payload[32],
    current: payload[33],
    autocontinue: payload[34],
  };
}