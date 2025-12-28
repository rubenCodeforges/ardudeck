/**
 * Report status of a command. Includes feedback whether the command was executed. The command microservice is documented at https://mavlink.io/en/services/command.html
 * Message ID: 77
 * CRC Extra: 205
 */
export interface CommandAck {
  /** Command ID (of acknowledged command). */
  command: number;
  /** Result of command. */
  result: number;
  /** Also used as result_param1, it can be set with a enum containing the errors reasons of why the command was denied or the progress percentage or 255 if unknown the progress when result is MAV_RESULT_IN_PROGRESS. */
  progress: number;
  /** Additional parameter of the result, example: which parameter of MAV_CMD_NAV_WAYPOINT caused it to be denied. */
  resultParam2: number;
  /** System which requested the command to be executed */
  targetSystem: number;
  /** Component which requested the command to be executed */
  targetComponent: number;
}

export const COMMAND_ACK_ID = 77;
export const COMMAND_ACK_CRC_EXTRA = 205;
export const COMMAND_ACK_MIN_LENGTH = 10;
export const COMMAND_ACK_MAX_LENGTH = 10;

export function serializeCommandAck(msg: CommandAck): Uint8Array {
  const buffer = new Uint8Array(10);
  const view = new DataView(buffer.buffer);

  view.setInt32(0, msg.resultParam2, true);
  view.setUint16(4, msg.command, true);
  buffer[6] = msg.result & 0xff;
  buffer[7] = msg.progress & 0xff;
  buffer[8] = msg.targetSystem & 0xff;
  buffer[9] = msg.targetComponent & 0xff;

  return buffer;
}

export function deserializeCommandAck(payload: Uint8Array): CommandAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    resultParam2: view.getInt32(0, true),
    command: view.getUint16(4, true),
    result: payload[6],
    progress: payload[7],
    targetSystem: payload[8],
    targetComponent: payload[9],
  };
}