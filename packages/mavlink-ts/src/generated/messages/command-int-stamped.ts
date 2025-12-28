/**
 * Message encoding a command with parameters as scaled integers and additional metadata. Scaling depends on the actual command value.
 * Message ID: 223
 * CRC Extra: 119
 */
export interface CommandIntStamped {
  /** UTC time, seconds elapsed since 01.01.1970 */
  utcTime: number;
  /** Microseconds elapsed since vehicle boot */
  vehicleTimestamp: bigint;
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** The coordinate system of the COMMAND, as defined by MAV_FRAME enum */
  frame: number;
  /** The scheduled action for the mission item, as defined by MAV_CMD enum */
  command: number;
  /** false:0, true:1 */
  current: number;
  /** autocontinue to next wp */
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
  /** PARAM7 / z position: global: altitude in meters (MSL, WGS84, AGL or relative to home - depending on frame). */
  z: number;
}

export const COMMAND_INT_STAMPED_ID = 223;
export const COMMAND_INT_STAMPED_CRC_EXTRA = 119;
export const COMMAND_INT_STAMPED_MIN_LENGTH = 47;
export const COMMAND_INT_STAMPED_MAX_LENGTH = 47;

export function serializeCommandIntStamped(msg: CommandIntStamped): Uint8Array {
  const buffer = new Uint8Array(47);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.vehicleTimestamp), true);
  view.setUint32(8, msg.utcTime, true);
  view.setFloat32(12, msg.param1, true);
  view.setFloat32(16, msg.param2, true);
  view.setFloat32(20, msg.param3, true);
  view.setFloat32(24, msg.param4, true);
  view.setInt32(28, msg.x, true);
  view.setInt32(32, msg.y, true);
  view.setFloat32(36, msg.z, true);
  view.setUint16(40, msg.command, true);
  buffer[42] = msg.targetSystem & 0xff;
  buffer[43] = msg.targetComponent & 0xff;
  buffer[44] = msg.frame & 0xff;
  buffer[45] = msg.current & 0xff;
  buffer[46] = msg.autocontinue & 0xff;

  return buffer;
}

export function deserializeCommandIntStamped(payload: Uint8Array): CommandIntStamped {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    vehicleTimestamp: view.getBigUint64(0, true),
    utcTime: view.getUint32(8, true),
    param1: view.getFloat32(12, true),
    param2: view.getFloat32(16, true),
    param3: view.getFloat32(20, true),
    param4: view.getFloat32(24, true),
    x: view.getInt32(28, true),
    y: view.getInt32(32, true),
    z: view.getFloat32(36, true),
    command: view.getUint16(40, true),
    targetSystem: payload[42],
    targetComponent: payload[43],
    frame: payload[44],
    current: payload[45],
    autocontinue: payload[46],
  };
}