/**
 * Send a command with up to seven parameters to the MAV. The command microservice is documented at https://mavlink.io/en/services/command.html
 * Message ID: 76
 * CRC Extra: 152
 */
export interface CommandLong {
  /** System which should execute the command */
  targetSystem: number;
  /** Component which should execute the command, 0 for all components */
  targetComponent: number;
  /** Command ID (of command to send). */
  command: number;
  /** 0: First transmission of this command. 1-255: Confirmation transmissions (e.g. for kill command) */
  confirmation: number;
  /** Parameter 1 (for the specific command). */
  param1: number;
  /** Parameter 2 (for the specific command). */
  param2: number;
  /** Parameter 3 (for the specific command). */
  param3: number;
  /** Parameter 4 (for the specific command). */
  param4: number;
  /** Parameter 5 (for the specific command). */
  param5: number;
  /** Parameter 6 (for the specific command). */
  param6: number;
  /** Parameter 7 (for the specific command). */
  param7: number;
}

export const COMMAND_LONG_ID = 76;
export const COMMAND_LONG_CRC_EXTRA = 152;
export const COMMAND_LONG_MIN_LENGTH = 33;
export const COMMAND_LONG_MAX_LENGTH = 33;

export function serializeCommandLong(msg: CommandLong): Uint8Array {
  const buffer = new Uint8Array(33);
  const view = new DataView(buffer.buffer);

  view.setFloat32(0, msg.param1, true);
  view.setFloat32(4, msg.param2, true);
  view.setFloat32(8, msg.param3, true);
  view.setFloat32(12, msg.param4, true);
  view.setFloat32(16, msg.param5, true);
  view.setFloat32(20, msg.param6, true);
  view.setFloat32(24, msg.param7, true);
  view.setUint16(28, msg.command, true);
  buffer[30] = msg.targetSystem & 0xff;
  buffer[31] = msg.targetComponent & 0xff;
  buffer[32] = msg.confirmation & 0xff;

  return buffer;
}

export function deserializeCommandLong(payload: Uint8Array): CommandLong {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    param1: view.getFloat32(0, true),
    param2: view.getFloat32(4, true),
    param3: view.getFloat32(8, true),
    param4: view.getFloat32(12, true),
    param5: view.getFloat32(16, true),
    param6: view.getFloat32(20, true),
    param7: view.getFloat32(24, true),
    command: view.getUint16(28, true),
    targetSystem: payload[30],
    targetComponent: payload[31],
    confirmation: payload[32],
  };
}