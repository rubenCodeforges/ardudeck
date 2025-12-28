/**
 * Acknowledge success or failure of a flexifunction command
 * Message ID: 157
 * CRC Extra: 133
 */
export interface FlexifunctionCommand {
  /** System ID */
  targetSystem: number;
  /** Component ID */
  targetComponent: number;
  /** Flexifunction command type */
  commandType: number;
}

export const FLEXIFUNCTION_COMMAND_ID = 157;
export const FLEXIFUNCTION_COMMAND_CRC_EXTRA = 133;
export const FLEXIFUNCTION_COMMAND_MIN_LENGTH = 3;
export const FLEXIFUNCTION_COMMAND_MAX_LENGTH = 3;

export function serializeFlexifunctionCommand(msg: FlexifunctionCommand): Uint8Array {
  const buffer = new Uint8Array(3);
  const view = new DataView(buffer.buffer);

  buffer[0] = msg.targetSystem & 0xff;
  buffer[1] = msg.targetComponent & 0xff;
  buffer[2] = msg.commandType & 0xff;

  return buffer;
}

export function deserializeFlexifunctionCommand(payload: Uint8Array): FlexifunctionCommand {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    targetSystem: payload[0],
    targetComponent: payload[1],
    commandType: payload[2],
  };
}