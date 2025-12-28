/**
 * Send a command with up to seven parameters to the MAV and additional metadata
 * Message ID: 224
 * CRC Extra: 102
 */
export interface CommandLongStamped {
  /** UTC time, seconds elapsed since 01.01.1970 */
  utcTime: number;
  /** Microseconds elapsed since vehicle boot */
  vehicleTimestamp: bigint;
  /** System which should execute the command */
  targetSystem: number;
  /** Component which should execute the command, 0 for all components */
  targetComponent: number;
  /** Command ID, as defined by MAV_CMD enum. */
  command: number;
  /** 0: First transmission of this command. 1-255: Confirmation transmissions (e.g. for kill command) */
  confirmation: number;
  /** Parameter 1, as defined by MAV_CMD enum. */
  param1: number;
  /** Parameter 2, as defined by MAV_CMD enum. */
  param2: number;
  /** Parameter 3, as defined by MAV_CMD enum. */
  param3: number;
  /** Parameter 4, as defined by MAV_CMD enum. */
  param4: number;
  /** Parameter 5, as defined by MAV_CMD enum. */
  param5: number;
  /** Parameter 6, as defined by MAV_CMD enum. */
  param6: number;
  /** Parameter 7, as defined by MAV_CMD enum. */
  param7: number;
}

export const COMMAND_LONG_STAMPED_ID = 224;
export const COMMAND_LONG_STAMPED_CRC_EXTRA = 102;
export const COMMAND_LONG_STAMPED_MIN_LENGTH = 45;
export const COMMAND_LONG_STAMPED_MAX_LENGTH = 45;

export function serializeCommandLongStamped(msg: CommandLongStamped): Uint8Array {
  const buffer = new Uint8Array(45);
  const view = new DataView(buffer.buffer);

  view.setBigUint64(0, BigInt(msg.vehicleTimestamp), true);
  view.setUint32(8, msg.utcTime, true);
  view.setFloat32(12, msg.param1, true);
  view.setFloat32(16, msg.param2, true);
  view.setFloat32(20, msg.param3, true);
  view.setFloat32(24, msg.param4, true);
  view.setFloat32(28, msg.param5, true);
  view.setFloat32(32, msg.param6, true);
  view.setFloat32(36, msg.param7, true);
  view.setUint16(40, msg.command, true);
  buffer[42] = msg.targetSystem & 0xff;
  buffer[43] = msg.targetComponent & 0xff;
  buffer[44] = msg.confirmation & 0xff;

  return buffer;
}

export function deserializeCommandLongStamped(payload: Uint8Array): CommandLongStamped {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    vehicleTimestamp: view.getBigUint64(0, true),
    utcTime: view.getUint32(8, true),
    param1: view.getFloat32(12, true),
    param2: view.getFloat32(16, true),
    param3: view.getFloat32(20, true),
    param4: view.getFloat32(24, true),
    param5: view.getFloat32(28, true),
    param6: view.getFloat32(32, true),
    param7: view.getFloat32(36, true),
    command: view.getUint16(40, true),
    targetSystem: payload[42],
    targetComponent: payload[43],
    confirmation: payload[44],
  };
}