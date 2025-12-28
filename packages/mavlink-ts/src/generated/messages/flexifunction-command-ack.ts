/**
 * Acknowledge success or failure of a flexifunction command
 * Message ID: 158
 * CRC Extra: 208
 */
export interface FlexifunctionCommandAck {
  /** Command acknowledged */
  commandType: number;
  /** result of acknowledge */
  result: number;
}

export const FLEXIFUNCTION_COMMAND_ACK_ID = 158;
export const FLEXIFUNCTION_COMMAND_ACK_CRC_EXTRA = 208;
export const FLEXIFUNCTION_COMMAND_ACK_MIN_LENGTH = 4;
export const FLEXIFUNCTION_COMMAND_ACK_MAX_LENGTH = 4;

export function serializeFlexifunctionCommandAck(msg: FlexifunctionCommandAck): Uint8Array {
  const buffer = new Uint8Array(4);
  const view = new DataView(buffer.buffer);

  view.setUint16(0, msg.commandType, true);
  view.setUint16(2, msg.result, true);

  return buffer;
}

export function deserializeFlexifunctionCommandAck(payload: Uint8Array): FlexifunctionCommandAck {
  const view = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);

  return {
    commandType: view.getUint16(0, true),
    result: view.getUint16(2, true),
  };
}